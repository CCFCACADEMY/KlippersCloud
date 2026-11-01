/** Shared Socket.IO client (real-time slots, queue, push notifications). */
import { io } from 'socket.io-client';
import { getAccessToken } from './api';

let socket = null;
export function getSocket() {
  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL || undefined, {
      autoConnect: true, transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: getAccessToken() }),
    });
  }
  return socket;
}
/** Reconnect so the server re-reads the (new) access token. */
export function resetSocketAuth() {
  if (socket) { socket.disconnect(); socket.connect(); }
}
