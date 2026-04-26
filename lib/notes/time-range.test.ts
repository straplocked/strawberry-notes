import { describe, expect, it } from 'vitest';
import { isTimeRange, timeRangeBounds, timeRangeLabel } from './time-range';

describe('isTimeRange', () => {
  it('accepts the four documented values', () => {
    for (const v of ['today', 'yesterday', 'past7', 'past30']) {
      expect(isTimeRange(v)).toBe(true);
    }
  });

  it('rejects everything else', () => {
    for (const v of ['', 'tomorrow', 'past60', 'all', null, undefined]) {
      expect(isTimeRange(v)).toBe(false);
    }
  });
});

describe('timeRangeBounds', () => {
  // Sun, 2026-04-26 14:30 local
  const now = new Date(2026, 3, 26, 14, 30, 0);

  it('today: from start-of-today, no upper bound', () => {
    const { from, to } = timeRangeBounds('today', now);
    expect(from).toEqual(new Date(2026, 3, 26, 0, 0, 0, 0));
    expect(to).toBeNull();
  });

  it('yesterday: [start-of-yesterday, start-of-today)', () => {
    const { from, to } = timeRangeBounds('yesterday', now);
    expect(from).toEqual(new Date(2026, 3, 25, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 3, 26, 0, 0, 0, 0));
  });

  it('past7: rolling 7×24h window from now', () => {
    const { from, to } = timeRangeBounds('past7', now);
    expect(from.getTime()).toBe(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(to).toBeNull();
  });

  it('past30: rolling 30×24h window from now', () => {
    const { from, to } = timeRangeBounds('past30', now);
    expect(from.getTime()).toBe(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(to).toBeNull();
  });

  it('handles month boundary for yesterday correctly', () => {
    const monthStart = new Date(2026, 4, 1, 9, 0, 0); // 2026-05-01 09:00
    const { from, to } = timeRangeBounds('yesterday', monthStart);
    expect(from).toEqual(new Date(2026, 3, 30, 0, 0, 0, 0)); // 2026-04-30
    expect(to).toEqual(new Date(2026, 4, 1, 0, 0, 0, 0));    // 2026-05-01
  });
});

describe('timeRangeLabel', () => {
  it('renders the user-facing label', () => {
    expect(timeRangeLabel('today')).toBe('Today');
    expect(timeRangeLabel('yesterday')).toBe('Yesterday');
    expect(timeRangeLabel('past7')).toBe('Past 7 days');
    expect(timeRangeLabel('past30')).toBe('Past 30 days');
  });
});
