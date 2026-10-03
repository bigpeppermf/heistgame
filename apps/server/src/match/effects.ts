import {
  BALANCE, type ActiveEffect, type PendingModifier, type Phase, type PowerupType,
} from '@heist/shared';

export type EffectSpec = {
  kind: 'timed' | 'modifier' | 'reactive';
  hostile: boolean;
  /** null on a timed effect means "until the end of the round" */
  durationMs: number | null;
  delta: number;
};

export const EFFECTS: Record<PowerupType, EffectSpec> = {
  EMP:          { kind: 'timed',    hostile: true,  durationMs: 15_000, delta: 0 },
  BLACKOUT:     { kind: 'timed',    hostile: true,  durationMs: 6_000,  delta: 0 },
  JAMMED_COMMS: { kind: 'timed',    hostile: true,  durationMs: 20_000, delta: 0 },
  SMOKE_BOMB:   { kind: 'timed',    hostile: false, durationMs: null,   delta: 0 },
  ROADBLOCK:    { kind: 'modifier', hostile: true,  durationMs: null,   delta: -1 },
  GETAWAY_CAR:  { kind: 'modifier', hostile: false, durationMs: null,   delta: 1 },
  SHIELD:       { kind: 'reactive', hostile: false, durationMs: null,   delta: 0 },
};

/** All seven power-ups are awardable; SHIELD is auto-armed on award rather than stored in inventory. */
const AWARDABLE = Object.keys(EFFECTS) as PowerupType[];

export type EffectPlayer = {
  inventory: PowerupType[];
  shielded: boolean;
  activeEffects: ActiveEffect[];
  pendingModifiers: PendingModifier[];
  hostileUsedThisRound: number;
};

export type ApplyResult =
  | { ok: true; blocked: boolean; expiresAt: number | null }
  | { ok: false; reason: 'NOT_OWNED' | 'HOSTILE_CAP' | 'NOT_USABLE' };

/**
 * The single choke point every power-up passes through.
 * Shield is the guard at the top, not a separate feature.
 */
export function applyEffect(
  source: EffectPlayer,
  target: EffectPlayer,
  type: PowerupType,
  now: number,
  roundEndsAt: number,
): ApplyResult {
  const spec = EFFECTS[type];

  if (spec.kind === 'reactive') return { ok: false, reason: 'NOT_USABLE' };

  const idx = source.inventory.indexOf(type);
  if (idx === -1) return { ok: false, reason: 'NOT_OWNED' };

  if (spec.hostile && source.hostileUsedThisRound >= BALANCE.HOSTILE_PER_ROUND) {
    return { ok: false, reason: 'HOSTILE_CAP' };
  }

  source.inventory.splice(idx, 1);
  if (spec.hostile) source.hostileUsedThisRound += 1;

  if (spec.hostile && target.shielded) {
    target.shielded = false;
    return { ok: true, blocked: true, expiresAt: null };
  }

  if (spec.kind === 'timed') {
    const expiresAt = spec.durationMs === null ? roundEndsAt : now + spec.durationMs;
    target.activeEffects.push({ type, expiresAt });
    return { ok: true, blocked: false, expiresAt };
  }

  target.pendingModifiers.push({ type, delta: spec.delta });
  return { ok: true, blocked: false, expiresAt: null };
}

export function awardPowerup(player: EffectPlayer, type: PowerupType): void {
  if (type === 'SHIELD') {
    player.shielded = true;
    return;
  }
  if (player.inventory.length >= BALANCE.INVENTORY_CAP) return;
  player.inventory.push(type);
}

export function pruneEffects(player: EffectPlayer, now: number): void {
  player.activeEffects = player.activeEffects.filter((e) => e.expiresAt > now);
}

export function hasActiveEffect(player: EffectPlayer, type: PowerupType, now: number): boolean {
  return player.activeEffects.some((e) => e.type === type && e.expiresAt > now);
}

export function sumModifiers(player: EffectPlayer): number {
  return player.pendingModifiers.reduce((sum, m) => sum + m.delta, 0);
}

export function resetRound(player: EffectPlayer): void {
  player.pendingModifiers = [];
  player.hostileUsedThisRound = 0;
}

export function randomPowerup(rng: () => number = Math.random): PowerupType {
  return AWARDABLE[Math.floor(rng() * AWARDABLE.length)]!;
}

/**
 * Phase legality, per spec section 9. Checked BEFORE applyEffect so an
 * illegal attempt never consumes the item.
 */
export function isUsableInPhase(type: PowerupType, phase: Phase): boolean {
  const spec = EFFECTS[type];
  if (spec.kind === 'reactive') return false;
  if (spec.kind === 'timed') return phase === 'CODING';
  return phase === 'POWERUP';
}
