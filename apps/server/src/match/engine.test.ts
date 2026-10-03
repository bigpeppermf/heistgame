import { beforeEach, describe, expect, it } from 'vitest';
import { BALANCE, FAST_MATCH_PHASE_MS, type MatchSnapshot } from '@heist/shared';
import { MatchEngine, type EngineDeps } from './engine.js';

const T0 = 1_000_000;

function harness() {
  let clock = T0;
  const emitted: { to: string; ev: string; payload: unknown }[] = [];
  const deps: EngineDeps = {
    now: () => clock,
    emit: (to, ev, payload) => emitted.push({ to, ev, payload }),
    execute: async () => ({ results: [], stdout: '', stderr: '', timedOut: false, passed: 0 }),
    judgeStyle: async () => ({
      naming: 0, readability: 0, comments: 0, organization: 0, simplicity: 0, note: '',
    }),
    fast: true,
  };
  const engine = new MatchEngine('ABC123', deps);
  return {
    engine,
    emitted,
    advance: (ms: number) => { clock += ms; },
    at: () => clock,
    snapshots: (playerId: string) =>
      emitted.filter((e) => e.ev === 'snapshot' && e.to === playerId).map((e) => e.payload as MatchSnapshot),
  };
}

describe('joining', () => {
  it('starts in LOBBY with no deadline', () => {
    const { engine } = harness();
    expect(engine.phase).toBe('LOBBY');
    expect(engine.deadlineAt).toBeNull();
  });

  it('stays in LOBBY with one player', () => {
    const { engine } = harness();
    engine.addPlayer('Danny');
    expect(engine.phase).toBe('LOBBY');
    expect(engine.players).toHaveLength(1);
  });

  it('assigns one cop and one robber when the second player joins', () => {
    const { engine } = harness();
    engine.addPlayer('Danny');
    engine.addPlayer('Rusty');
    expect(engine.phase).toBe('ROLE_REVEAL');
    expect(engine.players.map((p) => p.role).sort()).toEqual(['COP', 'ROBBER']);
  });

  it('places the cop and robber on their starting tiles', () => {
    const { engine } = harness();
    engine.addPlayer('Danny');
    engine.addPlayer('Rusty');
    const cop = engine.players.find((p) => p.role === 'COP')!;
    const robber = engine.players.find((p) => p.role === 'ROBBER')!;
    expect(cop.position).toBe(BALANCE.COP_START);
    expect(robber.position).toBe(BALANCE.ROBBER_START);
  });

  it('refuses a third player', () => {
    const { engine } = harness();
    engine.addPlayer('Danny');
    engine.addPlayer('Rusty');
    expect(engine.addPlayer('Linus')).toEqual({ ok: false, error: 'MATCH_FULL' });
  });
});

describe('phase progression', () => {
  function started() {
    const h = harness();
    const a = h.engine.addPlayer('Danny');
    const b = h.engine.addPlayer('Rusty');
    if (!a.ok || !b.ok) throw new Error('setup failed');
    return { ...h, aId: a.data.playerId, bId: b.data.playerId };
  }

  it('sets a deadline on ROLE_REVEAL', () => {
    const { engine, at } = started();
    expect(engine.deadlineAt).toBe(at() + FAST_MATCH_PHASE_MS.ROLE_REVEAL);
  });

  it('does not advance before the deadline', async () => {
    const { engine, advance, at } = started();
    advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL - 1);
    await engine.tick(at());
    expect(engine.phase).toBe('ROLE_REVEAL');
  });

  it('advances to ROUND_INTRO and opens round 1', async () => {
    const { engine, advance, at } = started();
    advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
    await engine.tick(at());
    expect(engine.phase).toBe('ROUND_INTRO');
    expect(engine.round).toBe(1);
  });

  it('reveals the round problem without its hidden tests', async () => {
    const { engine, advance, at, aId } = started();
    advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
    await engine.tick(at());
    const snap = engine.snapshotFor(aId);
    expect(snap.problem?.id).toBe('vault-codes');
    expect('hiddenTests' in (snap.problem as object)).toBe(false);
  });

  it('sends the correct briefing to each player without changing the task', async () => {
    const { engine, advance, at } = started();
    advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
    await engine.tick(at());
    const cop = engine.players.find(player => player.role === 'COP')!;
    const crew = engine.players.find(player => player.role === 'ROBBER')!;
    const copProblem = engine.snapshotFor(cop.id).problem!;
    const crewProblem = engine.snapshotFor(crew.id).problem!;
    expect(copProblem.title).toBe('Identify the Compromised Keycards');
    expect(crewProblem.title).toBe('Match the Vault Codes');
    expect(copProblem.sampleTests).toEqual(crewProblem.sampleTests);
    expect(copProblem.starterCode).toEqual(crewProblem.starterCode);
    expect(copProblem.functionName).toEqual(crewProblem.functionName);
    expect(copProblem).not.toHaveProperty('hiddenTests');
    expect(crewProblem).not.toHaveProperty('roleBriefings');
    expect(engine.snapshotFor(cop.id).problem).toEqual(copProblem);
  });

  it('advances to CODING with the coding deadline', async () => {
    const { engine, advance, at } = started();
    advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
    await engine.tick(at());
    advance(FAST_MATCH_PHASE_MS.ROUND_INTRO);
    await engine.tick(at());
    expect(engine.phase).toBe('CODING');
    expect(engine.deadlineAt).toBe(at() + FAST_MATCH_PHASE_MS.CODING);
  });
});

