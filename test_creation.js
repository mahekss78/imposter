const io = require('socket.io-client');

const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('Connected!');
  socket.auth = { isHost: true };
  socket.emit('create_room', { maxPlayers: 3, imposters: 1, rounds: 1, genre: 'general' });
});

socket.on('room_created', (roomId) => {
  console.log('Room created:', roomId);
  // Emulate host redirecting and joining
  socket.emit('join_host', roomId);
});

socket.on('sync_state', (state) => {
  console.log('Received sync_state! State:', state.state);
  process.exit(0);
});

socket.on('error', (err) => {
  console.error('Error:', err);
  process.exit(1);
});
