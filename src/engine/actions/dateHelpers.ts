import { addDays, format } from "date-fns";

export function formatDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * Resolve date-relative literals to ISO date strings.
 * Handles "today", "yesterday" (today - 1 day), and "tomorrow" (today + 1 day).
 * Other values are passed through unchanged.
 */
export function resolveToValue(value: string, today: Date): string {
  if (value === "today") return formatDate(today);
  if (value === "yesterday") return formatDate(addDays(today, -1));
  if (value === "tomorrow") return formatDate(addDays(today, 1));
  return value;
}
