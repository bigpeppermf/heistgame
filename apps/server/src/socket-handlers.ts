import { randomUUID } from 'node:crypto';
import { problemForRound, type ClientToServerEvents, type Language, type PowerupType, type ServerToClientEvents } from '@heist/shared';
import type { Server } from 'socket.io';
import { EFFECTS } from './match/effects.js';
import type { MatchRegistry } from './match/registry.js';
import { execute } from './exec/runner.js';

type RunCode = typeof execute;
type Ack = (result: { ok: true; data: unknown } | { ok: false; error: string }) => void;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function roomPayload(value: unknown): value is { roomCode: string; nickname: string } {
  return record(value) && typeof value.roomCode === 'string' && value.roomCode.length > 0
    && typeof value.nickname === 'string';
}

function codePayload(value: unknown): value is { code: string; language: Language } {
  return record(value) && typeof value.code === 'string'
    && (value.language === 'python' || value.language === 'javascript');
}

function powerupPayload(value: unknown): value is { type: PowerupType } {
  return record(value) && typeof value.type === 'string'
    && Object.hasOwn(EFFECTS, value.type);
}

export function registerSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  registry: MatchRegistry,
  sockets: Map<string, string>,
  runCode: RunCode = execute,
): void {
  io.on('connection', (socket) => {
    let roomCode: string | null = null;
    let playerId: string | null = null;

    const error = (code: string) => socket.emit('error_msg', { code, message: code });
    const requireAck = (ack: unknown): ack is Ack => {
      if (typeof ack === 'function') return true;
      error('MISSING_ACK');
      return false;
    };
    const bind = (code: string, id: string) => {
      roomCode = code;
      playerId = id;
      sockets.set(id, socket.id);
    };
    // A completed (or already swept) match must not lock this connection forever.
    const releaseFinishedMatch = () => {
      if (!roomCode || !playerId) return;
      const match = registry.get(roomCode);
      if (match && match.phase !== 'GAME_OVER') return;
      if (sockets.get(playerId) === socket.id) {
        sockets.delete(playerId);
        match?.setConnected(playerId, false);
      }
      roomCode = null;
      playerId = null;
    };
    const alreadyBound = (ack: Ack, code: string, id?: string): boolean => {
      if (!roomCode || !playerId || (roomCode === code && playerId === id)) return false;
      ack({ ok: false, error: 'ALREADY_IN_MATCH' });
      return true;
    };

    socket.on('create_room', (payload: unknown, ack: unknown) => {
      if (!requireAck(ack)) return;
      if (!record(payload) || typeof payload.nickname !== 'string') return ack({ ok: false, error: 'INVALID_PAYLOAD' });
      releaseFinishedMatch();
      if (roomCode) return ack({ ok: false, error: 'ALREADY_IN_MATCH' });
      const created = registry.create(payload.nickname.slice(0, 20) || 'Anonymous');
      bind(created.roomCode, created.playerId);
      ack({ ok: true, data: created });
      const match = registry.get(created.roomCode);
      if (match) socket.emit('snapshot', match.snapshotFor(created.playerId));
    });

    socket.on('join_room', (payload: unknown, ack: unknown) => {
      if (!requireAck(ack)) return;
      if (!roomPayload(payload)) return ack({ ok: false, error: 'INVALID_PAYLOAD' });
      releaseFinishedMatch();
      if (roomCode) return ack({ ok: false, error: 'ALREADY_IN_MATCH' });
      const match = registry.get(payload.roomCode);
      if (!match) return ack({ ok: false, error: 'NO_SUCH_ROOM' });
      const joined = match.addPlayer(payload.nickname.slice(0, 20) || 'Anonymous');
      if (!joined.ok) return ack(joined);
      bind(match.roomCode, joined.data.playerId);
      ack({ ok: true, data: { playerId: joined.data.playerId } });
      socket.emit('snapshot', match.snapshotFor(joined.data.playerId));
    });

    socket.on('rejoin', (payload: unknown, ack: unknown) => {
      if (!requireAck(ack)) return;
      if (!record(payload) || typeof payload.roomCode !== 'string' || !payload.roomCode
        || typeof payload.playerId !== 'string' || !payload.playerId) {
        return ack({ ok: false, error: 'INVALID_PAYLOAD' });
      }
      const match = registry.get(payload.roomCode);
      if (!match) return ack({ ok: false, error: 'NO_SUCH_ROOM' });
      if (alreadyBound(ack, match.roomCode, payload.playerId)) return;
      if (!match.players.some((p) => p.id === payload.playerId)) return ack({ ok: false, error: 'NO_SUCH_PLAYER' });
      bind(match.roomCode, payload.playerId);
      match.setConnected(payload.playerId, true);
      ack({ ok: true, data: { ok: true } });
    });

    socket.on('code_sync', (payload: unknown) => {
      if (!codePayload(payload)) return error('INVALID_PAYLOAD');
      if (!roomCode || !playerId) return error('NOT_IN_MATCH');
      registry.get(roomCode)?.syncCode(playerId, payload.code, payload.language);
    });

    socket.on('run', async (payload: unknown, ack: unknown) => {
      if (!requireAck(ack)) return;
      if (!codePayload(payload)) return ack({ ok: false, error: 'INVALID_PAYLOAD' });
      if (!roomCode || !playerId) return ack({ ok: false, error: 'NOT_IN_MATCH' });
      const match = registry.get(roomCode);
      if (!match) return ack({ ok: false, error: 'NO_SUCH_ROOM' });
      const allowed = match.canRun(playerId, Date.now());
      if (!allowed.ok) return ack(allowed);
      const runId = randomUUID();
      ack({ ok: true, data: { runId } });
      try {
        const problem = problemForRound(match.round);
        const out = await runCode({
          language: payload.language,
          code: payload.code,
          functionName: problem.functionName[payload.language],
          tests: problem.sampleTests,
          comparison: problem.comparison,
        });
        socket.emit('run_output', { runId, results: out.results, stdout: out.stdout, stderr: out.stderr });
      } catch {
        socket.emit('run_output', { runId, results: [], stdout: '', stderr: 'RUN_FAILED' });
      }
    });

    socket.on('submit', (payload: unknown, ack: unknown) => {
      if (!requireAck(ack)) return;
      if (!codePayload(payload)) return ack({ ok: false, error: 'INVALID_PAYLOAD' });
      if (!roomCode || !playerId) return ack({ ok: false, error: 'NOT_IN_MATCH' });
      const match = registry.get(roomCode);
      if (!match) return ack({ ok: false, error: 'NO_SUCH_ROOM' });
      ack(match.submit(playerId, payload.code, payload.language));
    });

    socket.on('use_powerup', (payload: unknown, ack: unknown) => {
      if (!requireAck(ack)) return;
      if (!powerupPayload(payload)) return ack({ ok: false, error: 'INVALID_PAYLOAD' });
      if (!roomCode || !playerId) return ack({ ok: false, error: 'NOT_IN_MATCH' });
      const match = registry.get(roomCode);
      if (!match) return ack({ ok: false, error: 'NO_SUCH_ROOM' });
      ack(match.usePowerup(playerId, payload.type));
    });

    socket.on('choose_powerup', (payload: unknown, ack: unknown) => {
      if (!requireAck(ack)) return;
      if (!powerupPayload(payload)) return ack({ ok: false, error: 'INVALID_PAYLOAD' });
      if (!roomCode || !playerId) return ack({ ok: false, error: 'NOT_IN_MATCH' });
      const match = registry.get(roomCode);
      if (!match) return ack({ ok: false, error: 'NO_SUCH_ROOM' });
      ack(match.chooseOffer(playerId, payload.type));
    });

    socket.on('disconnect', () => {
      if (!roomCode || !playerId) return;
      if (sockets.get(playerId) !== socket.id) return;
      registry.get(roomCode)?.setConnected(playerId, false);
      sockets.delete(playerId);
    });
  });
}
