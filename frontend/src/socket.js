import { io } from 'socket.io-client';

const backendUrl = import.meta.env.VITE_BACKEND_URL || (window.location.protocol + '//' + window.location.hostname + ':3001');

export const socket = io(backendUrl, {
  autoConnect: true,
});
