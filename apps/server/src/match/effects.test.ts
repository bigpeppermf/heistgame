import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyEffect, awardPowerup, hasActiveEffect, isUsableInPhase, pruneEffects, randomPowerup, resetRound, seededRng, sumModifiers, type EffectPlayer,
} from './effects.js';

const NOW = 1_000_000;
const ROUND_END = NOW + 100_000;

function player(inventory: EffectPlayer['inventory'] = []): EffectPlayer {
  return { inventory: [...inventory], shielded: false, activeEffects: [], pendingModifiers: [], hostileUsedThisRound: 0 };
}

describe('applyEffect', () => {
  let a: EffectPlayer;
  let b: EffectPlayer;
  beforeEach(() => { a = player(['EMP', 'ROADBLOCK', 'GETAWAY_CAR']); b = player(); });

  it('applies a timed hostile effect to the target and consumes the item', () => {
    const r = applyEffect(a, b, 'EMP', NOW, ROUND_END);
    expect(r).toEqual({ ok: true, blocked: false, expiresAt: NOW + 15_000 });
    expect(a.inventory).not.toContain('EMP');
    expect(hasActiveEffect(b, 'EMP', NOW)).toBe(true);
  });

  it('puts a hostile modifier on the target, not the source', () => {
    applyEffect(a, b, 'ROADBLOCK', NOW, ROUND_END);
    expect(sumModifiers(b)).toBe(-1);
    expect(sumModifiers(a)).toBe(0);
  });

  it('puts a self modifier on the source', () => {
    applyEffect(a, a, 'GETAWAY_CAR', NOW, ROUND_END);
    expect(sumModifiers(a)).toBe(1);
  });

  it('rejects a power-up the source does not own and consumes nothing', () => {
    const r = applyEffect(a, b, 'BLACKOUT', NOW, ROUND_END);
    expect(r).toEqual({ ok: false, reason: 'NOT_OWNED' });
    expect(b.activeEffects).toHaveLength(0);
    expect(a.inventory).toEqual(['EMP', 'ROADBLOCK', 'GETAWAY_CAR']);
    expect(a.hostileUsedThisRound).toBe(0);
  });

  it('a shield blocks the next hostile effect and is consumed', () => {
    b.shielded = true;
    const r = applyEffect(a, b, 'EMP', NOW, ROUND_END);
    expect(r).toEqual({ ok: true, blocked: true, expiresAt: null });
    expect(b.shielded).toBe(false);
    expect(hasActiveEffect(b, 'EMP', NOW)).toBe(false);
    expect(a.inventory).not.toContain('EMP');
    expect(a.hostileUsedThisRound).toBe(1);
  });

  it('a shield does not block a self effect', () => {
    a.shielded = true;
    applyEffect(a, a, 'GETAWAY_CAR', NOW, ROUND_END);
    expect(a.shielded).toBe(true);
    expect(sumModifiers(a)).toBe(1);
  });

  it('caps hostile use at one per round across timed and modifier kinds', () => {
    expect(applyEffect(a, b, 'EMP', NOW, ROUND_END).ok).toBe(true);
    const second = applyEffect(a, b, 'ROADBLOCK', NOW, ROUND_END);
    expect(second).toEqual({ ok: false, reason: 'HOSTILE_CAP' });
    expect(a.inventory).toContain('ROADBLOCK');
    expect(a.hostileUsedThisRound).toBe(1);
  });

  it('does not count self effects against the hostile cap', () => {
    applyEffect(a, a, 'GETAWAY_CAR', NOW, ROUND_END);
    expect(applyEffect(a, b, 'EMP', NOW, ROUND_END).ok).toBe(true);
  });

  it('expires a smoke bomb at the end of the round', () => {
    const c = player(['SMOKE_BOMB']);
    const r = applyEffect(c, c, 'SMOKE_BOMB', NOW, ROUND_END);
    expect(r).toEqual({ ok: true, blocked: false, expiresAt: ROUND_END });
  });

  it('refuses to use SHIELD directly, since it auto-arms on award', () => {
    const c = player(['SHIELD']);
    expect(applyEffect(c, c, 'SHIELD', NOW, ROUND_END)).toEqual({ ok: false, reason: 'NOT_USABLE' });
    expect(c.inventory).toContain('SHIELD');
    expect(c.hostileUsedThisRound).toBe(0);
  });
});