describe('submitting', () => {
  async function coding() {
    const h = harness();
    const a = h.engine.addPlayer('Danny');
    const b = h.engine.addPlayer('Rusty');
    if (!a.ok || !b.ok) throw new Error('setup failed');
    h.advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
    await h.engine.tick(h.at());
    h.advance(FAST_MATCH_PHASE_MS.ROUND_INTRO);
    await h.engine.tick(h.at());
    return { ...h, aId: a.data.playerId, bId: b.data.playerId };
  }

  it('accepts a submission during CODING', async () => {
    const { engine, aId } = await coding();
    expect(engine.submit(aId, 'print(1)', 'python')).toEqual({ ok: true, data: { ok: true } });
    expect(engine.players.find((p) => p.id === aId)!.submission?.code).toBe('print(1)');
  });

  it('REVIEW FOCUS 3: rejects a second submission and keeps the first', async () => {
    const { engine, aId } = await coding();
    engine.submit(aId, 'first', 'python');
    const second = engine.submit(aId, 'second', 'python');
    expect(second).toEqual({ ok: false, error: 'ALREADY_SUBMITTED' });
    const p = engine.players.find((x) => x.id === aId)!;
    expect(p.submission?.code).toBe('first');
  });

  it('rejects a submission outside CODING', async () => {
    const { engine, aId } = await coding();
    engine.submit(aId, 'a', 'python');
    engine.submit(engine.players[1]!.id, 'b', 'python');
    // both submitted -> engine left CODING
    expect(engine.phase).toBe('JUDGING');
    expect(engine.submit(aId, 'c', 'python')).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });

  it('leaves CODING as soon as both have submitted', async () => {
    const { engine, aId, bId } = await coding();
    engine.submit(aId, 'a', 'python');
    expect(engine.phase).toBe('CODING');
    engine.submit(bId, 'b', 'python');
    expect(engine.phase).toBe('JUDGING');
  });

  it('records server receipt order for the speed bonus', async () => {
    const { engine, aId, bId, advance, at } = await coding();
    engine.submit(bId, 'b', 'python');
    advance(500);
    engine.submit(aId, 'a', 'python');
    const b = engine.players.find((p) => p.id === bId)!;
    const a = engine.players.find((p) => p.id === aId)!;
    expect(b.submission!.at).toBeLessThan(a.submission!.at);
    expect(at()).toBeGreaterThan(T0);
  });
});

