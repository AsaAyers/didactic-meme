type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const DATE_PART_KEYS = [
  "year",
  "month",
  "day",
  "hour",
  "minute",
  "second",
] as const;

type DatePartKey = (typeof DATE_PART_KEYS)[number];

function isDatePartKey(value: string): value is DatePartKey {
  return (DATE_PART_KEYS as readonly string[]).includes(value);
}

/**
 * Convert an instant to a Date whose local-wall-clock components match
 * the requested IANA timezone at that instant.
 */
export function toTimezoneDate(date: Date, timezone?: string): Date {
  if (!timezone) return date;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = parts.reduce<Partial<DateParts>>((acc, part) => {
    if (isDatePartKey(part.type)) {
      acc[part.type] = Number(part.value);
    }
    return acc;
  }, {});

  if (
    values.year === undefined ||
    values.month === undefined ||
    values.day === undefined ||
    values.hour === undefined ||
    values.minute === undefined ||
    values.second === undefined
  ) {
    return date;
  }

  return new Date(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
    date.getMilliseconds(),
  );
}
