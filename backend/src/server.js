
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const { getRoom, createRoom, assignRoles, calculateScoring, verifySessionToken, generateSessionToken } = require('./roomManager');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    socket.isHost = socket.handshake.auth.isHost === true;
    return next();
  }
  const payload = verifySessionToken(token);
  if (!payload) return next(new Error('Invalid token'));
  socket.roomId = payload.roomId;
  socket.playerId = payload.playerId;
  next();
});

io.on('connection', (socket) => {
  
  socket.on('create_room', (config) => {
    const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    createRoom(roomId, config);
    // Host doesn't permanently join via this packet, they will navigate and emit join_host
    socket.emit('room_created', roomId);
  });

  socket.on('join_host', (roomId) => {
    const room = getRoom(roomId);
    if (!room) return socket.emit('error', 'Room not found');
    socket.join(roomId);
    socket.emit('sync_state', getRoomState(room));
  });

  socket.on('join_room', (roomId, playerName) => {
    const room = getRoom(roomId);
    if (!room) return socket.emit('error', 'Room not found');
    if (room.state !== 'LOBBY_OPEN') return socket.emit('error', 'Game already started');

    const playerId = playerName.toLowerCase().replace(/\s/g, '');
    if (room.players.has(playerId)) return socket.emit('error', 'Name taken.');

    const token = generateSessionToken(roomId, playerId);
    room.players.set(playerId, { name: playerName, socketId: socket.id, active: true, role: null, word: null, score: 0, correctVotes: 0, confidencePoints: 0 });
    socket.roomId = roomId; socket.playerId = playerId;
    
    socket.join(roomId);
    socket.emit('join_success', { token, playerId });
    io.to(roomId).emit('sync_state', getRoomState(room));
  });

  socket.on('resume_session', () => {
    if (!socket.roomId || !socket.playerId) return;
    const room = getRoom(socket.roomId);
    if (!room) return socket.emit('error', 'Room not found');
    const player = room.players.get(socket.playerId);
    if (player) {
      player.socketId = socket.id;
      player.active = true;
      socket.join(socket.roomId);
      socket.emit('sync_state', getRoomState(room));
      if (room.state !== 'LOBBY_OPEN' && player.role) {
        socket.emit('private_role', { role: player.role, word: player.word });
      }
    }
  });

  socket.on('force_start', (roomId) => {
    const room = getRoom(roomId);
    if (!room || room.state !== 'LOBBY_OPEN') return;
    if (room.players.size < 3) return socket.emit('error', 'Need at least 3 players to start');
    
    assignRoles(room);
    
    for (const [pId, p] of room.players.entries()) {
      if (p.active) io.to(p.socketId).emit('private_role', { role: p.role, word: p.word });
    }
    
    room.state = 'ROUND_CLUES';
    
    room.order = Array.from(room.players.entries())
      .filter(([id, p]) => p.active)
      .map(([id]) => id)
      .sort(() => Math.random() - 0.5);
      
    startNextTurn(room);
  });

  socket.on('submit_clue', (clueText) => {
    const room = getRoom(socket.roomId);
    if (!room || room.state !== 'ROUND_CLUES' || !room.turn) return;
    if (room.turn.activePlayerId !== socket.playerId) return;
    const player = room.players.get(socket.playerId);
    if (!player || player.socketId !== socket.id) return;
    if (room.turn.turnResolved) return;
    
    room.turn.turnResolved = true;
    clearTimeout(room.turn.timeoutId);
    
    room.chat.push({ senderName: player.name, text: clueText });
    startNextTurn(room);
  });

  socket.on('submit_vote', (data) => {
    const room = getRoom(socket.roomId);
    if (!room || room.state !== 'VOTING' || !room.turn) return;
    const player = room.players.get(socket.playerId);
    if (!player || player.socketId !== socket.id) return;
    if (data.voteFor === socket.playerId) return socket.emit('error', 'Cannot vote for yourself');
    
    let roundVotes = room.votes.get(room.currentRound);
    if (!roundVotes) {
      roundVotes = new Map();
      room.votes.set(room.currentRound, roundVotes);
    }
    if (roundVotes.has(socket.playerId)) return socket.emit('error', 'Already voted');
    
    roundVotes.set(socket.playerId, { voteFor: data.voteFor, confidence: data.confidence });
    io.to(room.id).emit('sync_state', getRoomState(room));
    
    let allVoted = true;
    for (const [id, p] of room.players.entries()) {
      if (p.active && !roundVotes.has(id)) allVoted = false;
    }
    if (allVoted) {
      if (room.turn.turnResolved) return;
      room.turn.turnResolved = true;
      clearTimeout(room.turn.timeoutId);
      endVoting(room);
    }
  });

  socket.on('disconnect', () => {
    if (socket.roomId && socket.playerId) {
      const room = getRoom(socket.roomId);
      if (room) {
        const player = room.players.get(socket.playerId);
        if (player && player.socketId === socket.id) {
           player.active = false;
           io.to(socket.roomId).emit('sync_state', getRoomState(room));
        }
      }
    }
  });
});

