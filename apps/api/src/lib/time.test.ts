import { describe, expect, it } from 'vitest';
import { dateKeyIn, startOfDayIn } from './time.js';

describe('time zone helpers', () => {
  it('finds the start of the local day', () => {
    const at = new Date('2026-03-10T20:00:00Z'); // 01:30 on 11 March in Kolkata
    expect(startOfDayIn(at, 'Asia/Kolkata').toISOString()).toBe('2026-03-10T18:30:00.000Z');
    expect(startOfDayIn(at, 'UTC').toISOString()).toBe('2026-03-10T00:00:00.000Z');
    expect(dateKeyIn(at, 'Asia/Kolkata')).toBe('2026-03-11');
  });

  it('handles DST days', () => {
    const at = new Date('2026-03-08T15:00:00Z'); // US DST starts 8 March 2026
    expect(startOfDayIn(at, 'America/New_York').toISOString()).toBe('2026-03-08T05:00:00.000Z');
  });
});
