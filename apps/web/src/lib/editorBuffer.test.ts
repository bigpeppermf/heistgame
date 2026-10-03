import { afterEach, describe, expect, it, vi } from 'vitest';
import { bufferKey, loadBuffer, saveBuffer } from './editorBuffer.js';

describe('editor buffer persistence', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('restores exact edited text for the same room, player, problem and language', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    });
    const key = bufferKey('ABC123', 'player-a', 'problem-1', 'python');
    saveBuffer(key, 'print("saved")\n');
    expect(loadBuffer(key)).toBe('print("saved")\n');
    expect(loadBuffer(bufferKey('ABC123', 'player-a', 'problem-1', 'javascript'))).toBeNull();
    expect(loadBuffer(bufferKey('ABC123', 'player-a', 'problem-2', 'python'))).toBeNull();
    expect(loadBuffer(bufferKey('ABC123', 'player-b', 'problem-1', 'python'))).toBeNull();
    expect(loadBuffer(bufferKey('XYZ789', 'player-a', 'problem-1', 'python'))).toBeNull();
  });

  it('preserves an intentionally empty buffer and tolerates unavailable storage', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    });
    const key = bufferKey('ABC123', 'player-a', 'problem-1', 'python');
    saveBuffer(key, '');
    expect(loadBuffer(key)).toBe('');
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    });
    expect(loadBuffer(key)).toBeNull();
    expect(() => saveBuffer(key, 'new code')).not.toThrow();
  });
});
