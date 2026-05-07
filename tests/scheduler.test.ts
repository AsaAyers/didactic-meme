/**
 * Unit tests for createAlertScheduler in src/engine/scheduler.ts.
 *
 * These tests exercise the schedule-matching and deduplication logic using
 * vitest's fake-timer infrastructure so no real wall-clock time is needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAlertScheduler } from "../src/engine/scheduler.js";

describe("createAlertScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Empty schedule — alert never fires
  // ---------------------------------------------------------------------------

  it("never fires when schedule is empty", async () => {
    const alerts: string[] = [];
    const stop = createAlertScheduler(
      () => [],
      async () => {
        alerts.push("fired");
      },
      1_000,
    );

    await vi.advanceTimersByTimeAsync(5_000);
    expect(alerts).toHaveLength(0);

    stop();
  });

  // ---------------------------------------------------------------------------
  // Fires at the scheduled time
  // ---------------------------------------------------------------------------

  it("fires when the current time matches a scheduled entry", async () => {
    vi.setSystemTime(new Date(2026, 4, 7, 8, 0, 0)); // 08:00:00
    const alerts: string[] = [];
    const stop = createAlertScheduler(
      () => ["08:00"],
      async () => {
        alerts.push("fired");
      },
      1_000,
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expect(alerts).toHaveLength(1);

    stop();
  });

  it("does not fire when the current time does not match the schedule", async () => {
    vi.setSystemTime(new Date(2026, 4, 7, 9, 30, 0)); // 09:30
    const alerts: string[] = [];
    const stop = createAlertScheduler(
      () => ["08:00", "18:00"],
      async () => {
        alerts.push("fired");
      },
      1_000,
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expect(alerts).toHaveLength(0);

    stop();
  });

  it("fires for any entry in a multi-time schedule that matches", async () => {
    vi.setSystemTime(new Date(2026, 4, 7, 18, 0, 0)); // 18:00
    const alerts: string[] = [];
    const stop = createAlertScheduler(
      () => ["08:00", "12:00", "18:00"],
      async () => {
        alerts.push("fired");
      },
      1_000,
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expect(alerts).toHaveLength(1);

    stop();
  });

  // ---------------------------------------------------------------------------
  // Fires at most once per minute window
  // ---------------------------------------------------------------------------

  it("fires at most once even when the interval checks multiple times in the same minute", async () => {
    vi.setSystemTime(new Date(2026, 4, 7, 8, 0, 0)); // 08:00:00
    const alerts: string[] = [];
    const stop = createAlertScheduler(
      () => ["08:00"],
      async () => {
        alerts.push("fired");
      },
      1_000, // check every second
    );

    // Advance 5 seconds — five checks, all at 08:00 — only one alert.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(alerts).toHaveLength(1);

    stop();
  });

  // ---------------------------------------------------------------------------
  // Fires again at a subsequent scheduled time
  // ---------------------------------------------------------------------------

  it("fires again when a different scheduled time is reached", async () => {
    vi.setSystemTime(new Date(2026, 4, 7, 8, 0, 0)); // 08:00
    const alerts: string[] = [];
    const stop = createAlertScheduler(
      () => ["08:00", "09:00"],
      async () => {
        alerts.push("fired");
      },
      1_000,
    );

    // First check fires at 08:00.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(alerts).toHaveLength(1);

    // Jump clock to 09:00.
    vi.setSystemTime(new Date(2026, 4, 7, 9, 0, 0));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(alerts).toHaveLength(2);

    stop();
  });

  it("fires again at the same time on the next day", async () => {
    vi.setSystemTime(new Date(2026, 4, 7, 8, 0, 0)); // day 1, 08:00
    const alerts: string[] = [];
    const stop = createAlertScheduler(
      () => ["08:00"],
      async () => {
        alerts.push("fired");
      },
      1_000,
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expect(alerts).toHaveLength(1);

    // Jump to the next day at 08:00.
    vi.setSystemTime(new Date(2026, 4, 8, 8, 0, 0));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(alerts).toHaveLength(2);

    stop();
  });

  // ---------------------------------------------------------------------------
  // stop() cancels the interval
  // ---------------------------------------------------------------------------

  it("stop function cancels the interval so onAlert is never called", async () => {
    vi.setSystemTime(new Date(2026, 4, 7, 8, 0, 0));
    const alerts: string[] = [];
    const stop = createAlertScheduler(
      () => ["08:00"],
      async () => {
        alerts.push("fired");
      },
      1_000,
    );

    // Cancel before the first tick.
    stop();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(alerts).toHaveLength(0);
  });

  it("stop function cancels the interval even if called after the first fire", async () => {
    vi.setSystemTime(new Date(2026, 4, 7, 8, 0, 0));
    const alerts: string[] = [];
    const stop = createAlertScheduler(
      () => ["08:00"],
      async () => {
        alerts.push("fired");
      },
      1_000,
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expect(alerts).toHaveLength(1);

    // Stop, then jump to next day at 08:00.
    stop();
    vi.setSystemTime(new Date(2026, 4, 8, 8, 0, 0));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(alerts).toHaveLength(1); // no additional fire
  });
});
