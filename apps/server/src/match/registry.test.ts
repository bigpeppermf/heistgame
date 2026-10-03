import { describe, expect, it } from 'vitest';
import { BALANCE } from '@heist/shared';
import { MatchRegistry } from './registry.js';

function registry() {
  let clock = 5_000_000;
  const reg = new MatchRegistry({
    now: () => clock,
    emit: () => {},
    execute: async () => ({ results: [], stdout: '', stderr: '', timedOut: false, passed: 0 }),
    judgeStyle: async () => ({
      naming: 0, readability: 0, comments: 0, organization: 0, simplicity: 0, note: '',
    }),
    fast: true,
  });
  return { reg, advance: (ms: number) => { clock += ms; }, at: () => clock };
}

describe('MatchRegistry', () => {
  it('creates a match with a six-character uppercase room code', () => {
    const { reg } = registry();
    const { roomCode } = reg.create('Danny');
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(reg.get(roomCode)).toBeDefined();
  });

  it('issues distinct room codes', () => {
    const { reg } = registry();
    const codes = new Set(Array.from({ length: 50 }, () => reg.create('P').roomCode));
    expect(codes.size).toBe(50);
  });

  it('returns undefined for an unknown code', () => {
    const { reg } = registry();
    expect(reg.get('ZZZZZZ')).toBeUndefined();
  });

  it('is case-insensitive on lookup, since players type the code by hand', () => {
    const { reg } = registry();
    const { roomCode } = reg.create('Danny');
    expect(reg.get(roomCode.toLowerCase())).toBeDefined();
  });

  it('sweeps a match once both players have been gone past the destroy window', () => {
    const { reg, advance, at } = registry();
    const { roomCode, playerId } = reg.create('Danny');
    const engine = reg.get(roomCode)!;
    const second = engine.addPlayer('Rusty');
    if (!second.ok) throw new Error('setup failed');

    engine.setConnected(playerId, false);
    engine.setConnected(second.data.playerId, false);
    advance(BALANCE.MATCH_DESTROY_MS + 1);
    reg.sweep(at());

    expect(reg.get(roomCode)).toBeUndefined();
    expect(reg.size).toBe(0);
  });

  it('keeps a match whose player is still connected', () => {
    const { reg, advance, at } = registry();
    const { roomCode } = reg.create('Danny');
    advance(BALANCE.MATCH_DESTROY_MS * 3);
    reg.sweep(at());
    expect(reg.get(roomCode)).toBeDefined();
  });
});
