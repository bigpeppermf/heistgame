import { describe, expect, it } from 'vitest';
import { BALANCE } from '@heist/shared';
import {
  advance, checkWin, finalTiles, rubricTotal, scoreSubmission, tilesForScore,
} from './scoring.js';

describe('rubricTotal', () => {
  it('sums the five criteria', () => {
    expect(rubricTotal({
      naming: 5, readability: 4, comments: 3, organization: 2, simplicity: 1, note: '',
    })).toBe(15);
  });
});

describe('scoreSubmission', () => {
  it('gives 100 for all tests passed and a perfect rubric', () => {
    const s = scoreSubmission(10, 10, 20);
    expect(s.correctness).toBe(80);
    expect(s.style).toBe(20);
    expect(s.total).toBe(100);
  });

  it('scales style by correctness, so zero correct is worth zero total', () => {
    const s = scoreSubmission(0, 10, 20);
    expect(s.correctness).toBe(0);
    expect(s.style).toBe(0);
    expect(s.total).toBe(0);
  });

  it('halves style at half correctness', () => {
    const s = scoreSubmission(5, 10, 20);
    expect(s.correctness).toBe(40);
    expect(s.style).toBe(10);
    expect(s.total).toBe(50);
  });

  it('treats a zero-test problem as zero rather than dividing by zero', () => {
    expect(scoreSubmission(0, 0, 20).total).toBe(0);
  });
});

describe('tilesForScore', () => {
  it.each([
    [0, 1], [30, 1], [31, 1], [50, 1], [51, 2],
    [70, 2], [71, 2], [90, 2], [91, 3], [100, 3],
  ])('score %i yields %i tiles', (score, tiles) => {
    expect(tilesForScore(score)).toBe(tiles);
  });
});

describe('finalTiles', () => {
  it('adds modifiers and the speed bonus', () => {
    expect(finalTiles(3, 1, 1)).toBe(5);
  });

  it('never drops below one tile even when roadblocked', () => {
    expect(finalTiles(1, -1, 0)).toBe(1);
    expect(finalTiles(1, -5, 0)).toBe(1);
  });
});

describe('advance', () => {
  it('clamps at the final tile and does not carry overflow', () => {
    expect(advance(11, 4)).toBe(14);
    expect(advance(14, 5)).toBe(14);
  });

  it('moves normally mid-board', () => {
    expect(advance(3, 4)).toBe(7);
  });
});

describe('checkWin', () => {
  it('gives the cop the win on a catch', () => {
    expect(checkWin(7, 7, 1)).toEqual({ role: 'COP', reason: 'CAUGHT' });
    expect(checkWin(8, 7, 1)).toEqual({ role: 'COP', reason: 'CAUGHT' });
  });

  it('gives the cop ties even when the robber also reached the escape', () => {
    expect(checkWin(14, 14, 3)).toEqual({ role: 'COP', reason: 'CAUGHT' });
  });

  it('gives the robber the win on escape', () => {
    expect(checkWin(10, 14, 3)).toEqual({ role: 'ROBBER', reason: 'ESCAPED' });
  });

  it('no longer ends the match merely because rounds have passed', () => {
    // The old three-round limit is gone; only the board ends a match.
    expect(checkWin(5, 9, 3)).toBeNull();
    expect(checkWin(5, 9, 10)).toBeNull();
  });

  it('awards the robber the win at the hard cap, as a backstop', () => {
    expect(checkWin(5, 9, BALANCE.ROUND_HARD_CAP))
      .toEqual({ role: 'ROBBER', reason: 'EVADED' });
  });

  it('returns null mid-match', () => {
    expect(checkWin(4, 7, 1)).toBeNull();
  });
});
