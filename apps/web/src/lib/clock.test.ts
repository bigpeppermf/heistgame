import { describe, expect, it } from 'vitest';
import { formatClock, remainingMs } from './clock.js';

describe('remainingMs', () => {
  it('returns the gap to the deadline', () => {
    expect(remainingMs(1_010_000, 1_000_000)).toBe(10_000);
  });

  it('never goes negative', () => {
    expect(remainingMs(1_000_000, 1_010_000)).toBe(0);
  });

  it('returns zero for a phase with no deadline', () => {
    expect(remainingMs(null, 1_000_000)).toBe(0);
  });
});

describe('formatClock', () => {
  it('formats as m:ss', () => {
    expect(formatClock(150_000)).toBe('2:30');
    expect(formatClock(61_000)).toBe('1:01');
    expect(formatClock(9_000)).toBe('0:09');
  });

  it('rounds up so the clock never shows 0:00 while time remains', () => {
    expect(formatClock(1)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
  });
});
