import { describe, expect, it, vi } from 'vitest';
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
      return { results, stdout: '', stderr: '', timedOut: false, outputCapped: false, passed };
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

describe('judging failure and staleness', () => {
  it('survives a rejecting executor: resolves promptly with no unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on('unhandledRejection', onUnhandled);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const h = harness({});
      h.deps.execute = async () => { throw new Error('spawn failed'); };
      const { aId, bId } = await toCoding(h);
      h.engine.submit(aId, 'a', 'python');
      h.engine.submit(bId, 'b', 'python');
      await new Promise((r) => setTimeout(r, 10)); // let the rejection surface
      expect(unhandled).toEqual([]);
      expect(errSpy).toHaveBeenCalled();

      // Resolves on its own. A rejection used to escape Promise.all and skip
      // finishJudging(), stranding BOTH players until the 8s hard cap.
      expect(h.engine.phase).toBe('SCORING');
      expect(h.engine.players.every((p) => p.lastScore!.passed === 0)).toBe(true);

      const scores = h.engine.snapshotFor(aId).scores!;
      expect(scores[aId]!.correctness).toBe(0);
      // Still earns the floor movement, so the board cannot deadlock.
      expect(scores[aId]!.tiles).toBe(BALANCE.MIN_TILES);

      // The hard cap remains a backstop on top of prompt resolution.
      h.advance(BALANCE.PHASE_MS.JUDGING);
      await h.engine.tick(h.at());
      expect(h.engine.phase).toBe('POWERUP');
    } finally {
      process.off('unhandledRejection', onUnhandled);
      errSpy.mockRestore();
    }
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

    // round_result is sent again after movement with the final numbers.
    const results = h.emitted.filter((e) => e.ev === 'round_result' && e.to === bId);
    expect(results).toHaveLength(2);
    const first = (results[0]!.payload as { scores: Record<string, { tiles: number; modifierDelta: number }> }).scores[bId]!;
    const last = (results[1]!.payload as { scores: Record<string, { tiles: number; modifierDelta: number }> }).scores[bId]!;
    expect(first.tiles).toBeGreaterThan(0); // provisional, never 0
    expect(first.modifierDelta).toBe(0);
    expect(last.modifierDelta).toBe(-1);
    expect(last.tiles).toBe(score.tiles);
    expect(last.tiles).not.toBe(first.tiles);
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

describe('snapshot recovery', () => {
  /** Drives a scored round to the POWERUP phase, where A is the sole leader. */
  async function toPowerup(h: ReturnType<typeof harness>) {
    const { aId, bId } = await toCoding(h);
    h.engine.submit(aId, 'code-A', 'python');
    h.engine.submit(bId, 'code-B', 'python');
    await h.engine.settleJudging();
    h.advance(FAST_MATCH_PHASE_MS.SCORING);
    await h.engine.tick(h.at());
    return { aId, bId };
  }

  it('reports no offer and no scores before any round resolves', async () => {
    const h = harness({});
    const { aId } = await toCoding(h);
    const snap = h.engine.snapshotFor(aId);
    expect(snap.offer).toBeNull();
    expect(snap.scores).toBeNull();
  });

  it('carries the viewer own offer and never the opponent one', async () => {
    const h = harness({
      'code-A': { passed: 10, total: 10, rubric: 20 },
      'code-B': { passed: 2, total: 10, rubric: 0 },
    });
    const { aId, bId } = await toPowerup(h);

    expect(h.engine.phase).toBe('POWERUP');
    // A is the sole leader, so only A is offered a choice of two.
    expect(h.engine.snapshotFor(aId).offer).toHaveLength(2);
    expect(h.engine.snapshotFor(bId).offer).toBeNull();
  });

  it('carries the last round scores so a reload recovers the panel', async () => {
    const h = harness({
      'code-A': { passed: 10, total: 10, rubric: 20 },
      'code-B': { passed: 5, total: 10, rubric: 10 },
    });
    const { aId, bId } = await toPowerup(h);

    const scores = h.engine.snapshotFor(aId).scores;
    expect(scores).not.toBeNull();
    expect(scores![aId]!.correctness).toBe(BALANCE.CORRECTNESS_WEIGHT);
    expect(scores![bId]!.passed).toBeGreaterThan(0);
  });

  it('exposes the hostile budget a client would otherwise track locally', async () => {
    const h = harness({});
    const { aId, bId } = await toCoding(h);
    const a = h.engine.players.find((p) => p.id === aId)!;

    expect(h.engine.snapshotFor(aId).players.find((p) => p.id === aId)!.hostileUsed).toBe(0);

    a.inventory.push('EMP');
    const used = h.engine.usePowerup(aId, 'EMP');
    expect(used.ok).toBe(true);

    // Visible to both players: effect_applied is broadcast, so this is no secret.
    for (const viewer of [aId, bId]) {
      expect(h.engine.snapshotFor(viewer).players.find((p) => p.id === aId)!.hostileUsed)
        .toBe(BALANCE.HOSTILE_PER_ROUND);
    }
  });
});

describe('smoke bomb concealment', () => {
  /** A plays Smoke Bomb during CODING, then both submit and the round is judged. */
  async function smokedRound() {
    const h = harness({
      'code-A': { passed: 10, total: 10, rubric: 20 },
      'code-B': { passed: 5, total: 10, rubric: 10 },
    });
    const { aId, bId } = await toCoding(h);
    h.engine.players.find((p) => p.id === aId)!.inventory.push('SMOKE_BOMB');
    expect(h.engine.usePowerup(aId, 'SMOKE_BOMB').ok).toBe(true);

    h.engine.submit(aId, 'code-A', 'python');
    h.engine.submit(bId, 'code-B', 'python');
    await h.engine.settleJudging();
    return { h, aId, bId };
  }

  it('zeroes the smoked player figures for the opponent but not for themselves', async () => {
    const { h, aId, bId } = await smokedRound();
    expect(h.engine.phase).toBe('SCORING');

    const asOpponent = h.engine.snapshotFor(bId).scores![aId]!;
    expect(asOpponent.concealed).toBe(true);
    expect(asOpponent.correctness).toBe(0);
    expect(asOpponent.total).toBe(0);
    expect(asOpponent.passed).toBe(0);

    const asSelf = h.engine.snapshotFor(aId).scores![aId]!;
    expect(asSelf.concealed).toBeUndefined();
    expect(asSelf.correctness).toBe(BALANCE.CORRECTNESS_WEIGHT);
    expect(asSelf.passed).toBeGreaterThan(0);
  });

  it('leaves the tile count truthful, since the board reveals it anyway', async () => {
    const { h, aId, bId } = await smokedRound();
    const asOpponent = h.engine.snapshotFor(bId).scores![aId]!;
    const asSelf = h.engine.snapshotFor(aId).scores![aId]!;
    expect(asOpponent.tiles).toBe(asSelf.tiles);
    expect(asOpponent.tiles).toBeGreaterThan(0);
  });

  it('never puts the concealed figures on the wire to the opponent', async () => {
    const { h, aId, bId } = await smokedRound();
    const toOpponent = h.emitted.filter((e) => e.to === bId && e.ev === 'round_result');
    expect(toOpponent.length).toBeGreaterThan(0);

    for (const ev of toOpponent) {
      const { scores } = ev.payload as { scores: Record<string, { passed: number; concealed?: boolean }> };
      expect(scores[aId]!.concealed).toBe(true);
      expect(scores[aId]!.passed).toBe(0);
    }
    // The smoked player still receives their own true figures.
    const toSelf = h.emitted.filter((e) => e.to === aId && e.ev === 'round_result');
    const own = (toSelf.at(-1)!.payload as { scores: Record<string, { passed: number }> }).scores[aId]!;
    expect(own.passed).toBeGreaterThan(0);
  });
});

describe('shield is reactive, not playable', () => {
  it('reports NOT_USABLE rather than blaming the phase', async () => {
    const h = harness({});
    const { aId } = await toCoding(h);
    const res = h.engine.usePowerup(aId, 'SHIELD');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('NOT_USABLE');
  });
});

describe('a round always resolves', () => {
  /** Carries one round from CODING through MOVEMENT and into whatever follows. */
  async function finishRound(h: ReturnType<typeof harness>, aId: string, bId: string, tag: string) {
    h.engine.submit(aId, `a-${tag}`, 'python');
    h.engine.submit(bId, `b-${tag}`, 'python');
    await h.engine.settleJudging();
    for (const phase of ['SCORING', 'POWERUP', 'MOVEMENT'] as const) {
      h.advance(FAST_MATCH_PHASE_MS[phase]);
      await h.engine.tick(h.at());
    }
    if (h.engine.phase === 'ROUND_INTRO') {
      h.advance(FAST_MATCH_PHASE_MS.ROUND_INTRO);
      await h.engine.tick(h.at());
    }
  }

  it('keeps playing past the old three-round limit', async () => {
    const h = harness({});
    const { aId, bId } = await toCoding(h);

    for (let round = 1; round <= 4; round += 1) {
      expect(h.engine.round).toBe(round);
      await finishRound(h, aId, bId, String(round));
    }
    // There is no round limit any more: round 4 used to be impossible.
    expect(h.engine.phase).not.toBe('GAME_OVER');
    expect(h.engine.round).toBe(5);
  });

  it('ends when the robber reaches the escape tile', async () => {
    const h = harness({});
    const { aId, bId } = await toCoding(h);

    // Nobody solves anything, so both sides crawl at MIN_TILES per round and
    // the robber's head start carries them to the escape tile untouched.
    for (let round = 1; round <= BALANCE.ROUND_HARD_CAP; round += 1) {
      await finishRound(h, aId, bId, String(round));
      if (h.engine.phase === 'GAME_OVER') break;
    }

    expect(h.engine.phase).toBe('GAME_OVER');
    expect(h.engine.winner).toEqual({ role: 'ROBBER', reason: 'ESCAPED' });
    expect(h.emitted.filter((e) => e.ev === 'game_over')).toHaveLength(2);
    const robber = h.engine.players.find((p) => p.role === 'ROBBER')!;
    expect(robber.position).toBeGreaterThanOrEqual(BALANCE.ESCAPE_TILE);
  });

  it('keeps a disconnected player in the match and tells the opponent', async () => {
    const h = harness({});
    const { aId, bId } = await toCoding(h);

    h.engine.setConnected(aId, false);
    expect(h.engine.snapshotFor(bId).players.find((p) => p.id === aId)!.connected).toBe(false);
    const gone = h.emitted.filter((e) => e.to === bId && e.ev === 'opponent_disconnected');
    expect(gone).toHaveLength(1);
    expect((gone[0]!.payload as { graceUntil: number }).graceUntil)
      .toBe(h.at() + BALANCE.RECONNECT_GRACE_MS);

    h.engine.setConnected(aId, true);
    expect(h.engine.snapshotFor(bId).players.find((p) => p.id === aId)!.connected).toBe(true);
    expect(h.emitted.filter((e) => e.to === bId && e.ev === 'opponent_reconnected')).toHaveLength(1);
  });
});
