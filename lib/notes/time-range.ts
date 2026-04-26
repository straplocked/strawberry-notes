/**
 * Time-range filters for the notes list.
 *
 * "Today" and "Yesterday" are *calendar* days computed from the host's local
 * time zone — that matches what a single-user self-hoster expects ("show me
 * what I touched today"). "Past 7 / 30 days" are rolling windows from `now`
 * because users think of them that way ("anything I've worked on this week"
 * shouldn't disappear at midnight on Sunday).
 *
 * The filter applies to `notes.updated_at`. We don't filter on `created_at`
 * because the user's mental model is "what did I work on" rather than "what
 * did I create" — they want to find a note even if they touched it today
 * after creating it months ago.
 */

export const TIME_RANGES = ['today', 'yesterday', 'past7', 'past30'] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

export function isTimeRange(value: string | null | undefined): value is TimeRange {
  return !!value && (TIME_RANGES as readonly string[]).includes(value);
}

export interface TimeRangeBounds {
  /** Inclusive lower bound. */
  from: Date;
  /** Exclusive upper bound, or `null` to mean "no upper bound". */
  to: Date | null;
}

/**
 * Compute the [from, to) bounds for a time-range tag relative to `now`.
 * Returned dates are concrete instants — the caller compares `updated_at`
 * against them.
 */
export function timeRangeBounds(range: TimeRange, now: Date = new Date()): TimeRangeBounds {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  switch (range) {
    case 'today':
      return { from: startOfToday, to: null };
    case 'yesterday': {
      const startOfYesterday = new Date(startOfToday);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);
      return { from: startOfYesterday, to: startOfToday };
    }
    case 'past7':
      // Rolling 7×24h window. Using `now - 7d` rather than start-of-day-7-ago
      // keeps the semantics intuitive ("anything in the past week"); a hop of
      // a few hours after midnight doesn't drop yesterday's notes off the
      // edge of the list.
      return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: null };
    case 'past30':
      return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), to: null };
  }
}

/** Human label, used by the sidebar and any future MCP tool description. */
export function timeRangeLabel(range: TimeRange): string {
  switch (range) {
    case 'today':
      return 'Today';
    case 'yesterday':
      return 'Yesterday';
    case 'past7':
      return 'Past 7 days';
    case 'past30':
      return 'Past 30 days';
  }
}
