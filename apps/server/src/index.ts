import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import type { ClientToServerEvents, ServerToClientEvents } from '@heist/shared';
import { execute } from './exec/runner.js';
import { judgeStyle } from './judge/gemini.js';
import { MatchRegistry } from './match/registry.js';
import { problemForRound } from '@heist/shared';

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

setInterval(() => {
  const now = Date.now();
  void registry.tickAll(now);
  registry.sweep(now);
}, TICK_MS);

io.on('connection', (socket) => {
  let roomCode: string | null = null;
  let playerId: string | null = null;

  const bind = (code: string, id: string) => {
    roomCode = code;
    playerId = id;
    sockets.set(id, socket.id);
  };

  socket.on('create_room', ({ nickname }, ack) => {
    const created = registry.create(nickname.slice(0, 20) || 'Anonymous');
    bind(created.roomCode, created.playerId);
    ack({ ok: true, data: created });
  });

  socket.on('join_room', ({ roomCode: code, nickname }, ack) => {
    const match = registry.get(code);
    if (!match) return ack({ ok: false, error: 'NO_SUCH_ROOM' });
    const joined = match.addPlayer(nickname.slice(0, 20) || 'Anonymous');
    if (!joined.ok) return ack(joined);
    bind(match.roomCode, joined.data.playerId);
    ack({ ok: true, data: { playerId: joined.data.playerId } });
  });

  socket.on('rejoin', ({ roomCode: code, playerId: id }, ack) => {
    const match = registry.get(code);
    if (!match) return ack({ ok: false, error: 'NO_SUCH_ROOM' });
    if (!match.players.some((p) => p.id === id)) return ack({ ok: false, error: 'NO_SUCH_PLAYER' });
    bind(match.roomCode, id);
    match.setConnected(id, true);
    ack({ ok: true, data: { ok: true } });
  });

  socket.on('code_sync', ({ code, language }) => {
    if (!roomCode || !playerId) return;
    registry.get(roomCode)?.syncCode(playerId, code, language);
  });

  socket.on('run', async ({ code, language }, ack) => {
    if (!roomCode || !playerId) return ack({ ok: false, error: 'NOT_IN_MATCH' });
    const match = registry.get(roomCode);
    if (!match) return ack({ ok: false, error: 'NO_SUCH_ROOM' });

    // Server-side gate. A disabled button is only the display of this rule.
    const allowed = match.canRun(playerId, Date.now());
    if (!allowed.ok) return ack(allowed);

    const runId = randomUUID();
    ack({ ok: true, data: { runId } });

    const problem = problemForRound(match.round);
    const out = await execute({
      language,
      code,
      functionName: problem.functionName[language],
      tests: problem.sampleTests,
      comparison: problem.comparison,
    });
    socket.emit('run_output', {
      runId, results: out.results, stdout: out.stdout, stderr: out.stderr,
    });
  });

  socket.on('submit', ({ code, language }, ack) => {
    if (!roomCode || !playerId) return ack({ ok: false, error: 'NOT_IN_MATCH' });
    const match = registry.get(roomCode);
    if (!match) return ack({ ok: false, error: 'NO_SUCH_ROOM' });
    ack(match.submit(playerId, code, language));
  });

  socket.on('use_powerup', ({ type }, ack) => {
    if (!roomCode || !playerId) return ack({ ok: false, error: 'NOT_IN_MATCH' });
    const match = registry.get(roomCode);
    if (!match) return ack({ ok: false, error: 'NO_SUCH_ROOM' });
    ack(match.usePowerup(playerId, type));
  });

  socket.on('choose_powerup', ({ type }, ack) => {
    if (!roomCode || !playerId) return ack({ ok: false, error: 'NOT_IN_MATCH' });
    const match = registry.get(roomCode);
    if (!match) return ack({ ok: false, error: 'NO_SUCH_ROOM' });
    ack(match.chooseOffer(playerId, type));
  });

  socket.on('disconnect', () => {
    if (!roomCode || !playerId) return;
    // A reloading player may have already rebound to a new socket; do not
    // clobber the new mapping when the old socket's disconnect arrives late.
    if (sockets.get(playerId) !== socket.id) return;
    registry.get(roomCode)?.setConnected(playerId, false);
    sockets.delete(playerId);
  });
});

http.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`heistcode server on :${PORT} fast=${FAST}`);
});
