import { BALANCE, type Role, type RubricScore } from '@heist/shared';

export function rubricTotal(r: RubricScore): number {
  return r.naming + r.readability + r.comments + r.organization + r.simplicity;
}

export function scoreSubmission(passed: number, total: number, rubric: number) {
  const ratio = total === 0 ? 0 : passed / total;
  const correctness = ratio * BALANCE.CORRECTNESS_WEIGHT;
  const style = (rubric / BALANCE.STYLE_RUBRIC_MAX) * BALANCE.STYLE_WEIGHT * ratio;
  return { correctness, style, total: correctness + style };
}

export function tilesForScore(score: number): number {
  for (const b of BALANCE.MOVEMENT_BRACKETS) {
    if (score <= b.max) return b.tiles;
  }
  return BALANCE.MOVEMENT_BRACKETS.at(-1)!.tiles;
}

export function finalTiles(base: number, modifierDelta: number, speedBonus: number): number {
  return Math.max(BALANCE.MIN_TILES, base + modifierDelta + speedBonus);
}

export function advance(position: number, tiles: number): number {
  return Math.min(position + tiles, BALANCE.BOARD_MAX_TILE);
}

export function checkWin(
  copPos: number,
  robberPos: number,
  roundsPlayed: number,
): { role: Role; reason: 'CAUGHT' | 'ESCAPED' | 'EVADED' } | null {
  if (copPos >= robberPos) return { role: 'COP', reason: 'CAUGHT' };
  if (robberPos >= BALANCE.ESCAPE_TILE) return { role: 'ROBBER', reason: 'ESCAPED' };
  // Backstop only. The Robber always gains at least MIN_TILES, so an ordinary
  // match reaches ESCAPE_TILE long before this.
  if (roundsPlayed >= BALANCE.ROUND_HARD_CAP) return { role: 'ROBBER', reason: 'EVADED' };
  return null;
}
