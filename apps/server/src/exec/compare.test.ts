import { describe, expect, it } from 'vitest';
import { compare } from './compare.js';

describe('exact', () => {
  it('matches scalars and arrays', () => {
    expect(compare(5, 5, 'exact')).toBe(true);
    expect(compare([0, 1], [0, 1], 'exact')).toBe(true);
    expect(compare(true, true, 'exact')).toBe(true);
    expect(compare(null, null, 'exact')).toBe(true);
  });

  it('rejects order differences', () => {
    expect(compare([1, 0], [0, 1], 'exact')).toBe(false);
  });

  it('rejects a number that arrived as a string', () => {
    expect(compare('5', 5, 'exact')).toBe(false);
    expect(compare('true', true, 'exact')).toBe(false);
  });

  it('ignores object key order', () => {
    expect(compare({ b: 2, a: 1 }, { a: 1, b: 2 }, 'exact')).toBe(true);
  });

  it('accepts a Python tuple, which arrives as a JSON array', () => {
    // json.dumps((0, 1)) serialises to [0, 1]
    expect(compare([0, 1], [0, 1], 'exact')).toBe(true);
  });

  it('rejects a Python set, which arrives stringified by default=str', () => {
    expect(compare('{0, 1}', [0, 1], 'exact')).toBe(false);
  });
});

describe('unordered', () => {
  it('ignores order', () => {
    expect(compare([1, 0], [0, 1], 'unordered')).toBe(true);
    expect(compare([3, 1, 2], [1, 2, 3], 'unordered')).toBe(true);
  });

  it('respects multiplicity', () => {
    expect(compare([1, 1, 2], [1, 2, 2], 'unordered')).toBe(false);
  });

  it('rejects length mismatches', () => {
    expect(compare([0], [0, 1], 'unordered')).toBe(false);
  });

  it('returns false without throwing when either side is not an array', () => {
    expect(compare(5, [0, 1], 'unordered')).toBe(false);
    expect(compare(null, [0, 1], 'unordered')).toBe(false);
    expect(compare([0, 1], 'nope', 'unordered')).toBe(false);
  });
});

describe('float', () => {
  it('accepts values within epsilon', () => {
    expect(compare(0.1 + 0.2, 0.3, 'float')).toBe(true);
  });

  it('rejects values outside epsilon', () => {
    expect(compare(0.3001, 0.3, 'float')).toBe(false);
  });

  it('returns false without throwing on non-numbers', () => {
    expect(compare('0.3', 0.3, 'float')).toBe(false);
    expect(compare(null, 0.3, 'float')).toBe(false);
  });

  it('handles NaN and Infinity without claiming equality by subtraction', () => {
    expect(compare(NaN, NaN, 'float')).toBe(false);
    expect(compare(Infinity, Infinity, 'float')).toBe(true);
  });
});
