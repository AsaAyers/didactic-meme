import { describe, it, expect } from 'vitest';
import {
  parseRepeat,
  computeNextDue,
  formatDateStr,
  parseDateStr,
  addDays,
  diffDays,
} from '../src/rules/scheduleUtils.js';

describe('parseRepeat', () => {
  it('parses all-days repeat (daily)', () => {
    const s = parseRepeat('smtwhfa');
    expect(s).not.toBeNull();
    expect(s!.skipWeeks).toBe(0);
    expect(s!.days).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
  });

  it('parses a single-day repeat without skip weeks', () => {
    const s = parseRepeat('s');
    expect(s).not.toBeNull();
    expect(s!.skipWeeks).toBe(0);
    expect(s!.days).toEqual(new Set([0])); // Sunday
  });

  it('parses skipWeeks with a single day', () => {
    const s = parseRepeat('1s');
    expect(s).not.toBeNull();
    expect(s!.skipWeeks).toBe(1);
    expect(s!.days).toEqual(new Set([0]));
  });

  it('parses skipWeeks=2 with Sunday', () => {
    const s = parseRepeat('2s');
    expect(s).not.toBeNull();
    expect(s!.skipWeeks).toBe(2);
    expect(s!.days).toEqual(new Set([0]));
  });

  it('parses skipWeeks with multiple days', () => {
    const s = parseRepeat('3mwf');
    expect(s).not.toBeNull();
    expect(s!.skipWeeks).toBe(3);
    expect(s!.days).toEqual(new Set([1, 3, 5]));
  });

  it('returns null for invalid repeat value', () => {
    expect(parseRepeat('')).toBeNull();
    expect(parseRepeat('2')).toBeNull();
    expect(parseRepeat('xyz')).toBeNull();
    expect(parseRepeat('2x')).toBeNull();
  });
});

describe('computeNextDue', () => {
  // May 3 2026 = Sunday (getDay() = 0)
  const sunday = new Date(2026, 4, 3); // month is 0-indexed

  it('daily repeat (skipWeeks=0, all days) — next day after completion', () => {
    const schedule = parseRepeat('smtwhfa')!;
    const next = computeNextDue(sunday, schedule);
    expect(formatDateStr(next)).toBe('2026-05-04'); // Monday
  });

  it('weekly on Sunday (skipWeeks=0): next Sunday is 7 days away', () => {
    const schedule = parseRepeat('s')!;
    const next = computeNextDue(sunday, schedule);
    expect(formatDateStr(next)).toBe('2026-05-10'); // +7 days, next Sunday
  });

  it('skipWeeks=1 on Sunday: minDate is +8 days (Monday), next Sunday is +14', () => {
    const schedule = parseRepeat('1s')!;
    const next = computeNextDue(sunday, schedule);
    expect(formatDateStr(next)).toBe('2026-05-17'); // +14 days
  });

  it('skipWeeks=1 on Saturday: minDate is +8 days (Sunday), next Sunday is +8', () => {
    // Saturday May 2 2026
    const saturday = new Date(2026, 4, 2);
    const schedule = parseRepeat('1s')!;
    const next = computeNextDue(saturday, schedule);
    expect(formatDateStr(next)).toBe('2026-05-10'); // Sunday +8 days
  });

  it('skipWeeks=0 Saturday (repeat:a): next Saturday is +7 days', () => {
    // Saturday May 2 2026, repeat:a (Saturday only)
    const saturday = new Date(2026, 4, 2);
    const schedule = parseRepeat('a')!;
    const next = computeNextDue(saturday, schedule);
    expect(formatDateStr(next)).toBe('2026-05-09'); // +7 days
  });

  it('weekday-only repeat (m–f): next weekday after a Friday', () => {
    // Friday May 1 2026
    const friday = new Date(2026, 4, 1);
    const schedule = parseRepeat('mtwhf')!;
    const next = computeNextDue(friday, schedule);
    expect(formatDateStr(next)).toBe('2026-05-04'); // Monday (skips Sat+Sun)
  });
});

describe('date helpers', () => {
  it('formatDateStr formats correctly', () => {
    expect(formatDateStr(new Date(2026, 4, 3))).toBe('2026-05-03');
    expect(formatDateStr(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('parseDateStr parses YYYY-MM-DD', () => {
    const d = parseDateStr('2026-05-03');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(4); // 0-indexed
    expect(d!.getDate()).toBe(3);
  });

  it('parseDateStr returns null for invalid strings', () => {
    expect(parseDateStr('not-a-date')).toBeNull();
    expect(parseDateStr('2026/05/03')).toBeNull();
  });

  it('addDays adds calendar days', () => {
    const d = new Date(2026, 4, 3);
    expect(formatDateStr(addDays(d, 7))).toBe('2026-05-10');
    expect(formatDateStr(addDays(d, -1))).toBe('2026-05-02');
  });

  it('diffDays computes the difference', () => {
    const a = new Date(2026, 4, 3);
    const b = new Date(2026, 4, 17);
    expect(diffDays(b, a)).toBe(14);
    expect(diffDays(a, b)).toBe(-14);
  });
});