describe('auto-submit on deadline', () => {
  it('submits the last synced buffer for a player who never submitted', async () => {
    const h = harness();
    const a = h.engine.addPlayer('Danny');
    const b = h.engine.addPlayer('Rusty');
    if (!a.ok || !b.ok) throw new Error('setup failed');
    h.advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
    await h.engine.tick(h.at());
    h.advance(FAST_MATCH_PHASE_MS.ROUND_INTRO);
    await h.engine.tick(h.at());

    h.engine.syncCode(a.data.playerId, 'half written code', 'python');
    h.advance(FAST_MATCH_PHASE_MS.CODING);
    await h.engine.tick(h.at());

    expect(h.engine.phase).toBe('JUDGING');
    const player = h.engine.players.find((p) => p.id === a.data.playerId)!;
    expect(player.submission?.code).toBe('half written code');
  });

  it('submits empty code when nothing was ever synced', async () => {
    const h = harness();
    const a = h.engine.addPlayer('Danny');
    const b = h.engine.addPlayer('Rusty');
    if (!a.ok || !b.ok) throw new Error('setup failed');
    h.advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
    await h.engine.tick(h.at());
    h.advance(FAST_MATCH_PHASE_MS.ROUND_INTRO);
    await h.engine.tick(h.at());
    h.advance(FAST_MATCH_PHASE_MS.CODING);
    await h.engine.tick(h.at());

    expect(h.engine.players.every((p) => p.submission !== null)).toBe(true);
  });

  it('ignores a code_sync outside CODING', async () => {
    const h = harness();
    const a = h.engine.addPlayer('Danny');
    h.engine.addPlayer('Rusty');
    if (!a.ok) throw new Error('setup failed');
    h.engine.syncCode(a.data.playerId, 'too early', 'python');
    expect(h.engine.players.find((p) => p.id === a.data.playerId)!.buffer.code).toBe('');
  });
});

describe('disconnect handling', () => {
  it('marks a player disconnected and notifies the opponent with a grace deadline', () => {
    const h = harness();
    const a = h.engine.addPlayer('Danny');
    const b = h.engine.addPlayer('Rusty');
    if (!a.ok || !b.ok) throw new Error('setup failed');
    h.engine.setConnected(a.data.playerId, false);
    const notice = h.emitted.find((e) => e.ev === 'opponent_disconnected' && e.to === b.data.playerId);
    expect(notice).toBeDefined();
    expect((notice!.payload as { graceUntil: number }).graceUntil)
      .toBe(h.at() + BALANCE.RECONNECT_GRACE_MS);
  });

  it('reports the match empty only after both have been gone past the destroy window', () => {
    const h = harness();
    const a = h.engine.addPlayer('Danny');
    const b = h.engine.addPlayer('Rusty');
    if (!a.ok || !b.ok) throw new Error('setup failed');
    h.engine.setConnected(a.data.playerId, false);
    h.engine.setConnected(b.data.playerId, false);
    h.advance(BALANCE.MATCH_DESTROY_MS - 1);
    expect(h.engine.isEmpty(h.at())).toBe(false);
    h.advance(2);
    expect(h.engine.isEmpty(h.at())).toBe(true);
  });

  it('is not empty while one player is still connected', () => {
    const h = harness();
    const a = h.engine.addPlayer('Danny');
    h.engine.addPlayer('Rusty');
    if (!a.ok) throw new Error('setup failed');
    h.engine.setConnected(a.data.playerId, false);
    h.advance(BALANCE.MATCH_DESTROY_MS * 2);
    expect(h.engine.isEmpty(h.at())).toBe(false);
  });
});

describe('snapshot projection', () => {
  it('hides opponent progress while a smoke bomb is active and shows the player their own', async () => {
    const h = harness();
    const a = h.engine.addPlayer('Danny');
    const b = h.engine.addPlayer('Rusty');
    if (!a.ok || !b.ok) throw new Error('setup failed');
    h.advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
    await h.engine.tick(h.at());
    h.advance(FAST_MATCH_PHASE_MS.ROUND_INTRO);
    await h.engine.tick(h.at());

    const self = h.engine.players.find((p) => p.id === a.data.playerId)!;
    self.progress = 4;
    self.activeEffects.push({ type: 'SMOKE_BOMB', expiresAt: h.at() + 10_000 });

    const own = h.engine.snapshotFor(a.data.playerId);
    expect(own.players.find((p) => p.id === a.data.playerId)!.progress).toBe(4);

    const opponentView = h.engine.snapshotFor(b.data.playerId);
    expect(opponentView.players.find((p) => p.id === a.data.playerId)!.progress).toBeNull();
  });
});
