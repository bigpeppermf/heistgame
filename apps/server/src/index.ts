import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@heist/shared';
import { execute } from './exec/runner.js';
import { judgeStyle } from './judge/gemini.js';
import { MatchRegistry } from './match/registry.js';
import { registerSocketHandlers } from './socket-handlers.js';

const PORT = Number(process.env.PORT ?? 4000);
const ORIGIN = process.env.CORS_ORIGIN ?? '*';
const FAST = process.env.FAST_MATCH === '1';
const TICK_MS = 250;

const app = express();
app.use(cors({ origin: ORIGIN }));
app.get('/health', (_req, res) => res.json({ ok: true }));

const http = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
  cors: { origin: ORIGIN },
});

/** playerId -> socketId, so the engine can address players it knows nothing about. */
const sockets = new Map<string, string>();
const registry = new MatchRegistry({
  now: () => Date.now(),
  emit: (playerId, ev, payload) => {
    const socketId = sockets.get(playerId);
    if (socketId) io.to(socketId).emit(ev as keyof ServerToClientEvents, payload as never);
  },
  execute,
  judgeStyle,
  fast: FAST,
});
registerSocketHandlers(io, registry, sockets);

setInterval(() => {
  const now = Date.now();
  void registry.tickAll(now);
  registry.sweep(now);
}, TICK_MS);

http.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`heistcode server on :${PORT} fast=${FAST}`);
});
