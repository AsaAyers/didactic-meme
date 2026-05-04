/**
 * Unit tests for completedTaskRollover.
 *
 * The E2E vault (tests/test_vault/) exercises the "happy path" — tasks that
 * are stamped today and get a clone inserted — via multiple fixture files
 * (repeat-basic, repeat-rollover, repeat-today-fallback scenarios, etc.).
 *
 * Tests here cover the cases the E2E vault does NOT exercise:
 *   - A task with a done date that is NOT today is skipped (not processed).
 *   - A task that already has `copied:1` is NOT re-processed (idempotency).
 *   - A task with done:today but NO repeat: field is NOT copied.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import { runRuleSpec } from "../src/engine/ruleSpecRunner.js";
import { completedTaskRolloverSpec } from "../src/rules/completedTaskRollover.js";
import type { RuleContext } from "../src/rules/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS = join(__dirname, "test_vault", "scenarios");

const TODAY = new Date(2026, 4, 3); // 2026-05-03

function makeCtx(vaultPath: string): RuleContext {
  return {
    vaultPath,
    today: TODAY,
    dryRun: false,
    env: {},
    readFile: (path: string) => fs.readFile(path, "utf-8").catch(() => ""),
  };
}

describe("completedTaskRollover — tasks NOT processed", () => {
  it("does not roll over a task whose done date is not today", async () => {
    // rollover-not-today/tasks.md: "* [x] Old task done:2026-01-01"
    const ctx = makeCtx(join(SCENARIOS, "rollover-not-today"));
    const result = await runRuleSpec(completedTaskRolloverSpec, ctx);
    expect(result.changes).toHaveLength(0);
  });

  it("does not re-process a task that already has copied:1 (idempotency)", async () => {
    // rollover-already-copied/tasks.md:
    //   "* [x] Already rolled task done:2026-05-03 copied:1"
    //   "* [ ] Already rolled task"
    const ctx = makeCtx(join(SCENARIOS, "rollover-already-copied"));
    const result = await runRuleSpec(completedTaskRolloverSpec, ctx);
    expect(result.changes).toHaveLength(0);
  });

  it("does not roll over a task with done:today but no repeat: field", async () => {
    // rollover-no-recurrence/tasks.md:
    //   "* [x] Non-recurring task done:2026-05-03"
    const ctx = makeCtx(join(SCENARIOS, "rollover-no-recurrence"));
    const result = await runRuleSpec(completedTaskRolloverSpec, ctx);
    expect(result.changes).toHaveLength(0);
  });
});
