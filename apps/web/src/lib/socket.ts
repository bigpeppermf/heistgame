'use client';

import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@heist/shared';

export type HeistSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: HeistSocket | null = null;

export function getSocket(): HeistSocket {
  socket ??= io(process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:4000', {
    transports: ['websocket'],
  });
  return socket;
}

type AckResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Promisified emit-with-ack, so callers can await a server decision. */
export function ask<T>(
  event: keyof ClientToServerEvents,
  payload: unknown,
): Promise<AckResult<T>> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'TIMEOUT' }), 8_000);
    // The event name is dynamic, so the typed emit overloads cannot be used here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (getSocket() as any).emit(event, payload, (res: AckResult<T>) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

const KEY = 'heistcode.session';

export type Session = { roomCode: string; playerId: string };

export function saveSession(s: Session): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
