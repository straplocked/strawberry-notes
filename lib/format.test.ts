import { describe, expect, it } from 'vitest';
import { formatDate } from './format';

const now = new Date('2026-04-18T15:30:00');

describe('formatDate', () => {
  it('shows "Today" + lowercase am/pm for same-day dates', () => {
    const iso = new Date('2026-04-18T09:05:00').toISOString();
    const out = formatDate(iso, now);
    expect(out.startsWith('Today · ')).toBe(true);
    // Only the time portion is lowercased.
    expect(out).toMatch(/\d{1,2}:\d{2}\s?(am|pm)$/);
    expect(out).not.toMatch(/AM|PM/);
  });

  it('returns "Yesterday" exactly one calendar day back', () => {
    const iso = new Date('2026-04-17T23:59:00').toISOString();
    expect(formatDate(iso, now)).toBe('Yesterday');
  });

  it('returns weekday name within the previous week', () => {
    // 2026-04-14 is a Tuesday; now is Saturday 2026-04-18.
    const iso = new Date('2026-04-14T10:00:00').toISOString();
    expect(formatDate(iso, now)).toBe('Tuesday');
  });

  it('returns month + day when older than a week but same year', () => {
    const iso = new Date('2026-01-05T10:00:00').toISOString();
    const out = formatDate(iso, now);
    expect(out).toContain('Jan');
    expect(out).toContain('5');
    expect(out).not.toMatch(/\d{4}/);
  });

  it('includes the year for dates in a different year', () => {
    const iso = new Date('2024-11-02T10:00:00').toISOString();
    const out = formatDate(iso, now);
    expect(out).toContain('2024');
    expect(out).toContain('Nov');
  });

  it('treats midnight crossings as a full day difference', () => {
    // 00:05 of "today" versus 23:55 of "yesterday" is only 10 minutes,
    // but formatDate uses calendar-day diff — that must resolve to "Yesterday".
    const earlyToday = new Date('2026-04-18T00:05:00');
    const lateYesterday = new Date('2026-04-17T23:55:00').toISOString();
    expect(formatDate(lateYesterday, earlyToday)).toBe('Yesterday');
  });
});
