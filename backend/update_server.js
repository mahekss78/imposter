const fs = require('fs');
let code = fs.readFileSync('src/server.js', 'utf8');

// Update resume_session to include wordDescription
code = code.replace(
  "socket.emit('private_role', { role: player.role, word: player.word });",
  "socket.emit('private_role', { role: player.role, word: player.word, wordDescription: player.wordDescription });"
);

// Update force_start to include wordDescription
code = code.replace(
  "if (p.active) io.to(p.socketId).emit('private_role', { role: p.role, word: p.word });",
  "if (p.active) io.to(p.socketId).emit('private_role', { role: p.role, word: p.word, wordDescription: p.wordDescription });"
);

// Add player_ready_for_turn event
const readyEvent = `
  socket.on('player_ready_for_turn', () => {
    const room = getRoom(socket.roomId);
    if (!room || room.state !== 'ROUND_CLUES' || !room.turn) return;
    if (room.turn.activePlayerId !== socket.playerId) return;
    if (!room.turn.isWaitingForReady) return;

    room.turn.isWaitingForReady = false;
    const duration = 30000;
    room.turn.deadline = Date.now() + duration;
    room.turn.timeoutId = setTimeout(() => {
      if (room.turn.turnResolved) return;
      room.turn.turnResolved = true;
      startNextTurn(room);
    }, duration);
    io.to(room.id).emit('sync_state', getRoomState(room));
  });
`;
code = code.replace("socket.on('submit_clue'", readyEvent + "\n  socket.on('submit_clue'");

// Update getRoomState to include isWaitingForReady
code = code.replace(
  "turn: room.turn ? { activePlayerId: room.turn.activePlayerId, remainingMs } : null,",
  "turn: room.turn ? { activePlayerId: room.turn.activePlayerId, remainingMs, isWaitingForReady: !!room.turn.isWaitingForReady } : null,"
);

// Update startNextTurn
const newStartNextTurn = `function startNextTurn(room) {
  const nextPlayerId = room.order.shift(); 
  if (!nextPlayerId) {
    startVoting(room);
    return;
  }
  const isFirstTurnOfRound = (room.chat.length === 0);
  if (isFirstTurnOfRound) {
    room.turn = {
      activePlayerId: nextPlayerId, deadline: null, turnResolved: false, timeoutId: null, isWaitingForReady: true
    };
    io.to(room.id).emit('sync_state', getRoomState(room));
  } else {
    const duration = 30000;
    room.turn = {
      activePlayerId: nextPlayerId, deadline: Date.now() + duration, turnResolved: false, isWaitingForReady: false,
      timeoutId: setTimeout(() => {
        if (room.turn.turnResolved) return;
        room.turn.turnResolved = true;
        startNextTurn(room);
      }, duration)
    };
    io.to(room.id).emit('sync_state', getRoomState(room));
  }
}`;
code = code.replace(/function startNextTurn\(room\) \{[\s\S]*?\}(?=\n\nfunction startVoting)/, newStartNextTurn);

// Update endVoting leaderboard
code = code.replace(
  "id, name: p.name, role: p.role, score: p.score, correctVotes: p.correctVotes, confidencePoints: p.confidencePoints",
  "id, name: p.name, role: p.role, score: p.score, correctVotes: p.correctVotes, confidencePoints: p.confidencePoints, roundScores: p.roundScores"
);

fs.writeFileSync('src/server.js', code);
console.log('updated server.js');