describe('awardPowerup', () => {
  it('auto-arms a shield instead of storing it, and ignores the inventory cap', () => {
    const p = player(['EMP', 'BLACKOUT', 'ROADBLOCK']);
    awardPowerup(p, 'SHIELD');
    expect(p.shielded).toBe(true);
    expect(p.inventory).toHaveLength(3);
  });

  it('discards awards beyond the inventory cap', () => {
    const p = player(['EMP', 'BLACKOUT', 'ROADBLOCK']);
    awardPowerup(p, 'GETAWAY_CAR');
    expect(p.inventory).toHaveLength(3);
    expect(p.inventory).not.toContain('GETAWAY_CAR');
  });

  it('stores an award when there is room', () => {
    const p = player();
    awardPowerup(p, 'GETAWAY_CAR');
    expect(p.inventory).toEqual(['GETAWAY_CAR']);
  });
});

describe('pruneEffects', () => {
  it('drops effects whose deadline has passed and keeps live ones', () => {
    const p = player();
    p.activeEffects = [
      { type: 'EMP', expiresAt: NOW - 1 },
      { type: 'BLACKOUT', expiresAt: NOW + 1 },
    ];
    pruneEffects(p, NOW);
    expect(p.activeEffects.map((e) => e.type)).toEqual(['BLACKOUT']);
  });
});

describe('resetRound', () => {
  it('clears pending modifiers and the hostile counter but keeps inventory and shield', () => {
    const p = player(['EMP']);
    p.shielded = true;
    p.pendingModifiers = [{ type: 'ROADBLOCK', delta: -1 }];
    p.hostileUsedThisRound = 1;
    resetRound(p);
    expect(p.pendingModifiers).toEqual([]);
    expect(p.hostileUsedThisRound).toBe(0);
    expect(p.inventory).toEqual(['EMP']);
    expect(p.shielded).toBe(true);
  });
});

describe('isUsableInPhase', () => {
  it('allows timed sabotage only while coding', () => {
    expect(isUsableInPhase('EMP', 'CODING')).toBe(true);
    expect(isUsableInPhase('BLACKOUT', 'CODING')).toBe(true);
    expect(isUsableInPhase('SMOKE_BOMB', 'CODING')).toBe(true);
    expect(isUsableInPhase('EMP', 'SCORING')).toBe(false);
    expect(isUsableInPhase('EMP', 'POWERUP')).toBe(false);
    expect(isUsableInPhase('EMP', 'LOBBY')).toBe(false);
  });

  it('allows modifiers only during the power-up phase', () => {
    expect(isUsableInPhase('ROADBLOCK', 'POWERUP')).toBe(true);
    expect(isUsableInPhase('GETAWAY_CAR', 'POWERUP')).toBe(true);
    expect(isUsableInPhase('ROADBLOCK', 'CODING')).toBe(false);
  });

  it('never allows SHIELD to be used, in any phase', () => {
    expect(isUsableInPhase('SHIELD', 'CODING')).toBe(false);
    expect(isUsableInPhase('SHIELD', 'POWERUP')).toBe(false);
  });
});

describe('seededRng — power-up luck per alias', () => {
  it('is deterministic for the same alias', () => {
    const a = seededRng('Danny');
    const b = seededRng('Danny');
    const draws = (rng: () => number) => Array.from({ length: 8 }, () => rng());
    expect(draws(a)).toEqual(draws(b));
  });

  it('gives different aliases different sequences', () => {
    const danny = Array.from({ length: 8 }, seededRng('Danny'));
    const rusty = Array.from({ length: 8 }, seededRng('Rusty'));
    expect(danny).not.toEqual(rusty);
  });

  it('advances, so one alias does not draw the same value forever', () => {
    const rng = seededRng('Linus');
    const draws = new Set(Array.from({ length: 20 }, () => rng()));
    expect(draws.size).toBeGreaterThan(15);
  });

  it('stays inside [0, 1)', () => {
    const rng = seededRng('Basher');
    for (let i = 0; i < 200; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('spreads across every awardable power-up', () => {
    const rng = seededRng('Saul');
    const seen = new Set(Array.from({ length: 300 }, () => randomPowerup(rng)));
    expect(seen.size).toBe(7);
  });
});
