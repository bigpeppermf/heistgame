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

describe('clock-skew correction', () => {
  // Every deadline the server sends is an absolute server timestamp, so a
  // client with a wrong clock counts down to the wrong moment. This is the
  // bug as observed: a laptop ~2 days behind showed ~2900 minutes remaining
  // on a 10-minute CODING phase.
  const serverNow = 1_700_000_000_000;
  const deadlineAt = serverNow + 600_000; // a 10-minute phase
  const localNow = serverNow - 48 * 3_600_000; // laptop is 48h behind

  it('reproduces the bad countdown when the local clock is trusted', () => {
    expect(Math.round(remainingMs(deadlineAt, localNow) / 60_000)).toBe(2890);
  });

  it('counts down correctly once the snapshot offset is applied', () => {
    const offset = serverNow - localNow;
    expect(formatClock(remainingMs(deadlineAt, localNow + offset))).toBe('10:00');
  });

  it('is a no-op for a client whose clock already agrees', () => {
    const offset = serverNow - serverNow;
    expect(offset).toBe(0);
    expect(formatClock(remainingMs(deadlineAt, serverNow + offset))).toBe('10:00');
  });

  it('corrects a clock that is ahead as well as behind', () => {
    const ahead = serverNow + 90_000; // 90s fast: phase would end early
    expect(formatClock(remainingMs(deadlineAt, ahead))).toBe('8:30');
    expect(formatClock(remainingMs(deadlineAt, ahead + (serverNow - ahead)))).toBe('10:00');
  });
});
