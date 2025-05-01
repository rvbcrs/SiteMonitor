import { io } from 'socket.io-client';

// Get the current hostname dynamically
const hostname = window.location.hostname;
const port = '3001';

export const socket = io(`http://${hostname}:${port}`, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling'],
  withCredentials: true
});

socket.on('connect', () => {
  console.log('Socket connected');
  if ('Notification' in window) {
    Notification.requestPermission();
  }
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
});