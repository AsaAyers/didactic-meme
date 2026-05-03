/**
 * Weekday characters used in the `repeat:` inline field alphabet.
 * s=Sunday, m=Monday, t=Tuesday, w=Wednesday, h=Thursday, f=Friday, a=Saturday
 */
const WEEKDAY_MAP: Record<string, number> = {
  s: 0,
  m: 1,
  t: 2,
  w: 3,
  h: 4,
  f: 5,
  a: 6,
};

export type RepeatSchedule = {
  skipWeeks: number;
  days: Set<number>;
};

/**
 * Parse a `repeat:` value (e.g. "smtwhfa", "1s", "2mwf") into a schedule.
 * Grammar: `<skipWeeks?>` (integer, defaults to 0) followed by one or more
 * weekday characters from the alphabet `smtwhfa`.
 * Returns null if the string is not a valid repeat value.
 */
export function parseRepeat(value: string): RepeatSchedule | null {
  const match = value.match(/^(\d+)?([smtwhfa]+)$/);
  if (!match) return null;
  const skipWeeks = match[1] !== undefined ? parseInt(match[1], 10) : 0;
  const days = new Set<number>();
  for (const ch of match[2]) {
    days.add(WEEKDAY_MAP[ch]);
  }
  if (days.size === 0) return null;
  return { skipWeeks, days };
}

/**
 * Format a Date to an ISO date string "YYYY-MM-DD" using local calendar.
 */
export function formatDateStr(date: Date): string {
  const year = date.getFullYear().toString();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse an ISO date string "YYYY-MM-DD" into a Date (local midnight).
 * Returns null if the string is not in the expected format.
 */
export function parseDateStr(dateStr: string): Date | null {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  return new Date(year, month, day);
}

/**
 * Return a new Date that is `n` calendar days after `date`.
 */
export function addDays(date: Date, n: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + n);
  return result;
}

/**
 * Return the number of calendar days between two dates (later - earlier).
 * Uses UTC to avoid DST skew.
 */
export function diffDays(later: Date, earlier: Date): number {
  const laterMs = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
  const earlierMs = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  return Math.round((laterMs - earlierMs) / (1000 * 60 * 60 * 24));
}

/**
 * Compute the next due date for a repeating task.
 *
 * Algorithm:
 *   minDate = completionDate + skipWeeks*7 + 1  (strictly after completion)
 *   newDue  = first date >= minDate whose weekday is in schedule.days
 */
export function computeNextDue(completionDate: Date, schedule: RepeatSchedule): Date {
  const { skipWeeks, days } = schedule;
  const minDate = addDays(completionDate, skipWeeks * 7 + 1);
  let candidate = new Date(minDate);
  // 400 iterations is a safe upper bound: even with a single allowed weekday
  // the gap between occurrences is at most 6 days (< 7), so we will always
  // find a match well within 7 iterations.  400 is kept as a defensive limit.
  for (let i = 0; i < 400; i++) {
    if (days.has(candidate.getDay())) {
      return candidate;
    }
    candidate = addDays(candidate, 1);
  }
  // Safety fallback — should never be reached when days is non-empty.
  return minDate;
}
