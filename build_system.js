const fs = require('fs');

const roomManagerCode = `
const jwt = require('jsonwebtoken');
const JWT_SECRET = 'super-secret-key-poc';

const GENRES = {
  ai: ['Neural Network', 'Algorithm', 'Data', 'Robot'],
  it: ['Server', 'Cloud', 'Network', 'Router'],
  tech: ['Smartphone', 'Laptop', 'Processor', 'Battery'],
  cybersecurity: ['Firewall', 'Hacker', 'Encryption', 'Malware'],
  locations: ['Hospital', 'School', 'Bank', 'Beach'],
  general: ['Apple', 'Car', 'House', 'Tree']
};

const rooms = new Map();

function getRoom(roomId) { return rooms.get(roomId); }

function createRoom(roomId, config) {
  const room = {
    id: roomId,
    state: 'LOBBY_OPEN',
    config: config || { maxPlayers: 8, imposters: 1, rounds: 3, genre: 'general' },
    players: new Map(),
    currentRound: 1,
    turn: null,
    order: [],
    secretWord: '',
    chat: [],
    votes: new Map(),
    impostersList: [],
    leaderboard: []
  };
  rooms.set(roomId, room);
  return room;
}

function assignRoles(room) {
  const playerIds = Array.from(room.players.keys());
  for (let i = playerIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]];
  }
  
  const numImposters = room.config.imposters;
  room.impostersList = playerIds.slice(0, numImposters);
  
  const pool = GENRES[room.config.genre] || GENRES.general;
  room.secretWord = pool[Math.floor(Math.random() * pool.length)];

  for (const [id, player] of room.players.entries()) {
    player.score = 0;
    player.correctVotes = 0;
    player.confidencePoints = 0;
    if (room.impostersList.includes(id)) {
      player.role = 'imposter';
      player.word = null;
    } else {
      player.role = 'crew';
      player.word = room.secretWord;
    }
  }
}

function calculateScoring(room) {
  const round = room.currentRound;
  const votesThisRound = room.votes.get(round) || new Map();
  const maxBonus = round === 1 ? 2 : (round === 2 ? 3 : 4);
  const baseCorrectScore = round;
  
  let activeCrewIds = [];
  for (const [id, p] of room.players.entries()) {
    if (p.role === 'crew' && p.active) activeCrewIds.push(id);
  }
  const N = activeCrewIds.length;

  room.impostersList.forEach(impId => {
    let C = 0;
    activeCrewIds.forEach(crewId => {
      const v = votesThisRound.get(crewId);
      if (v && v.voteFor === impId) C++;
    });

    const impPlayer = room.players.get(impId);
    if (C === N && N > 0) impPlayer.score += 0;
    else if (C === 0 || N === 0) impPlayer.score += maxBonus;
    else impPlayer.score += Math.floor(maxBonus / 2);
  });

  activeCrewIds.forEach(crewId => {
    const v = votesThisRound.get(crewId);
    if (!v) return;
    let isCorrect = room.impostersList.includes(v.voteFor);
    
    if (isCorrect) {
      room.players.get(crewId).score += baseCorrectScore;
      room.players.get(crewId).correctVotes += 1;
    }
    
    if (round >= 2 && v.confidence) {
      let betScore = 0;
      if (v.confidence >= 90) betScore = 2;
      else if (v.confidence >= 70) betScore = 1;
      
      if (isCorrect) {
        room.players.get(crewId).score += betScore;
        room.players.get(crewId).confidencePoints += betScore;
      } else {
        room.players.get(crewId).score -= betScore;
        room.players.get(crewId).confidencePoints -= betScore;
      }
    }
  });
}

function generateSessionToken(roomId, playerId) { return jwt.sign({ roomId, playerId }, JWT_SECRET, { expiresIn: '12h' }); }
function verifySessionToken(token) { try { return jwt.verify(token, JWT_SECRET); } catch (err) { return null; } }

module.exports = { rooms, getRoom, createRoom, assignRoles, calculateScoring, generateSessionToken, verifySessionToken };
`;

fs.writeFileSync('backend/src/roomManager.js', roomManagerCode);

const serverCode = `
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

    const playerId = playerName.toLowerCase().replace(/\\s/g, '');
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
`;
fs.writeFileSync('backend/src/server.js', serverCode);

