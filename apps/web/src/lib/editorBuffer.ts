import type { Language } from '@heist/shared';

export function bufferKey(roomCode: string, playerId: string, problemId: string, language: Language): string {
  return `heistcode.buffer:${JSON.stringify([roomCode, playerId, problemId, language])}`;
}

export function loadBuffer(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

export function saveBuffer(key: string, code: string): void {
  try { sessionStorage.setItem(key, code); } catch { /* private mode */ }
}
