export const BALANCE = {
  // board
  BOARD_MAX_TILE: 14,
  ESCAPE_TILE: 14,
  COP_START: 0,
  ROBBER_START: 3,
  STASH_TILES: [5, 9, 12] as readonly number[],
  TOTAL_ROUNDS: 3,

  // scoring
  CORRECTNESS_WEIGHT: 80,
  STYLE_WEIGHT: 20,
  STYLE_RUBRIC_MAX: 20,
  SPEED_BONUS_TILES: 1,
  MIN_TILES: 1,
  MOVEMENT_BRACKETS: [
    { max: 30, tiles: 1 },
    { max: 50, tiles: 2 },
    { max: 70, tiles: 3 },
    { max: 90, tiles: 4 },
    { max: 100, tiles: 5 },
  ] as readonly { max: number; tiles: number }[],

  // power-ups
  INVENTORY_CAP: 3,
  HOSTILE_PER_ROUND: 1,

  // phases (ms)
  PHASE_MS: {
    ROLE_REVEAL: 4_000,
    ROUND_INTRO: 5_000,
    CODING: 150_000,
    JUDGING: 8_000,
    SCORING: 8_000,
    POWERUP: 10_000,
    MOVEMENT: 4_000,
  },

  // execution
  EXEC_TIMEOUT_MS: 5_000,
  EXEC_OUTPUT_CAP_BYTES: 256 * 1024,
  EXEC_MAX_CONCURRENT: 4,
  RUN_COOLDOWN_MS: 2_000,

  // networking
  CODE_SYNC_DEBOUNCE_MS: 5_000,
  RECONNECT_GRACE_MS: 20_000,
  MATCH_DESTROY_MS: 60_000,

  // ai judge
  GEMINI_TIMEOUT_MS: 4_000,
  GEMINI_MODEL: 'gemini-2.5-flash',
} as const;

/** Collapses every phase so a full match plays in under a minute. */
export const FAST_MATCH_PHASE_MS = {
  ROLE_REVEAL: 1_000,
  ROUND_INTRO: 1_000,
  CODING: 20_000,
  JUDGING: 8_000,
  SCORING: 2_000,
  POWERUP: 4_000,
  MOVEMENT: 1_000,
};

export function phaseDurations(fast: boolean) {
  return fast ? FAST_MATCH_PHASE_MS : BALANCE.PHASE_MS;
}
