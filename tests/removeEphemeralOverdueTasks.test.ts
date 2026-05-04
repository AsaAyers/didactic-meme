/**
 * Unit tests for removeEphemeralOverdueTasks.
 *
 * The E2E vault (tests/test_vault/) exercises these scenarios via snapshot
 * files under scenarios/ephemeral-{overdue,due-today,completed,no-deadline}/
 * and scenarios/non-ephemeral-overdue/.
 *
 * Tests here verify the rule's behaviour directly against those same fixture
 * directories, making it easy to confirm the rule's selection logic without
 * re-reading the E2E snapshot output.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import { runRuleSpec } from "../src/engine/ruleSpecRunner.js";
import { removeEphemeralOverdueTasksSpec } from "../src/rules/removeEphemeralOverdueTasks.js";
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

describe("removeEphemeralOverdueTasks — tasks removed", () => {
  it("removes an unchecked ephemeral task whose due date is before today", async () => {
    // scenarios/ephemeral-overdue/tasks.md:
    //   "* [ ] Ephemeral overdue ephemeral:1 due:2026-04-01"
    //   "* [ ] Normal task"
    const ctx = makeCtx(join(SCENARIOS, "ephemeral-overdue"));
    const result = await runRuleSpec(removeEphemeralOverdueTasksSpec, ctx);
    expect(result.changes).toHaveLength(1);
    const content = result.changes[0]?.content ?? "";
    expect(content).not.toContain("Ephemeral overdue");
    expect(content).toContain("Normal task");
  });
});

describe("removeEphemeralOverdueTasks — tasks NOT removed", () => {
  it("does not remove an ephemeral task due exactly today", async () => {
    // scenarios/ephemeral-due-today/tasks.md:
    //   "- [ ] Due today stays ephemeral:1 due:2026-05-03"
    const ctx = makeCtx(join(SCENARIOS, "ephemeral-due-today"));
    const result = await runRuleSpec(removeEphemeralOverdueTasksSpec, ctx);
    expect(result.changes).toHaveLength(0);
  });

  it("does not remove a completed (checked) ephemeral task even if overdue", async () => {
    // scenarios/ephemeral-completed/tasks.md:
    //   "- [x] Completed ephemeral ephemeral:1 due:2026-04-01 done:2026-04-01"
    const ctx = makeCtx(join(SCENARIOS, "ephemeral-completed"));
    const result = await runRuleSpec(removeEphemeralOverdueTasksSpec, ctx);
    expect(result.changes).toHaveLength(0);
  });

  it("does not remove an ephemeral task that has no due field", async () => {
    // scenarios/ephemeral-no-deadline/tasks.md:
    //   "- [ ] Ephemeral but no due date ephemeral:1"
    const ctx = makeCtx(join(SCENARIOS, "ephemeral-no-deadline"));
    const result = await runRuleSpec(removeEphemeralOverdueTasksSpec, ctx);
    expect(result.changes).toHaveLength(0);
  });

  it("does not remove an overdue task that is not marked ephemeral", async () => {
    // scenarios/non-ephemeral-overdue/tasks.md:
    //   "- [ ] Overdue but not ephemeral due:2026-04-01"
    const ctx = makeCtx(join(SCENARIOS, "non-ephemeral-overdue"));
    const result = await runRuleSpec(removeEphemeralOverdueTasksSpec, ctx);
    expect(result.changes).toHaveLength(0);
  });
});
