import { describe, expect, it } from 'vitest';
import { BALANCE } from '@heist/shared';
import {
  FALLBACK_RUBRIC, judgeStyle, normalizeRubric, RUBRIC_MAX,
} from './gemini.js';
import { rubricTotal } from '../match/scoring.js';

describe('rubric bounds', () => {
  it('maxima sum to the shared rubric maximum', () => {
    const sum = Object.values(RUBRIC_MAX).reduce((a, b) => a + b, 0);
    expect(sum).toBe(BALANCE.STYLE_RUBRIC_MAX);
  });

  it('the fallback sums to exactly 14, as the spec requires', () => {
    expect(rubricTotal(FALLBACK_RUBRIC)).toBe(14);
  });
});

describe('normalizeRubric — REVIEW FOCUS 2', () => {
  it('clamps values above each field maximum', () => {
    const r = normalizeRubric({
      naming: 9, readability: 100, comments: 7, organization: 5, simplicity: 4, note: 'x',
    });
    expect(r).toEqual({
      naming: 5, readability: 5, comments: 4, organization: 3, simplicity: 3, note: 'x',
    });
    expect(rubricTotal(r)).toBe(BALANCE.STYLE_RUBRIC_MAX);
  });

  it('clamps negatives to zero', () => {
    expect(normalizeRubric({ naming: -3 }).naming).toBe(0);
  });

  it('defaults missing fields to zero rather than NaN', () => {
    const r = normalizeRubric({ naming: 3 });
    expect(rubricTotal(r)).toBe(3);
    expect(Number.isNaN(rubricTotal(r))).toBe(false);
  });

  it('treats non-numeric and non-finite values as zero', () => {
    expect(normalizeRubric({ naming: 'five' }).naming).toBe(0);
    expect(normalizeRubric({ naming: NaN }).naming).toBe(0);
    expect(normalizeRubric({ naming: Infinity }).naming).toBe(0);
    expect(normalizeRubric({ naming: null }).naming).toBe(0);
  });

  it('rounds fractional scores', () => {
    expect(normalizeRubric({ naming: 3.7 }).naming).toBe(4);
  });

  it('survives a non-object payload', () => {
    expect(rubricTotal(normalizeRubric(null))).toBe(0);
    expect(rubricTotal(normalizeRubric('garbage'))).toBe(0);
    expect(rubricTotal(normalizeRubric([1, 2, 3]))).toBe(0);
  });

  it('coerces a non-string note and truncates a long one', () => {
    expect(normalizeRubric({ note: 42 }).note).toBe('');
    expect(normalizeRubric({ note: 'x'.repeat(500) }).note.length).toBe(200);
  });
});

describe('judgeStyle', () => {
  it('uses a well-formed response', async () => {
    const call = async () => JSON.stringify({
      naming: 5, readability: 4, comments: 2, organization: 3, simplicity: 3, note: 'tidy',
    });
    const r = await judgeStyle('def f(): pass', 'python', call);
    expect(rubricTotal(r)).toBe(17);
    expect(r.note).toBe('tidy');
  });

  it('falls back when the response is not JSON', async () => {
    const r = await judgeStyle('x', 'python', async () => 'I think this code is nice!');
    expect(r).toEqual(FALLBACK_RUBRIC);
  });

  it('falls back when the call throws', async () => {
    const r = await judgeStyle('x', 'python', async () => { throw new Error('503'); });
    expect(r).toEqual(FALLBACK_RUBRIC);
  });

  it('falls back when the call outlives the timeout', async () => {
    const slow = () => new Promise<string>((resolve) => {
      setTimeout(() => resolve('{}'), BALANCE.GEMINI_TIMEOUT_MS + 500);
    });
    const r = await judgeStyle('x', 'python', slow);
    expect(r).toEqual(FALLBACK_RUBRIC);
  }, 10_000);

  it('strips a markdown code fence before parsing', async () => {
    const fenced = async () => '```json\n{"naming":5,"readability":5,"comments":4,"organization":3,"simplicity":3,"note":"ok"}\n```';
    const r = await judgeStyle('x', 'python', fenced);
    expect(rubricTotal(r)).toBe(20);
  });
});