function getRoomState(room) {
  let remainingMs = 0;
  if (room.turn && !room.turn.turnResolved) remainingMs = room.turn.deadline - Date.now();
  
  return {
    id: room.id,
    state: room.state,
    currentRound: room.currentRound,
    turn: room.turn ? { activePlayerId: room.turn.activePlayerId, remainingMs } : null,
    players: Array.from(room.players.entries()).map(([id, p]) => ({ id, name: p.name, active: p.active })),
    chat: room.chat,
    config: room.config,
    leaderboard: room.state === 'GAME_END' ? room.leaderboard : null,
    votesSubmitted: room.state === 'VOTING' ? Array.from((room.votes.get(room.currentRound) || new Map()).keys()) : []
  };
}

function startNextTurn(room) {
  const nextPlayerId = room.order.shift(); 
  if (!nextPlayerId) {
    startVoting(room);
    return;
  }
  const duration = 30000;
  room.turn = {
    activePlayerId: nextPlayerId, deadline: Date.now() + duration, turnResolved: false,
    timeoutId: setTimeout(() => {
      if (room.turn.turnResolved) return;
      room.turn.turnResolved = true;
      startNextTurn(room);
    }, duration)
  };
  io.to(room.id).emit('sync_state', getRoomState(room));
}

function startVoting(room) {
  room.state = 'VOTING';
  const duration = 45000;
  room.turn = {
    activePlayerId: null, deadline: Date.now() + duration, turnResolved: false,
    timeoutId: setTimeout(() => {
      if (room.turn.turnResolved) return;
      room.turn.turnResolved = true;
      endVoting(room);
    }, duration)
  };
  io.to(room.id).emit('sync_state', getRoomState(room));
}

function endVoting(room) {
  calculateScoring(room);
  
  if (room.currentRound >= room.config.rounds) {
    room.state = 'GAME_END';
    room.leaderboard = Array.from(room.players.entries()).map(([id, p]) => ({
      id, name: p.name, role: p.role, score: p.score, correctVotes: p.correctVotes, confidencePoints: p.confidencePoints
    })).sort((a,b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.correctVotes !== a.correctVotes) return b.correctVotes - a.correctVotes;
      return b.confidencePoints - a.confidencePoints;
    });
    io.to(room.id).emit('sync_state', getRoomState(room));
  } else {
    room.state = 'ROUND_WAIT';
    io.to(room.id).emit('sync_state', getRoomState(room));
    setTimeout(() => {
      room.currentRound++;
      room.chat = [];
      room.order = Array.from(room.players.entries())
        .filter(([id, p]) => p.active)
        .map(([id]) => id)
        .sort(() => Math.random() - 0.5);
      room.state = 'ROUND_CLUES';
      startNextTurn(room);
    }, 5000);
  }
}

server.listen(3001, () => { console.log('Server running on 3001'); });
