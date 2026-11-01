/**
 * Socket.IO for real-time features:
 *  - `user:<id>` rooms receive push-style notifications
 *  - `barber:<id>` rooms receive slot/queue changes (live availability updates)
 *  - `location:<id>` rooms receive walk-in queue updates (lobby display)
 */
import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt.js';
import { env } from '../config/env.js';

let io = null;

export function initSocket(httpServer) {
  io = new Server(httpServer, { cors: { origin: env.clientUrl.split(','), credentials: true } });
  io.on('connection', (socket) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const { sub } = verifyAccessToken(token);
        socket.join(`user:${sub}`);
      } catch { /* anonymous socket — public rooms only */ }
    }
    // Public rooms: anyone may watch a barber's availability or a location queue
    socket.on('subscribe', (room) => {
      if (typeof room === 'string' && /^(barber|location):[0-9a-f-]{36}$/.test(room)) socket.join(room);
    });
    socket.on('unsubscribe', (room) => typeof room === 'string' && socket.leave(room));
  });
  return io;
}

/** Emit safely even when sockets aren't initialised (tests, scripts). */
export function emit(room, event, payload) {
  if (io) io.to(room).emit(event, payload);
}
