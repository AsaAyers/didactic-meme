/**
 * Schedule-based alert runner for watch mode.
 *
 * createAlertScheduler sets up a recurring interval check. On each tick,
 * `getSchedule` is called to obtain the list of "HH:MM" times at which the
 * alert should fire. If the current local-clock HH:MM is in that list and has
 * not already fired in this minute window, `onAlert` is invoked.
 */

/**
 * Start a recurring schedule check.
 *
 * @param getSchedule  Called on every check interval; returns the current list
 *                     of "HH:MM" times (24-hour clock, local time) at which the
 *                     alert should fire. Returning an empty array disables the
 *                     alert entirely.
 * @param onAlert      Async callback invoked when the current time is in the
 *                     schedule.  Errors are caught and logged to the console.
 * @param intervalMs   Check period in milliseconds. Defaults to 60 000 (1 min).
 * @returns            A stop function — call it to cancel the interval.
 */
export function createAlertScheduler(
  getSchedule: () => string[],
  onAlert: () => Promise<void>,
  intervalMs = 60_000,
): () => void {
  // Track the last fired "YYYY-MM-DDTHH:MM" to prevent double-firing within
  // the same minute window while still allowing the same time on a future day.
  let lastFiredKey = "";

  const check = (): void => {
    const schedule = getSchedule();
    if (schedule.length === 0) return;

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const currentMinute = `${hh}:${mm}`;

    if (!schedule.includes(currentMinute)) return;

    const yyyy = String(now.getFullYear());
    const mo = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const firedKey = `${yyyy}-${mo}-${dd}T${currentMinute}`;

    if (firedKey !== lastFiredKey) {
      lastFiredKey = firedKey;
      console.log(`[watch] Alert schedule: firing at ${currentMinute}`);
      onAlert().catch((err: unknown) => {
        console.error(
          "[watch] Error running scheduled alert:",
          (err as Error).message,
        );
      });
    }
  };

  const timer = setInterval(check, intervalMs);

  return (): void => {
    clearInterval(timer);
  };
}
