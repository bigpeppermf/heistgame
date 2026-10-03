import { describe, expect, it } from 'vitest';
import { BALANCE, FAST_MATCH_PHASE_MS, type TestResult } from '@heist/shared';
import { MatchEngine, type EngineDeps, type ServerPlayer } from './engine.js';

const T0 = 2_000_000;

type Scripted = { passed: number; total: number; rubric: number };

/** The script is keyed by the submitted code string, so a submission picks its own outcome. */
function harness(script: Record<string, Scripted>, opts: { stall?: boolean } = {}) {
  let clock = T0;
  const emitted: { to: string; ev: string; payload: unknown }[] = [];
  const lookup = (code: string): Scripted => script[code] ?? { passed: 0, total: 10, rubric: 0 };

  const deps: EngineDeps = {
    now: () => clock,
    emit: (to, ev, payload) => emitted.push({ to, ev, payload }),
    execute: async (o) => {
      if (opts.stall) await new Promise(() => {});
      const s = lookup(o.code);
      // The script is a fraction (passed of total); scale it onto the real
      // problem, whose hidden-test count is fixed by the problem, not the script.
      const n = o.tests.length;
      const passed = Math.round((s.passed / s.total) * n);
      const results: TestResult[] = Array.from({ length: n }, (_, i) => ({
        i, pass: i < passed, ms: 1,
      }));
      return { results, stdout: '', stderr: '', timedOut: false, passed };
    },
    // Spreads the scripted rubric total across the five criteria, largest first.
    judgeStyle: async (code) => {
      let left = lookup(code).rubric;
      const take = (max: number) => { const v = Math.min(max, left); left -= v; return v; };
      return {
        naming: take(5), readability: take(5), comments: take(4),
        organization: take(3), simplicity: take(3), note: '',
      };
    },
    fast: true,
  };

  const engine = new MatchEngine('RND001', deps);
  return {
    engine, emitted, deps,
    advance: (ms: number) => { clock += ms; },
    at: () => clock,
  };
}

/** Drives a fresh match to CODING in round 1. */
async function toCoding(h: ReturnType<typeof harness>) {
  const a = h.engine.addPlayer('Danny');
  const b = h.engine.addPlayer('Rusty');
  if (!a.ok || !b.ok) throw new Error('setup failed');
  h.advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
  await h.engine.tick(h.at());
  h.advance(FAST_MATCH_PHASE_MS.ROUND_INTRO);
  await h.engine.tick(h.at());
  return { aId: a.data.playerId, bId: b.data.playerId };
}

describe('judging and scoring', () => {
  it('scores both players and emits round_result', async () => {
    const h = harness({ 'code-A': { passed: 10, total: 10, rubric: 20 }, 'code-B': { passed: 5, total: 10, rubric: 20 } });
    const { aId, bId } = await toCoding(h);

    h.engine.submit(aId, 'code-A', 'python');
    h.engine.submit(bId, 'code-B', 'python');
    await h.engine.settleJudging();

    expect(h.engine.phase).toBe('SCORING');
    const a = h.engine.players.find((p) => p.id === aId)!;
    const b = h.engine.players.find((p) => p.id === bId)!;
    // Every hidden test passes; the count comes from the problem, not the script.
    expect(a.lastScore!.passed).toBe(a.lastScore!.totalTests);
    expect(a.lastScore!.correctness).toBe(80);
    expect(b.lastScore!.correctness).toBe(40);
    expect(h.emitted.some((e) => e.ev === 'round_result')).toBe(true);
  });

  it('awards the speed bonus to the earlier of two perfect submissions', async () => {
    const h = harness({ 'code-A': { passed: 10, total: 10, rubric: 0 }, 'code-B': { passed: 10, total: 10, rubric: 0 } });
    const { aId, bId } = await toCoding(h);

    h.engine.submit(bId, 'code-B', 'python');
    h.advance(1_000);
    h.engine.submit(aId, 'code-A', 'python');
    await h.engine.settleJudging();

    const a = h.engine.players.find((p) => p.id === aId)!;
    const b = h.engine.players.find((p) => p.id === bId)!;
    expect(b.lastScore!.speedBonus).toBe(BALANCE.SPEED_BONUS_TILES);
    expect(a.lastScore!.speedBonus).toBe(0);
  });

  it('awards no speed bonus when nobody is perfect', async () => {
    const h = harness({ 'code-A': { passed: 9, total: 10, rubric: 0 }, 'code-B': { passed: 9, total: 10, rubric: 0 } });
    const { aId, bId } = await toCoding(h);
    h.engine.submit(aId, 'code-A', 'python');
    h.engine.submit(bId, 'code-B', 'python');
    await h.engine.settleJudging();
    expect(h.engine.players.every((p) => p.lastScore!.speedBonus === 0)).toBe(true);
  });

  it('advances past the JUDGING hard cap even when the executor never returns', async () => {
    const h = harness({}, { stall: true });
    const { aId, bId } = await toCoding(h);
    h.engine.submit(aId, 'a', 'python');
    h.engine.submit(bId, 'b', 'python');
    expect(h.engine.phase).toBe('JUDGING');

    h.advance(BALANCE.PHASE_MS.JUDGING);
    await h.engine.tick(h.at());

    expect(h.engine.phase).toBe('SCORING');
    expect(h.engine.players.every((p) => p.lastScore !== null)).toBe(true);
    expect(h.engine.players.every((p) => p.lastScore!.passed === 0)).toBe(true);
  });
});

