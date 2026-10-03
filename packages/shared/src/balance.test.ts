import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance.js';
import { toPublicProblem, type Problem } from './state.js';

describe('balance invariants', () => {
  it('weights sum to 100', () => {
    expect(BALANCE.CORRECTNESS_WEIGHT + BALANCE.STYLE_WEIGHT).toBe(100);
  });

  it('movement brackets are ascending and end at 100', () => {
    const maxes = BALANCE.MOVEMENT_BRACKETS.map((b) => b.max);
    expect(maxes).toEqual([...maxes].sort((a, b) => a - b));
    expect(maxes.at(-1)).toBe(100);
  });

  it('robber starts ahead of the cop but short of the escape', () => {
    expect(BALANCE.ROBBER_START).toBeGreaterThan(BALANCE.COP_START);
    expect(BALANCE.ROBBER_START).toBeLessThan(BALANCE.ESCAPE_TILE);
  });

  it('stash tiles are all on the board', () => {
    for (const t of BALANCE.STASH_TILES) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(BALANCE.BOARD_MAX_TILE);
    }
  });
});

describe('toPublicProblem', () => {
  it('strips hiddenTests', () => {
    const p: Problem = {
      id: 'x', title: 'X', narrative: 'n',
      functionName: { python: 'f', javascript: 'f' },
      starterCode: { python: '', javascript: '' },
      sampleTests: [{ input: [1], expected: 1 }],
      hiddenTests: [{ input: [2], expected: 2 }],
      comparison: 'exact',
    };
    expect('hiddenTests' in toPublicProblem(p)).toBe(false);
  });
});
