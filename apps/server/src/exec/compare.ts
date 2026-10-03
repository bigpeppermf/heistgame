import type { Comparison } from '@heist/shared';

const FLOAT_EPSILON = 1e-6;

/** Canonical JSON with sorted object keys, so key order never matters. */
function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'undefined';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
}

export function compare(actual: unknown, expected: unknown, mode: Comparison): boolean {
  if (mode === 'unordered') {
    if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
    if (actual.length !== expected.length) return false;
    const key = (xs: unknown[]) => xs.map(stable).sort().join('\u0000');
    return key(actual) === key(expected);
  }

  if (mode === 'float') {
    if (typeof actual !== 'number' || typeof expected !== 'number') return false;
    if (!Number.isFinite(actual) || !Number.isFinite(expected)) return actual === expected;
    return Math.abs(actual - expected) < FLOAT_EPSILON;
  }

  return stable(actual) === stable(expected);
}