describe('power-up use', () => {
  async function codingWith(inv: Partial<Record<'a' | 'b', ServerPlayer['inventory']>>) {
    const h = harness({ 'code-A': { passed: 0, total: 10, rubric: 0 }, 'code-B': { passed: 0, total: 10, rubric: 0 } });
    const { aId, bId } = await toCoding(h);
    if (inv.a) h.engine.players.find((p) => p.id === aId)!.inventory = [...inv.a];
    if (inv.b) h.engine.players.find((p) => p.id === bId)!.inventory = [...inv.b];
    return { h, aId, bId };
  }

  it('applies EMP to the opponent and emits effect_applied', async () => {
    const { h, aId, bId } = await codingWith({ a: ['EMP'] });
    const r = h.engine.usePowerup(aId, 'EMP');
    expect(r).toEqual({ ok: true, data: { blocked: false } });
    const b = h.engine.players.find((p) => p.id === bId)!;
    expect(b.activeEffects.map((e) => e.type)).toEqual(['EMP']);
    expect(h.emitted.some((e) => e.ev === 'effect_applied')).toBe(true);
  });

  it('REVIEW FOCUS 4 reprise: rejects a modifier during CODING without consuming it', async () => {
    const { h, aId } = await codingWith({ a: ['ROADBLOCK'] });
    expect(h.engine.usePowerup(aId, 'ROADBLOCK')).toEqual({ ok: false, error: 'WRONG_PHASE' });
    expect(h.engine.players.find((p) => p.id === aId)!.inventory).toContain('ROADBLOCK');
  });

  it('reports a shield block and emits effect_blocked', async () => {
    const { h, aId, bId } = await codingWith({ a: ['BLACKOUT'] });
    h.engine.players.find((p) => p.id === bId)!.shielded = true;
    expect(h.engine.usePowerup(aId, 'BLACKOUT')).toEqual({ ok: true, data: { blocked: true } });
    expect(h.emitted.some((e) => e.ev === 'effect_blocked')).toBe(true);
  });

  it('keeps a smoke bomb active through judging and the score reveal', async () => {
    const { h, aId } = await codingWith({ a: ['SMOKE_BOMB'] });
    expect(h.engine.usePowerup(aId, 'SMOKE_BOMB').ok).toBe(true);
    const codingDeadline = h.engine.deadlineAt!;
    const a = h.engine.players.find((p) => p.id === aId)!;
    const expiry = a.activeEffects.find((e) => e.type === 'SMOKE_BOMB')!.expiresAt;
    // Must outlast CODING, because progress only streams once judging starts.
    expect(expiry).toBeGreaterThan(codingDeadline + FAST_MATCH_PHASE_MS.JUDGING);
  });

  it('blocks a Run while EMP is active and allows it otherwise', async () => {
    const { h, aId, bId } = await codingWith({ a: ['EMP'] });
    h.engine.usePowerup(aId, 'EMP');
    expect(h.engine.canRun(bId, h.at())).toEqual({ ok: false, error: 'EMP_ACTIVE' });
    expect(h.engine.canRun(aId, h.at())).toEqual({ ok: true, data: { ok: true } });
  });

  it('enforces the run cooldown', async () => {
    const { h, aId } = await codingWith({});
    expect(h.engine.canRun(aId, h.at()).ok).toBe(true);
    expect(h.engine.canRun(aId, h.at())).toEqual({ ok: false, error: 'COOLDOWN' });
    h.advance(BALANCE.RUN_COOLDOWN_MS + 1);
    expect(h.engine.canRun(aId, h.at()).ok).toBe(true);
  });
});

