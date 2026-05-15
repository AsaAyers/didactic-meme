import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRuleSpec } from "../src/engine/ruleSpecRunner.js";
import { sortTasksSpec } from "../src/rules/sortTasks.js";
import type { RuleContext } from "../src/rules/types.js";

const TODAY = new Date(2026, 4, 3); // 2026-05-03

function makeCtx(vaultPath: string): RuleContext {
  return {
    vaultPath,
    today: TODAY,
    dryRun: false,
    jobIdFactory: () => "test-job-id",
    env: {},
    readFile: (path: string) => fs.readFile(path, "utf-8").catch(() => ""),
  };
}

describe("sortTasks", () => {
  it("does not sort lists that include non-task items", async () => {
    const vaultPath = await fs.mkdtemp(join(tmpdir(), "onyx-vellum-sort-tasks-"));
    const tasksPath = join(vaultPath, "tasks.md");

    await fs.writeFile(
      tasksPath,
      [
        "* [x] Completed first done:2026-05-03",
        "* Plain bullet",
        "* [ ] Incomplete second",
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = await runRuleSpec(sortTasksSpec, makeCtx(vaultPath));
    expect(result.changes).toHaveLength(0);

    await fs.rm(vaultPath, { recursive: true, force: true });
  });

  it("treats invalid done dates as older than valid completion dates", async () => {
    const vaultPath = await fs.mkdtemp(join(tmpdir(), "onyx-vellum-sort-tasks-"));
    const tasksPath = join(vaultPath, "tasks.md");

    await fs.writeFile(
      tasksPath,
      [
        "* [x] Invalid done date done:not-a-date",
        "* [x] Older done date done:2026-05-01",
        "* [x] Newer done date done:2026-05-02",
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = await runRuleSpec(sortTasksSpec, makeCtx(vaultPath));
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.content).toContain(
      [
        "* [x] Newer done date done:2026-05-02",
        "* [x] Older done date done:2026-05-01",
        "* [x] Invalid done date done:not-a-date",
      ].join("\n"),
    );

    await fs.rm(vaultPath, { recursive: true, force: true });
  });
});
