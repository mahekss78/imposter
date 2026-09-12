const { io } = require('socket.io-client');
const URL = 'http://localhost:3001';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('[Test Start] Initializing Stress Test...');
  
  let isolationViolations = 0;
  let turnsExecuted = 0;
  let skippedTurns = 0;
  let expectedTurns = 100;
  
  const hostA = io(URL, { auth: { isHost: true } });
  const hostB = io(URL, { auth: { isHost: true } });
  const hostC = io(URL, { auth: { isHost: true } });

  let roomA, roomB, roomC;

  hostA.emit('create_room');
  hostB.emit('create_room');
  hostC.emit('create_room');

  const pRoomA = new Promise(res => hostA.on('room_created', id => { roomA = id; res(); }));
  const pRoomB = new Promise(res => hostB.on('room_created', id => { roomB = id; res(); }));
  const pRoomC = new Promise(res => hostC.on('room_created', id => { roomC = id; res(); }));

  await Promise.all([pRoomA, pRoomB, pRoomC]);
  console.log(`Rooms created: A=${roomA}, B=${roomB}, C=${roomC}`);

  const playersA = [];
  
  // Cross-room isolation checker
  function attachIsolationCheck(socket, allowedPrefix) {
    socket.on('sync_state', (state) => {
      if (!state.players) return;
      for (const p of state.players) {
        if (!p.name.startsWith(allowedPrefix)) {
          isolationViolations++;
          console.error(`[ISOLATION LEAK] Socket ${socket.id} received data for ${p.name}`);
        }
      }
    });
  }

  attachIsolationCheck(hostA, 'PlayerA');
  attachIsolationCheck(hostB, 'PlayerB');
  attachIsolationCheck(hostC, 'PlayerC');

  // Join 100 players to Room A
  const joinPromises = [];
  for (let i = 0; i < expectedTurns; i++) {
    const p = io(URL);
    playersA.push(p);
    attachIsolationCheck(p, 'PlayerA');
    p.emit('join_room', roomA, `PlayerA_${i}`);
    joinPromises.push(new Promise(res => p.on('join_success', res)));
  }

  // Join 1 player to B and C
  const pB = io(URL); attachIsolationCheck(pB, 'PlayerB');
  pB.emit('join_room', roomB, 'PlayerB_1');
  joinPromises.push(new Promise(res => pB.on('join_success', res)));
  
  const pC = io(URL); attachIsolationCheck(pC, 'PlayerC');
  pC.emit('join_room', roomC, 'PlayerC_1');
  joinPromises.push(new Promise(res => pC.on('join_success', res)));

  await Promise.all(joinPromises);
  console.log(`Joined 100 players to Room A, 1 to B, 1 to C.`);

  // To track exactly how many times the turn advances, we watch Host A's sync_state
  let currentActivePlayer = null;
  const seenPlayers = new Set();
  let sequenceErrors = 0;

  hostA.on('sync_state', (state) => {
    if (state.state === 'IN_GAME' && state.turn) {
      if (currentActivePlayer !== state.turn.activePlayerId) {
        turnsExecuted++;
        currentActivePlayer = state.turn.activePlayerId;
        
        if (seenPlayers.has(currentActivePlayer)) {
            sequenceErrors++;
            console.error(`[SEQUENCE ERROR] Player ${currentActivePlayer} got a second turn!`);
        }
        seenPlayers.add(currentActivePlayer);
        
        const playerIndex = parseInt(currentActivePlayer.split('_')[1]);
        
        // Find the player's socket and fire at deadline ± 50ms
        const socket = playersA[playerIndex];
        
        const jitter = Math.floor(Math.random() * 100) - 50; // -50 to +50
        const fireDelay = state.turn.remainingMs + jitter;
        
        setTimeout(() => {
          socket.emit('submit_turn');
        }, fireDelay);
      }
    }
  });

  console.log(`[Testing] Starting 100 iterations of race condition...`);
  hostA.emit('force_start', roomA);

  // Wait for game to end
  await new Promise(res => {
    hostA.on('sync_state', (state) => {
      if (state.state === 'GAME_END') res();
    });
  });

  console.log(`\n=== STRESS TEST RESULTS ===`);
  console.log(`Target iterations: ${expectedTurns}`);
  console.log(`Turns explicitly advanced: ${turnsExecuted}`);
  console.log(`Sequence errors (skips/repeats): ${sequenceErrors}`);
  
  if (turnsExecuted === expectedTurns && sequenceErrors === 0) {
    console.log(`Race condition mutex test: PASSED (0 double-advances, 0 skips)`);
  } else {
    console.log(`Race condition mutex test: FAILED (Double advanced ${expectedTurns - turnsExecuted} times, ${sequenceErrors} sequence errors)`);
  }
  
  if (isolationViolations === 0) {
    console.log(`Cross-room isolation test: PASSED (0 leaks detected)`);
  } else {
    console.log(`Cross-room isolation test: FAILED (${isolationViolations} leaks detected)`);
  }
  
  process.exit(0);
}

runTest();
