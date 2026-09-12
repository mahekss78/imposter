const { io } = require('socket.io-client');
const URL = 'http://localhost:3001';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('[Test Start] Initializing 3 Hosts...');
  
  const hostA = io(URL, { auth: { isHost: true } });
  const hostB = io(URL, { auth: { isHost: true } });
  const hostC = io(URL, { auth: { isHost: true } });

  let roomA, roomB, roomC;

  hostA.emit('create_room');
  hostB.emit('create_room');
  hostC.emit('create_room');

  hostA.on('room_created', id => { roomA = id; console.log(`Host A created room ${roomA}`); });
  hostB.on('room_created', id => { roomB = id; console.log(`Host B created room ${roomB}`); });
  hostC.on('room_created', id => { roomC = id; console.log(`Host C created room ${roomC}`); });

  await sleep(500);

  // Players join
  const pA1 = io(URL); const pA2 = io(URL);
  const pB1 = io(URL); const pB2 = io(URL);
  const pC1 = io(URL);
  
  let pA1Token, pB1Token;

  pA1.emit('join_room', roomA, 'PlayerA1');
  pA2.emit('join_room', roomA, 'PlayerA2');
  pB1.emit('join_room', roomB, 'PlayerB1');
  pB2.emit('join_room', roomB, 'PlayerB2');
  pC1.emit('join_room', roomC, 'PlayerC1');

  pA1.on('join_success', (data) => { pA1Token = data.token; });
  pB1.on('join_success', (data) => { pB1Token = data.token; });

  await sleep(500);

  console.log('\n[Step 1] Starting games...');
  hostA.emit('force_start', roomA);
  hostB.emit('force_start', roomB);
  
  await sleep(100);
  
  let pB1TurnState;
  pB1.on('sync_state', (state) => {
    if (state.turn) pB1TurnState = state.turn;
  });

  // Step: Mid-turn refresh Host A
  console.log(`\n[Step 2] Refreshing Host A...`);
  hostA.disconnect();
  await sleep(200);
  const hostA_Refreshed = io(URL, { auth: { isHost: true } });
  // (In real life host would resume state, for this test we just ensure no one else is affected)
  
  // Step: Refresh Player A1 mid-turn
  console.log(`\n[Step 3] Refreshing Player A1 (mid-turn)...`);
  pA1.disconnect();
  await sleep(200);
  const pA1_Refreshed = io(URL, { auth: { token: pA1Token } });
  pA1_Refreshed.on('connect', () => {
    pA1_Refreshed.emit('resume_session');
  });
  
  pA1_Refreshed.on('sync_state', (state) => {
      if (state.turn) {
          console.log(`Player A1 reconnected. Active Player: ${state.turn.activePlayerId}, Remaining time: ${state.turn.remainingMs}ms`);
      }
  });

  // Step: Multi-tab Player B1 (Tab 2)
  console.log(`\n[Step 4] Opening Player B1 in Tab 2...`);
  const pB1_Tab2 = io(URL, { auth: { token: pB1Token } });
  pB1_Tab2.on('connect', () => {
    pB1_Tab2.emit('resume_session');
  });

  await sleep(500);
  console.log(`Attempting submit from older Tab 1...`);
  
  pB1.on('error', err => console.log(`Tab 1 error: ${err}`));
  pB1.emit('submit_turn'); // Tab 1 was original socket

  // Step: Host B disconnects mid-turn, wait for timeout
  console.log(`\n[Step 5] Host B disconnects... wait for auto-advance`);
  hostB.disconnect();
  
  let prevActiveB = pB1TurnState ? pB1TurnState.activePlayerId : null;
  console.log(`Current active in Room B: ${prevActiveB}`);
  
  // Wait enough for the 15s timer to expire (I'll sleep for 15.5s)
  console.log(`Waiting 15.5 seconds for turn timeout in Room B...`);
  await sleep(15500);
  
  console.log(`Host B game state after timeout (from Player B1's view):`);
  console.log(`New active player in Room B: ${pB1TurnState ? pB1TurnState.activePlayerId : 'Unknown'}`);
  if (pB1TurnState && prevActiveB !== pB1TurnState.activePlayerId) {
      console.log(`SUCCESS: Turn automatically advanced despite Host B being offline.`);
  } else {
      console.log(`FAIL: Turn did not advance.`);
  }
  
  process.exit(0);
}

runTest();
