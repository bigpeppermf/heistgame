import { describe, expect, it } from 'vitest';
import { BALANCE, FAST_MATCH_PHASE_MS } from '@heist/shared';
import { MatchRegistry } from './registry.js';

function registry(fast = true) {
  let clock = 5_000_000;
  const reg = new MatchRegistry({
    now: () => clock,
    emit: () => {},
    execute: async () => ({ results: [], stdout: '', stderr: '', timedOut: false, outputCapped: false, passed: 0 }),
    judgeStyle: async () => ({
      naming: 0, readability: 0, comments: 0, organization: 0, simplicity: 0, note: '',
    }),
    fast,
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

describe('demo matches', () => {
  it('defaults to a normal match that withholds the solution', async () => {
    const { reg, advance, at } = registry();
    const { roomCode, playerId } = reg.create('Danny');
    const engine = reg.get(roomCode)!;
    expect(engine.demo).toBe(false);
    expect(engine.snapshotFor(playerId).demo).toBe(false);

    const second = engine.addPlayer('Rusty');
    if (!second.ok) throw new Error('setup failed');
    advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
    await engine.tick(at());

    const problem = engine.snapshotFor(playerId).problem!;
    expect(problem.starterCode.python).toBeTruthy();
    // The reference answer must never reach a real match.
    expect(problem.solution).toBeUndefined();
  });

  it('hands a demo match the reference solution for both languages', async () => {
    const { reg, advance, at } = registry();
    const { roomCode, playerId } = reg.create('Danny', true);
    const engine = reg.get(roomCode)!;
    expect(engine.demo).toBe(true);
    expect(engine.snapshotFor(playerId).demo).toBe(true);

    const second = engine.addPlayer('Rusty');
    if (!second.ok) throw new Error('setup failed');
    advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
    await engine.tick(at());

    const problem = engine.snapshotFor(playerId).problem!;
    expect(problem.solution?.python).toContain('def ');
    expect(problem.solution?.javascript).toContain('function ');
    // Both players get it; the presenter drives two laptops.
    expect(engine.snapshotFor(second.data.playerId).problem!.solution).toBeDefined();
  });

  it('runs short phases even when the server is not in fast mode', () => {
    const { reg, at } = registry(false);
    const normal = reg.get(reg.create('A').roomCode)!;
    const demo = reg.get(reg.create('B', true).roomCode)!;

    for (const engine of [normal, demo]) {
      const second = engine.addPlayer('partner');
      if (!second.ok) throw new Error('setup failed');
    }

    // Both just entered ROLE_REVEAL; only the clock differs.
    expect(normal.deadlineAt! - at()).toBe(BALANCE.PHASE_MS.ROLE_REVEAL);
    expect(demo.deadlineAt! - at()).toBe(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
    expect(FAST_MATCH_PHASE_MS.ROLE_REVEAL).toBeLessThan(BALANCE.PHASE_MS.ROLE_REVEAL);
  });
});