describe('movement and win conditions', () => {
  /** Runs one full round with a scripted outcome and returns positions after MOVEMENT. */
  async function playRound(h: ReturnType<typeof harness>, aId: string, bId: string) {
    h.engine.submit(aId, 'code-A', 'python');
    h.engine.submit(bId, 'code-B', 'python');
    await h.engine.settleJudging();
    h.advance(FAST_MATCH_PHASE_MS.SCORING);
    await h.engine.tick(h.at());
    expect(h.engine.phase).toBe('POWERUP');
    h.advance(FAST_MATCH_PHASE_MS.POWERUP);
    await h.engine.tick(h.at());
    expect(h.engine.phase).toBe('MOVEMENT');
    h.advance(FAST_MATCH_PHASE_MS.MOVEMENT);
    await h.engine.tick(h.at());
  }

  it('moves both players by their bracket and starts the next round', async () => {
    const h = harness({ 'code-A': { passed: 10, total: 10, rubric: 0 }, 'code-B': { passed: 10, total: 10, rubric: 0 } });
    const { aId, bId } = await toCoding(h);
    const cop = h.engine.players.find((p) => p.role === 'COP')!;
    const robber = h.engine.players.find((p) => p.role === 'ROBBER')!;

    await playRound(h, aId, bId);

    // correctness 80 + style 0 = 80 -> 4 tiles; the earlier submitter also gets +1
    expect(cop.position).toBeGreaterThan(BALANCE.COP_START);
    expect(robber.position).toBeGreaterThan(BALANCE.ROBBER_START);
    expect(h.engine.round).toBe(2);
    expect(h.engine.phase).toBe('ROUND_INTRO');
  });

  it('ends the match when the cop catches the robber', async () => {
    const h = harness({ 'code-A': { passed: 10, total: 10, rubric: 20 }, 'code-B': { passed: 0, total: 10, rubric: 0 } });
    await toCoding(h);
    const cop = h.engine.players.find((p) => p.role === 'COP')!;
    const robber = h.engine.players.find((p) => p.role === 'ROBBER')!;
    cop.position = 6;
    robber.position = 7;
    h.engine.submit(cop.id, 'code-A', 'python');
    h.engine.submit(robber.id, 'code-B', 'python');
    await h.engine.settleJudging();
    h.advance(FAST_MATCH_PHASE_MS.SCORING);
    await h.engine.tick(h.at());
    h.advance(FAST_MATCH_PHASE_MS.POWERUP);
    await h.engine.tick(h.at());
    h.advance(FAST_MATCH_PHASE_MS.MOVEMENT);
    await h.engine.tick(h.at());

    expect(h.engine.phase).toBe('GAME_OVER');
    expect(h.engine.winner).toEqual({ role: 'COP', reason: 'CAUGHT' });
    expect(h.emitted.some((e) => e.ev === 'game_over')).toBe(true);
  });

  it('ends the match when the robber reaches the escape tile', async () => {
    const h = harness({ 'code-A': { passed: 10, total: 10, rubric: 20 }, 'code-B': { passed: 10, total: 10, rubric: 20 } });
    await toCoding(h);
    const cop = h.engine.players.find((p) => p.role === 'COP')!;
    const robber = h.engine.players.find((p) => p.role === 'ROBBER')!;
    cop.position = 2;
    robber.position = 12;
    h.engine.submit(cop.id, 'code-A', 'python');
    h.engine.submit(robber.id, 'code-B', 'python');
    await h.engine.settleJudging();
    h.advance(FAST_MATCH_PHASE_MS.SCORING);
    await h.engine.tick(h.at());
    h.advance(FAST_MATCH_PHASE_MS.POWERUP);
    await h.engine.tick(h.at());
    h.advance(FAST_MATCH_PHASE_MS.MOVEMENT);
    await h.engine.tick(h.at());

    expect(h.engine.winner).toEqual({ role: 'ROBBER', reason: 'ESCAPED' });
  });

  it('applies a roadblock played during POWERUP to the opponent movement', async () => {
    const h = harness({ 'code-A': { passed: 10, total: 10, rubric: 0 }, 'code-B': { passed: 10, total: 10, rubric: 0 } });
    const { aId, bId } = await toCoding(h);
    h.engine.submit(aId, 'code-A', 'python');
    h.engine.submit(bId, 'code-B', 'python');
    await h.engine.settleJudging();
    h.advance(FAST_MATCH_PHASE_MS.SCORING);
    await h.engine.tick(h.at());

    const a = h.engine.players.find((p) => p.id === aId)!;
    const b = h.engine.players.find((p) => p.id === bId)!;
    a.inventory = ['ROADBLOCK'];
    // The perfect-round award is random and may have handed b a Shield, which
    // would block the roadblock. Clear it so this test is deterministic.
    b.shielded = false;
    const before = b.position;
    expect(h.engine.usePowerup(aId, 'ROADBLOCK').ok).toBe(true);

    h.advance(FAST_MATCH_PHASE_MS.POWERUP);
    await h.engine.tick(h.at());
    // Hold the score object: starting round 2 clears player.lastScore.
    const score = b.lastScore!;
    h.advance(FAST_MATCH_PHASE_MS.MOVEMENT);
    await h.engine.tick(h.at());

    expect(score.modifierDelta).toBe(-1);
    expect(b.position - before).toBe(score.tiles);
  });

  it('awards a power-up to a player who lands on a stash tile', async () => {
    // Both score zero: no perfect award, no sole leader, so only the stash can award.
    const h = harness({ 'code-A': { passed: 0, total: 10, rubric: 0 }, 'code-B': { passed: 0, total: 10, rubric: 0 } });
    await toCoding(h);
    const cop = h.engine.players.find((p) => p.role === 'COP')!;
    const robber = h.engine.players.find((p) => p.role === 'ROBBER')!;
    cop.position = 0;
    robber.position = 4;
    h.engine.submit(cop.id, 'code-A', 'python');
    h.engine.submit(robber.id, 'code-B', 'python');
    await h.engine.settleJudging();
    h.advance(FAST_MATCH_PHASE_MS.SCORING);
    await h.engine.tick(h.at());
    expect(robber.inventory.length + (robber.shielded ? 1 : 0)).toBe(0);
    h.advance(FAST_MATCH_PHASE_MS.POWERUP);
    await h.engine.tick(h.at());
    expect(robber.inventory.length + (robber.shielded ? 1 : 0)).toBe(0);
    h.advance(FAST_MATCH_PHASE_MS.MOVEMENT);
    await h.engine.tick(h.at());

    expect(BALANCE.STASH_TILES).toContain(robber.position);
    expect(robber.inventory.length + (robber.shielded ? 1 : 0)).toBe(1);
  });

  it('auto-selects an offered power-up when the player does not choose', async () => {
    const h = harness({ 'code-A': { passed: 10, total: 10, rubric: 20 }, 'code-B': { passed: 1, total: 10, rubric: 0 } });
    const { aId, bId } = await toCoding(h);
    h.engine.submit(aId, 'code-A', 'python');
    h.engine.submit(bId, 'code-B', 'python');
    await h.engine.settleJudging();
    h.advance(FAST_MATCH_PHASE_MS.SCORING);
    await h.engine.tick(h.at());

    const a = h.engine.players.find((p) => p.id === aId)!;
    expect(a.offer).toHaveLength(2);
    expect(h.emitted.some((e) => e.ev === 'powerup_offer' && e.to === aId)).toBe(true);

    h.advance(FAST_MATCH_PHASE_MS.POWERUP);
    await h.engine.tick(h.at());
    expect(a.inventory.length + (a.shielded ? 1 : 0)).toBeGreaterThan(0);
    expect(a.offer).toBeNull();
  });

  it('awards a power-up for a perfect round', async () => {
    const h = harness({ 'code-A': { passed: 10, total: 10, rubric: 0 }, 'code-B': { passed: 0, total: 10, rubric: 0 } });
    const { aId, bId } = await toCoding(h);
    h.engine.submit(aId, 'code-A', 'python');
    h.engine.submit(bId, 'code-B', 'python');
    await h.engine.settleJudging();
    h.advance(FAST_MATCH_PHASE_MS.SCORING);
    await h.engine.tick(h.at());
    const a = h.engine.players.find((p) => p.id === aId)!;
    expect(a.inventory.length + (a.shielded ? 1 : 0)).toBeGreaterThan(0);
  });
});
