import { createServer } from 'node:http';
import { once } from 'node:events';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientToServerEvents, ServerToClientEvents } from '@heist/shared';
import { MatchRegistry } from './match/registry.js';
import { registerSocketHandlers } from './socket-handlers.js';

type Reply = { ok: boolean; error?: string; data?: { roomCode?: string; playerId?: string; runId?: string } };
const clients: Socket[] = [];
const servers: Server[] = [];

async function setup(runCode?: Parameters<typeof registerSocketHandlers>[3]) {
  const http = createServer();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(http);
  const sockets = new Map<string, string>();
  const registry = new MatchRegistry({
    now: Date.now,
    emit: (id, event, payload) => {
      const socketId = sockets.get(id);
      if (socketId) io.to(socketId).emit(event as keyof ServerToClientEvents, payload as never);
    },
    execute: async () => ({ results: [], stdout: '', stderr: '', timedOut: false, outputCapped: false, passed: 0 }),
    judgeStyle: async () => ({ naming: 0, readability: 0, comments: 0, organization: 0, simplicity: 0, note: '' }),
    fast: true,
  });
  registerSocketHandlers(io, registry, sockets, runCode);
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('missing port');
  servers.push(io);
  const client = connect(`http://127.0.0.1:${address.port}`, { forceNew: true, reconnection: false });
  clients.push(client);
  await next(client, 'connect');
  return { client, registry };
}

function next(client: Socket, event: string): Promise<any[]> {
  return new Promise((resolve) => client.once(event, (...args: any[]) => resolve(args)));
}

function ask(client: Socket, event: string, payload: unknown): Promise<Reply> {
  return new Promise((resolve, reject) => {
    client.timeout(1000).emit(event, payload, (err: Error | null, reply: Reply) => {
      if (err) reject(err);
      else resolve(reply);
    });
  });
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('socket handler boundaries', () => {
  it('rejects malformed payloads for all eight events and missing acknowledgments without changing the match', async () => {
    const { client, registry } = await setup();
    for (const event of ['create_room', 'join_room', 'rejoin', 'run', 'submit', 'use_powerup', 'choose_powerup']) {
      expect(await ask(client, event, null)).toEqual({ ok: false, error: 'INVALID_PAYLOAD' });
    }
    client.emit('code_sync', null);
    expect((await next(client, 'error_msg'))[0].code).toBe('INVALID_PAYLOAD');
    client.emit('create_room', { nickname: 'No ack' });
    expect((await next(client, 'error_msg'))[0].code).toBe('MISSING_ACK');
    client.emit('join_room', { roomCode: 'ABCDEF', nickname: 'No ack' });
    expect((await next(client, 'error_msg'))[0].code).toBe('MISSING_ACK');
    client.emit('rejoin', { roomCode: 'ABCDEF', playerId: 'x' });
    expect((await next(client, 'error_msg'))[0].code).toBe('MISSING_ACK');
    expect(registry.size).toBe(0);

    const created = await ask(client, 'create_room', { nickname: 'Danny' });
    expect(created.ok).toBe(true);
    const match = registry.get(created.data!.roomCode!)!;
    match.phase = 'CODING';
    const player = match.players[0]!;
    for (const event of ['run', 'submit', 'use_powerup', 'choose_powerup']) {
      client.emit(event, event === 'use_powerup' || event === 'choose_powerup'
        ? { type: 'SHIELD' } : { code: 'mutate', language: 'python' });
      expect((await next(client, 'error_msg'))[0].code).toBe('MISSING_ACK');
    }
    expect(player.lastRunAt).toBe(0);
    expect(player.submission).toBeNull();
    expect(player.buffer.code).toBe('');
  });

  it('keeps one socket bound to its first player while allowing same-player rejoin', async () => {
    const { client, registry } = await setup();
    const first = await ask(client, 'create_room', { nickname: 'First' });
    const code = first.data!.roomCode!;
    const id = first.data!.playerId!;
    expect((await ask(client, 'rejoin', { roomCode: code, playerId: id })).ok).toBe(true);
    expect((await ask(client, 'create_room', { nickname: 'Second' })).error).toBe('ALREADY_IN_MATCH');
    expect((await ask(client, 'join_room', { roomCode: code, nickname: 'Second' })).error).toBe('ALREADY_IN_MATCH');
    const other = registry.create('Other');
    expect((await ask(client, 'rejoin', other)).error).toBe('ALREADY_IN_MATCH');
    expect(registry.get(code)!.players[0]!.connected).toBe(true);
    expect(registry.get(code)!.players).toHaveLength(1);
  });

  it('lets the same connection create another game after game over', async () => {
    const { client, registry } = await setup();
    const first = await ask(client, 'create_room', { nickname: 'First' });
    const finished = registry.get(first.data!.roomCode!)!;
    finished.phase = 'GAME_OVER';
    const second = await ask(client, 'create_room', { nickname: 'Second' });
    expect(second.ok).toBe(true);
    expect(second.data!.roomCode).not.toBe(first.data!.roomCode);
    expect(finished.players[0]!.connected).toBe(false);
    expect(registry.get(second.data!.roomCode!)!.players[0]!.connected).toBe(true);
    expect((await ask(client, 'rejoin', second.data)).ok).toBe(true);
  });

  it('lets the same connection join another game after game over', async () => {
    const { client, registry } = await setup();
    const first = await ask(client, 'create_room', { nickname: 'First' });
    const finished = registry.get(first.data!.roomCode!)!;
    finished.phase = 'GAME_OVER';
    const nextRoom = registry.create('Host');
    const joined = await ask(client, 'join_room', { roomCode: nextRoom.roomCode, nickname: 'Returning' });
    expect(joined.ok).toBe(true);
    expect(finished.players[0]!.connected).toBe(false);
    const newMatch = registry.get(nextRoom.roomCode)!;
    expect(newMatch.players).toHaveLength(2);
    expect(newMatch.phase).toBe('ROLE_REVEAL');
    expect((await ask(client, 'rejoin', { roomCode: nextRoom.roomCode, playerId: joined.data!.playerId })).ok).toBe(true);
  });

  it('sends a terminal run result with the acknowledged runId when execution rejects', async () => {
    const runCode = vi.fn(async () => { throw new Error('secret filesystem path'); });
    const { client, registry } = await setup(runCode);
    const created = await ask(client, 'create_room', { nickname: 'Runner' });
    const match = registry.get(created.data!.roomCode!)!;
    match.phase = 'CODING';
    match.round = 1;
    const output = next(client, 'run_output');
    const reply = await ask(client, 'run', { code: 'print(1)', language: 'python' });
    expect(reply.ok).toBe(true);
    expect((await output)[0]).toEqual({ runId: reply.data!.runId, results: [], stdout: '', stderr: 'RUN_FAILED' });
    expect(runCode).toHaveBeenCalledOnce();
  });
});