const appCode = `
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import { socket } from './socket';

export default function App() {
  const [gameState, setGameState] = useState(null);
  const [localDeadline, setLocalDeadline] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [error, setError] = useState('');
  const [myPlayerId, setMyPlayerId] = useState('');
  const [privateRole, setPrivateRole] = useState(null);
  const [roleAcknowledged, setRoleAcknowledged] = useState(false);

  useEffect(() => {
    socket.on('connect', () => {
      if (localStorage.getItem('sessionToken')) socket.emit('resume_session');
    });
    socket.on('join_success', (data) => { 
      setMyPlayerId(data.playerId); 
      localStorage.setItem('sessionToken', data.token); 
      setError(''); 
    });
    socket.on('error', (msg) => setError(msg));
    socket.on('sync_state', (state) => {
      setGameState(state);
      if (state.turn && state.turn.remainingMs > 0) setLocalDeadline(Date.now() + state.turn.remainingMs);
      else setLocalDeadline(0);
    });
    socket.on('private_role', (data) => {
       setPrivateRole(data);
       setRoleAcknowledged(false); 
    });

    return () => {
      socket.off('connect'); socket.off('join_success'); socket.off('error'); 
      socket.off('sync_state'); socket.off('private_role');
    };
  }, []);

  useEffect(() => {
    if (localDeadline === 0) return;
    let frameId;
    const tick = () => {
      const remaining = Math.max(0, localDeadline - Date.now());
      setTimeRemaining(Math.ceil(remaining / 1000));
      if (remaining > 0) frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [localDeadline]);

  return (
    <BrowserRouter>
      <div style={{ fontFamily: 'sans-serif', margin: '0 auto', maxWidth: 800, padding: 20 }}>
        {error && <div style={{background:'red', color:'white', padding:10, marginBottom:20}}>{error}</div>}
        <Routes>
          <Route path="/" element={<HostLanding />} />
          <Route path="/create" element={<CreateGame />} />
          <Route path="/host/:roomId" element={<HostView gameState={gameState} timeRemaining={timeRemaining} />} />
          <Route path="/:roomId" element={<PlayerFlow gameState={gameState} myPlayerId={myPlayerId} privateRole={privateRole} timeRemaining={timeRemaining} roleAcknowledged={roleAcknowledged} setRoleAcknowledged={setRoleAcknowledged} />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

function HostLanding() {
  const nav = useNavigate();
  return (
    <div style={{textAlign:'center', marginTop:100}}>
      <h1>IMPOSTER GAME</h1>
      <h3 style={{color:'gray'}}>[ HOST ]</h3>
      <br/>
      <button onClick={() => nav('/create')} style={{padding:'15px 30px', fontSize:18, cursor:'pointer', background:'black', color:'white'}}>Start the game</button>
    </div>
  );
}

function CreateGame() {
  const nav = useNavigate();
  const [config, setConfig] = useState({ maxPlayers: 8, imposters: 1, rounds: 3, genre: 'general' });
  
  useEffect(() => {
    const handleRoomCreated = (id) => nav(\`/host/\${id}\`);
    socket.on('room_created', handleRoomCreated);
    return () => socket.off('room_created', handleRoomCreated);
  }, [nav]);

  const createRoom = () => {
    socket.auth.isHost = true;
    socket.disconnect().connect();
    socket.emit('create_room', config);
  };

  const genres = ['AI', 'IT', 'Tech', 'Cybersecurity', 'Locations', 'General'];

  return (
    <div style={{maxWidth:400, margin:'0 auto'}}>
      <h2>CREATE GAME</h2>
      <div style={{marginBottom: 15}}>
        <label>Number of Players <br/>
          <select value={config.maxPlayers} onChange={e=>setConfig({...config, maxPlayers:parseInt(e.target.value)})} style={{padding:5, width:'100%'}}>
             {[3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <div style={{marginBottom: 15}}>
        <label>Imposters <br/>
          <select value={config.imposters} onChange={e=>setConfig({...config, imposters:parseInt(e.target.value)})} style={{padding:5, width:'100%'}}>
             {[1,2].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <div style={{marginBottom: 15}}>
        <label>Rounds <br/>
          <select value={config.rounds} onChange={e=>setConfig({...config, rounds:parseInt(e.target.value)})} style={{padding:5, width:'100%'}}>
             {[1,2,3].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <div style={{marginBottom: 15}}>
        <label>Genre <br/>
          {genres.map(g => (
             <div key={g}>
               <input type="radio" checked={config.genre === g.toLowerCase()} onChange={() => setConfig({...config, genre: g.toLowerCase()})} /> {g}
             </div>
          ))}
        </label>
      </div>
      <br/>
      <button onClick={createRoom} style={{padding:'10px 20px', background:'black', color:'white', width:'100%'}}>CREATE ROOM</button>
    </div>
  );
}

function HostView({ gameState, timeRemaining }) {
  const { roomId } = useParams();
  
  useEffect(() => {
    if (roomId) {
      socket.auth.isHost = true;
      socket.emit('join_host', roomId);
    }
  }, [roomId]);
  
  if (!gameState) return <p style={{textAlign:'center', marginTop:50}}>Loading room...</p>;

  if (gameState.state === 'LOBBY_OPEN') {
    const joined = gameState.players.filter(p => p.active).length;
    const max = gameState.config.maxPlayers;
    const allJoined = joined >= max;

    return (
      <div style={{textAlign:'center'}}>
        <h2>IMPOSTER GAME</h2>
        <h3>ROOM: {roomId}</h3>
        <p style={{marginBottom:10}}>SCAN QR TO JOIN</p>
        <div style={{margin:'20px 0', display:'inline-block'}}>
           <img src={\`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=\${window.location.origin}/\${roomId}\`} alt="QR Code" />
        </div>
        <p>or</p>
        <p>Join: <b>{window.location.host}/{roomId}</b></p>
        <hr/>
        <h3>PLAYERS</h3>
        <div style={{textAlign:'left', maxWidth: 200, margin:'0 auto'}}>
          {Array.from({length: max}).map((_, i) => (
             <p key={i}>{i+1}. {gameState.players[i]?.active ? gameState.players[i].name : '—'}</p>
          ))}
        </div>
        <br/>
        <p>{joined} / {max} JOINED</p>
        <button 
          onClick={() => socket.emit('force_start', roomId)} 
          disabled={!allJoined}
          style={{padding:'10px 20px', background: allJoined ? 'green' : 'gray', color:'white', cursor: allJoined ? 'pointer' : 'not-allowed', width:'200px'}}
        >
          START GAME
        </button>
      </div>
    );
  }
  
  if (gameState.state === 'GAME_END') {
    return (
      <div style={{textAlign:'center'}}>
        <h1>GAME OVER</h1>
        <h2>FINAL LEADERBOARD</h2>
        <table style={{margin:'0 auto', textAlign:'left', borderSpacing:10, fontSize:20}}>
          <tbody>
            {gameState.leaderboard.map((p, i) => (
               <tr key={p.id}>
                 <td>{i+1}.</td>
                 <td style={{minWidth:150}}>{p.name}</td>
                 <td style={{fontWeight:'bold'}}>{p.score}</td>
               </tr>
            ))}
          </tbody>
        </table>
        <br/>
        <h2 style={{color:'green'}}>🏆 WINNER: {gameState.leaderboard[0]?.name}</h2>
        <br/><br/>
        <button onClick={() => window.location.href='/'} style={{padding:'15px 30px', background:'black', color:'white'}}>NEW GAME</button>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{textAlign:'center'}}>IMPOSTER GAME - ROOM: {roomId}</h2>
      <h3 style={{textAlign:'center'}}>ROUND {gameState.currentRound}</h3>
      <hr/>
      {gameState.state === 'ROUND_CLUES' && gameState.turn && (
        <div style={{textAlign:'center', margin:'40px 0'}}>
          <p style={{fontSize:20}}>CURRENT TURN</p>
          <h2 style={{fontSize:48, margin:0}}>{gameState.players.find(p=>p.id===gameState.turn.activePlayerId)?.name}</h2>
          <h1 style={{color:'red', fontSize:64, margin:0}}>{timeRemaining}</h1>
        </div>
      )}
      
      {gameState.state === 'VOTING' && (
        <div style={{textAlign:'center', margin:'40px 0'}}>
          <h2 style={{color:'orange'}}>VOTING IN PROGRESS</h2>
          <p style={{fontSize:24}}>{gameState.votesSubmitted.length} / {gameState.players.filter(p => p.active).length} VOTES</p>
          <h1 style={{color:'red', fontSize:64, margin:0}}>{timeRemaining}</h1>
        </div>
      )}

      {gameState.state === 'ROUND_WAIT' && <h2 style={{textAlign:'center'}}>Calculating Round Results...</h2>}
      
      <hr/>
      <h3 style={{textAlign:'center'}}>CLUES</h3>
      <div style={{textAlign:'left', maxWidth:400, margin:'0 auto'}}>
         {gameState.players.filter(p=>p.active).map(p => {
           const clue = gameState.chat.find(c => c.senderName === p.name);
           return (
             <p key={p.id} style={{fontFamily:'monospace', fontSize:18, borderBottom:'1px solid #ccc', paddingBottom:5}}>
               <b>{p.name.padEnd(10, ' ')}</b> {clue ? clue.text : '...'}
             </p>
           );
         })}
      </div>
    </div>
  );
}

function PlayerFlow({ gameState, myPlayerId, privateRole, timeRemaining, roleAcknowledged, setRoleAcknowledged }) {
  const { roomId } = useParams();
  const [name, setName] = useState('');
  const [clueInput, setClueInput] = useState('');
  const [voteFor, setVoteFor] = useState('');
  const [confidence, setConfidence] = useState(100);

  const joinGame = (e) => {
    e.preventDefault();
    socket.auth.isHost = false;
    socket.disconnect().connect();
    socket.emit('join_room', roomId, name);
  };

  if (!gameState || gameState.state === 'LOBBY_OPEN') {
     if (!myPlayerId) {
       return (
         <div style={{textAlign:'center', marginTop:50}}>
           <h2>JOIN GAME</h2>
           <p>ROOM: {roomId.toUpperCase()}</p>
           <form onSubmit={joinGame}>
             <input placeholder="Player Name" value={name} onChange={e=>setName(e.target.value)} required style={{padding:10, fontSize:16, width:'80%', maxWidth:300}}/><br/><br/>
             <button type="submit" style={{padding:'10px 20px', background:'black', color:'white', width:'80%', maxWidth:300}}>JOIN GAME</button>
           </form>
         </div>
       );
     }
     
     const max = gameState ? gameState.config.maxPlayers : 8;
     const joined = gameState ? gameState.players.filter(p=>p.active).length : 1;
     return (
       <div style={{textAlign:'center', marginTop:50}}>
         <h2>WAITING FOR HOST</h2>
         <p>ROOM: {roomId.toUpperCase()}</p>
         <div style={{textAlign:'left', maxWidth:200, margin:'0 auto'}}>
           <h3 style={{textAlign:'center'}}>PLAYERS</h3>
           {Array.from({length: max}).map((_, i) => {
             const p = gameState?.players[i];
             return <p key={i}>{p?.active ? '✓' : '○'} {p?.active ? p.name : '—'}</p>;
           })}
         </div>
         <p style={{fontWeight:'bold'}}>{joined} / {max} JOINED</p>
         <p style={{color:'gray', fontStyle:'italic'}}>Waiting for host to start...</p>
       </div>
     );
  }

  if (privateRole && !roleAcknowledged) {
    return (
      <div style={{textAlign:'center', marginTop:50, padding:20}}>
         <h2>YOUR IDENTITY</h2>
         {privateRole.role === 'imposter' ? (
           <div style={{background:'black', color:'red', padding:40, margin:'20px 0'}}>
             <h1>YOU ARE THE IMPOSTER</h1>
             <p>Blend in.<br/>Give believable clues.<br/>Do not reveal yourself.</p>
           </div>
         ) : (
           <div style={{background:'lightblue', color:'black', padding:40, margin:'20px 0'}}>
             <p>SECRET WORD</p>
             <h1>{privateRole.word}</h1>
           </div>
         )}
         <p style={{color:'red', fontWeight:'bold', marginBottom:40}}>Do not show this to anyone.</p>
         <button onClick={() => setRoleAcknowledged(true)} style={{padding:'15px 60px', background:'black', color:'white', fontSize:20}}>NEXT</button>
      </div>
    );
  }

  if (gameState.state === 'GAME_END') {
     return (
       <div style={{textAlign:'center', marginTop:20}}>
         <h1>GAME OVER</h1>
         <h2>FINAL LEADERBOARD</h2>
         <table style={{margin:'0 auto', textAlign:'left', borderSpacing:10, fontSize:18}}>
           <tbody>
             {gameState.leaderboard.map((p, i) => (
                <tr key={p.id}>
                  <td>{i+1}.</td>
                  <td style={{minWidth:120}}>{p.name}</td>
                  <td style={{fontWeight:'bold'}}>{p.score}</td>
                </tr>
             ))}
           </tbody>
         </table>
         <br/>
         <h2 style={{color:'green'}}>🏆 WINNER: {gameState.leaderboard[0]?.name}</h2>
       </div>
     );
  }

  return (
    <div style={{textAlign:'center', marginTop:10}}>
      <div style={{textAlign:'right'}}>
         <button onClick={() => setRoleAcknowledged(false)} style={{fontSize:12, padding:5, cursor:'pointer'}}>VIEW MY ROLE</button>
      </div>
      
      <h2>ROUND {gameState.currentRound}</h2>
      
      {gameState.state === 'ROUND_CLUES' && gameState.turn && (
         <div>
            {gameState.turn.activePlayerId === myPlayerId ? (
               <div style={{background:'#eee', padding:20, borderRadius:8}}>
                 <h3>YOUR TURN</h3>
                 <p>Give a clue related to the secret word.</p>
                 <h1 style={{color:'red'}}>{timeRemaining}</h1>
                 <form onSubmit={(e) => { e.preventDefault(); socket.emit('submit_clue', clueInput); setClueInput(''); }}>
                   <input value={clueInput} onChange={e=>setClueInput(e.target.value)} placeholder="Enter your clue..." required style={{padding:15, width:'90%', fontSize:16}}/><br/><br/>
                   <button type="submit" style={{padding:'15px 30px', background:'green', color:'white', width:'90%', fontSize:18, border:'none', borderRadius:5}}>SUBMIT CLUE</button>
                 </form>
               </div>
            ) : (
               <div style={{padding:20}}>
                 <h3 style={{color:'gray'}}>WAIT FOR YOUR TURN</h3>
                 <p>Current player: <b>{gameState.players.find(p=>p.id===gameState.turn.activePlayerId)?.name}</b></p>
                 <h1 style={{color:'red'}}>{timeRemaining}</h1>
               </div>
            )}
            <hr/>
            <h3>Clues</h3>
            <div style={{textAlign:'left'}}>
               {gameState.players.filter(p=>p.active).map(p => {
                 const clue = gameState.chat.find(c => c.senderName === p.name);
                 return (
                   <p key={p.id}><b>{p.name}:</b> {clue ? clue.text : '...'}</p>
                 );
               })}
            </div>
         </div>
      )}

      {gameState.state === 'VOTING' && (
         <div style={{textAlign:'left', maxWidth:400, margin:'0 auto'}}>
           <h3 style={{textAlign:'center'}}>WHO DO YOU THINK IS THE IMPOSTER?</h3>
           {gameState.votesSubmitted.includes(myPlayerId) ? (
             <div style={{textAlign:'center', marginTop:50}}>
               <h2 style={{color:'green'}}>VOTE SUBMITTED ✓</h2>
               <p>WAITING FOR OTHER PLAYERS...</p>
               <p style={{color:'gray'}}>Round {gameState.currentRound} will continue when voting is complete.</p>
             </div>
           ) : (
             <form onSubmit={(e) => { e.preventDefault(); socket.emit('submit_vote', { voteFor, confidence: parseInt(confidence) }); }}>
               <div style={{background:'#f9f9f9', padding:20, borderRadius:8}}>
                 {gameState.players.filter(p => p.id !== myPlayerId && p.active).map(p => (
                   <div key={p.id} style={{margin:'15px 0', borderBottom:'1px solid #ddd', paddingBottom:10}}>
                     <label style={{fontSize:20, display:'flex', alignItems:'center', cursor:'pointer'}}>
                       <input type="radio" name="vote" value={p.id} onChange={e=>setVoteFor(e.target.value)} required style={{transform:'scale(1.5)', marginRight:15}}/>
                       {p.name}
                     </label>
                   </div>
                 ))}
               </div>
               
               {gameState.currentRound >= 2 && (
                 <div style={{marginTop:30, padding:20, background:'#eef', borderRadius:8}}>
                   <p style={{fontWeight:'bold', textAlign:'center'}}>How confident are you?</p>
                   <input type="range" min="50" max="100" value={confidence} onChange={e=>setConfidence(e.target.value)} style={{width:'100%', margin:'10px 0'}}/>
                   <div style={{display:'flex', justifyContent:'space-between', fontWeight:'bold'}}>
                     <span>50%</span>
                     <span style={{color:'blue'}}>{confidence}%</span>
                     <span>100%</span>
                   </div>
                 </div>
               )}
               
               <br/>
               <button type="submit" style={{width:'100%', padding:20, background:'black', color:'white', fontSize:20, border:'none', borderRadius:5}}>SUBMIT VOTE</button>
             </form>
           )}
         </div>
      )}

      {gameState.state === 'ROUND_WAIT' && (
         <div style={{textAlign:'center', marginTop:50}}>
            <h2 style={{color:'green'}}>VOTING COMPLETE ✓</h2>
            <p>Waiting for next round...</p>
         </div>
      )}
    </div>
  );
}
`;
fs.writeFileSync('frontend/src/App.jsx', appCode);
