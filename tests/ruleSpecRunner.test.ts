/**
 * Unit tests for the ruleSpecRunner engine.
 *
 * Only tests that are NOT already exercised by the E2E dry-run in
 * tests/normalizeTodayLiteral.test.ts belong here.
 *
 * The E2E vault (tests/test_vault/) is scanned by normalizeTodayLiteral with
 * a "**\/*.md" glob, which covers:
 *   - "today" replacement (main TODO.md)
 *   - "yesterday" / "tomorrow" date arithmetic (scenarios/relative-dates/)
 *   - Negative cases: files without matching fields are not modified
 *     (scenarios/date-before/, scenarios/field-exists/, etc.)
 *
 * Tests that remain here cover engine behaviour the E2E vault does NOT exercise:
 *   - task.setFieldDateIfMissing — not used by normalizeTodayLiteral
 *   - Predicates (checked, unchecked, fieldExists, fieldDateBefore, not) —
 *     normalizeTodayLiteral uses no predicate
 *   - .md-only path enforcement — verifies the engine throws for non-.md paths
 *
 * Each test uses a dedicated sub-directory under tests/test_vault/scenarios/
 * as its vaultPath, so no filesystem mocking is needed.  The scenario
 * directories are committed fixtures — create a new sub-directory if you need
 * a different file layout for a new test.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { promises as fs } from "node:fs";
import { runRuleSpec } from "../src/engine/ruleSpecRunner.js";
import { buildJobId } from "../src/engine/actions/requestTranscription.js";
import { selectRuleSpecs, sortRuleSpecs } from "../src/engine/runner.js";
import { ensureAudioTranscriptsSpec } from "../src/rules/ensureAudioTranscripts.js";
import type { RuleContext, RuleSpec, LinkQuery } from "../src/rules/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS = join(__dirname, "test_vault", "scenarios");

const TODAY = new Date(2026, 4, 3); // 2026-05-03
const TODAY_STR = "2026-05-03";

function expectPendingTranscriptPlaceholder(
  content: string,
  expectedAudioTarget: string,
): void {
  expect(content).toContain("status: pending");
  expect(content).toContain("> Transcription is pending.");
  expect(content).toContain(`Source audio: [[${expectedAudioTarget}]]`);

  const jobMatch = content.match(/^jobId: ([a-z0-9-]+)$/m);
  expect(jobMatch).not.toBeNull();
  expect(jobMatch?.[1]).toMatch(/^[a-z0-9-]+$/);
}

/** Build a context that reads directly from disk (no transform queue). */
function makeCtx(vaultPath: string): RuleContext {
  return {
    vaultPath,
    today: TODAY,
    dryRun: false,
    jobIdFactory: buildJobId,
    env: {},
    readFile: (path: string) => fs.readFile(path, "utf-8").catch(() => ""),
  };
}

// ---------------------------------------------------------------------------
// .md-only path enforcement
// (The engine must refuse to process non-.md paths)
// ---------------------------------------------------------------------------

describe("ruleSpecRunner — .md-only enforcement", () => {
  it("throws when a path source does not end in .md", async () => {
    const ctx = makeCtx(join(SCENARIOS, "set-missing"));
    const spec: RuleSpec = {
      name: "test",
      sources: [{ type: "path", value: "tasks.txt" }],
      query: { type: "tasks" },
      actions: [],
    };
    await expect(runRuleSpec(spec, ctx)).rejects.toThrow(".md");
  });
});

// ---------------------------------------------------------------------------
// task.setFieldDateIfMissing
// (Not used by normalizeTodayLiteral; not exercised by the E2E run)
// ---------------------------------------------------------------------------

describe("ruleSpecRunner — task.setFieldDateIfMissing", () => {
  it("sets a missing field to the current date", async () => {
    // scenarios/set-missing/tasks.md: "- [x] Finished task"
    const ctx = makeCtx(join(SCENARIOS, "set-missing"));
    const spec: RuleSpec = {
      name: "stamp",
      sources: [{ type: "path", value: "tasks.md" }],
      query: { type: "tasks", predicate: { type: "checked" } },
      actions: [
        { type: "task.setFieldDateIfMissing", key: "done", value: "today" },
      ],
    };
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.content).toContain(`done:${TODAY_STR}`);
  });

  it("does not overwrite an existing field", async () => {
    // scenarios/set-existing/tasks.md: "- [x] Finished task done:2026-01-01"
    const ctx = makeCtx(join(SCENARIOS, "set-existing"));
    const spec: RuleSpec = {
      name: "stamp",
      sources: [{ type: "path", value: "tasks.md" }],
      query: { type: "tasks", predicate: { type: "checked" } },
      actions: [
        { type: "task.setFieldDateIfMissing", key: "done", value: "today" },
      ],
    };
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Predicate evaluation
// (normalizeTodayLiteral uses no predicate; none of these are in the E2E run)
// ---------------------------------------------------------------------------

describe("ruleSpecRunner — predicates", () => {
  it("checked predicate selects only checked tasks", async () => {
    // scenarios/checked-unchecked/tasks.md: "- [x] Done / - [ ] Todo"
    const ctx = makeCtx(join(SCENARIOS, "checked-unchecked"));
    const spec: RuleSpec = {
      name: "test",
      sources: [{ type: "path", value: "tasks.md" }],
      query: { type: "tasks", predicate: { type: "checked" } },
      actions: [
        { type: "task.setFieldDateIfMissing", key: "done", value: "today" },
      ],
    };
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(1);
    const content = result.changes[0]?.content ?? "";
    expect(content).toContain(`* [x] Done done:${TODAY_STR}`);
    expect(content).toContain("* [ ] Todo");
    expect(content).not.toContain("Todo done:");
  });

  it("unchecked predicate selects only unchecked tasks", async () => {
    // scenarios/unchecked-today/tasks.md: "- [x] Done / - [ ] Todo due:today"
    const ctx = makeCtx(join(SCENARIOS, "unchecked-today"));
    const spec: RuleSpec = {
      name: "test",
      sources: [{ type: "path", value: "tasks.md" }],
      query: { type: "tasks", predicate: { type: "unchecked" } },
      actions: [
        {
          type: "task.replaceFieldDateValue",
          key: "due",
          from: "today",
          to: "today",
        },
      ],
    };
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(1);
    const content = result.changes[0]?.content ?? "";
    expect(content).toContain(`due:${TODAY_STR}`);
    // The checked task had no due field and was not selected.
    expect(content).toContain("* [x] Done");
  });

  it("fieldExists predicate returns only tasks with that field", async () => {
    // scenarios/field-exists/tasks.md: "- [ ] With due:2026-05-01 / - [ ] Without"
    const ctx = makeCtx(join(SCENARIOS, "field-exists"));
    const spec: RuleSpec = {
      name: "test",
      sources: [{ type: "path", value: "tasks.md" }],
      query: { type: "tasks", predicate: { type: "fieldExists", key: "due" } },
      actions: [
        {
          type: "task.replaceFieldDateValue",
          key: "due",
          from: "2026-05-01",
          to: TODAY_STR,
        },
      ],
    };
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.content).toContain(`due:${TODAY_STR}`);
    expect(result.changes[0]?.content).toContain("* [ ] Without");
    expect(result.changes[0]?.content).not.toContain("Without due:");
  });

  it("fieldDateBefore predicate selects tasks whose date field is before the reference", async () => {
    // scenarios/date-before/tasks.md: overdue (2026-04-01) and future (2026-06-01)
    const ctx = makeCtx(join(SCENARIOS, "date-before"));
    const spec: RuleSpec = {
      name: "test",
      sources: [{ type: "path", value: "tasks.md" }],
      query: {
        type: "tasks",
        predicate: { type: "fieldDateBefore", key: "due", date: "today" },
      },
      actions: [
        {
          type: "task.replaceFieldDateValue",
          key: "due",
          from: "2026-04-01",
          to: TODAY_STR,
        },
      ],
    };
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(1);
    const content = result.changes[0]?.content ?? "";
    expect(content).toContain(`due:${TODAY_STR}`);
    // Future task is not selected and its date is unchanged.
    expect(content).toContain("due:2026-06-01");
  });

  it("not predicate inverts selection", async () => {
    // scenarios/not-predicate/tasks.md: "- [ ] A due:today / - [ ] B"
    // Select tasks WITHOUT a due field → only B gets due:today set.
    const ctx = makeCtx(join(SCENARIOS, "not-predicate"));
    const spec: RuleSpec = {
      name: "test",
      sources: [{ type: "path", value: "tasks.md" }],
      query: {
        type: "tasks",
        predicate: {
          type: "not",
          predicate: { type: "fieldExists", key: "due" },
        },
      },
      actions: [
        { type: "task.setFieldDateIfMissing", key: "due", value: "today" },
      ],
    };
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(1);
    const content = result.changes[0]?.content ?? "";
    expect(content).toContain("* [ ] B due:");
    // Task A already had due:today — was not selected, stays as the literal "today".
    expect(content).toContain("due:today");
  });
});

// ---------------------------------------------------------------------------
// GlobSource exclude patterns
// (Verifies that files matching exclude patterns are not processed)
// ---------------------------------------------------------------------------

describe("ruleSpecRunner — GlobSource exclude patterns", () => {
  // scenarios/exclude-patterns/:
  //   active.md        — should be included (has one unchecked task)
  //   archive/old.md   — must be excluded by 'archive/**'
  //   templates/weekly.md — must be excluded by 'templates/**'

  it("excludes files matching a single exclude pattern", async () => {
    const ctx = makeCtx(join(SCENARIOS, "exclude-patterns"));
    const spec: RuleSpec = {
      name: "test",
      sources: [{ type: "glob", pattern: "**/*.md", exclude: ["archive/**"] }],
      query: { type: "tasks", predicate: { type: "unchecked" } },
      actions: [
        { type: "task.setFieldDateIfMissing", key: "due", value: "today" },
      ],
    };
    const result = await runRuleSpec(spec, ctx);

    // active.md and templates/weekly.md are included → 2 files changed.
    // archive/old.md is excluded → its task must not appear.
    const paths = result.changes.map((c) => c.path);
    expect(paths.some((p) => p.includes("archive"))).toBe(false);
    // active.md was processed.
    expect(paths.some((p) => p.includes("active"))).toBe(true);
  });

  it("excludes files matching multiple exclude patterns", async () => {
    const ctx = makeCtx(join(SCENARIOS, "exclude-patterns"));
    const spec: RuleSpec = {
      name: "test",
      sources: [
        {
          type: "glob",
          pattern: "**/*.md",
          exclude: ["archive/**", "templates/**"],
        },
      ],
      query: { type: "tasks", predicate: { type: "unchecked" } },
      actions: [
        { type: "task.setFieldDateIfMissing", key: "due", value: "today" },
      ],
    };
    const result = await runRuleSpec(spec, ctx);

    // Only active.md remains after both exclusions.
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.path).toContain("active");
    // Neither archived nor template tasks appear in the output.
    const allContent = result.changes.map((c) => c.content).join("");
    expect(allContent).toContain("Active task");
    expect(allContent).not.toContain("archived");
    expect(allContent).not.toContain("Template");
  });

  it("without exclude patterns all files are included", async () => {
    const ctx = makeCtx(join(SCENARIOS, "exclude-patterns"));
    const spec: RuleSpec = {
      name: "test",
      sources: [{ type: "glob", pattern: "**/*.md" }],
      query: { type: "tasks", predicate: { type: "unchecked" } },
      actions: [
        { type: "task.setFieldDateIfMissing", key: "due", value: "today" },
      ],
    };
    const result = await runRuleSpec(spec, ctx);

    // All three files are included.
    expect(result.changes).toHaveLength(3);
    const allContent = result.changes.map((c) => c.content).join("");
    expect(allContent).toContain("Active task");
    expect(allContent).toContain("archived");
    expect(allContent).toContain("Template");
  });
});

// ---------------------------------------------------------------------------
// sortRuleSpecs — dependency-based topological ordering
// ---------------------------------------------------------------------------

/** Build a minimal stub RuleSpec with optional dependencies. */
function stubSpec(name: string, dependencies?: string[]): RuleSpec {
  return {
    name,
    sources: [],
    query: { type: "tasks" },
    actions: [],
    ...(dependencies !== undefined ? { dependencies } : {}),
  };
}

describe("sortRuleSpecs", () => {
  it("returns specs in original order when there are no dependencies", () => {
    const a = stubSpec("a");
    const b = stubSpec("b");
    const c = stubSpec("c");
    expect(sortRuleSpecs([a, b, c]).map((s) => s.name)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("places a dependency before the spec that declares it", () => {
    const a = stubSpec("a");
    const b = stubSpec("b", ["a"]); // b depends on a
    // Even if registered b-first, a must come out first.
    const result = sortRuleSpecs([b, a]).map((s) => s.name);
    expect(result.indexOf("a")).toBeLessThan(result.indexOf("b"));
  });

  it("handles a chain of dependencies", () => {
    const a = stubSpec("a");
    const b = stubSpec("b", ["a"]);
    const c = stubSpec("c", ["b"]);
    const result = sortRuleSpecs([c, b, a]).map((s) => s.name);
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("handles a diamond dependency graph without duplication", () => {
    // a → b, a → c, b → d, c → d
    const a = stubSpec("a");
    const b = stubSpec("b", ["a"]);
    const c = stubSpec("c", ["a"]);
    const d = stubSpec("d", ["b", "c"]);
    const result = sortRuleSpecs([d, c, b, a]).map((s) => s.name);
    expect(result).toHaveLength(4);
    expect(result.indexOf("a")).toBeLessThan(result.indexOf("b"));
    expect(result.indexOf("a")).toBeLessThan(result.indexOf("c"));
    expect(result.indexOf("b")).toBeLessThan(result.indexOf("d"));
    expect(result.indexOf("c")).toBeLessThan(result.indexOf("d"));
  });

  it("throws when a dependency name does not exist in the set", () => {
    const a = stubSpec("a", ["missing"]);
    expect(() => sortRuleSpecs([a])).toThrow('unknown spec "missing"');
  });

  it("throws when there is a direct circular dependency", () => {
    const a = stubSpec("a", ["b"]);
    const b = stubSpec("b", ["a"]);
    expect(() => sortRuleSpecs([a, b])).toThrow("Circular dependency");
  });

  it("throws when there is an indirect cycle", () => {
    const a = stubSpec("a", ["c"]);
    const b = stubSpec("b", ["a"]);
    const c = stubSpec("c", ["b"]);
    expect(() => sortRuleSpecs([a, b, c])).toThrow("Circular dependency");
  });
});

// ---------------------------------------------------------------------------
// selectRuleSpecs — subset selection with transitive dependency closure
// ---------------------------------------------------------------------------

describe("selectRuleSpecs", () => {
  it("returns only the selected spec when it has no dependencies", () => {
    const a = stubSpec("a");
    const b = stubSpec("b");
    const c = stubSpec("c");
    const result = selectRuleSpecs([a, b, c], ["b"]).map((s) => s.name);
    expect(result).toEqual(["b"]);
  });

  it("includes transitive dependencies before the selected spec", () => {
    const a = stubSpec("a");
    const b = stubSpec("b", ["a"]); // b depends on a
    const c = stubSpec("c");
    // Selecting b must pull in a; c is unrelated and must NOT be included.
    const result = selectRuleSpecs([a, b, c], ["b"]).map((s) => s.name);
    expect(result).toContain("a");
    expect(result).toContain("b");
    expect(result).not.toContain("c");
    expect(result.indexOf("a")).toBeLessThan(result.indexOf("b"));
  });

  it("does not include unrelated specs", () => {
    const a = stubSpec("a");
    const b = stubSpec("b", ["a"]);
    const rollover = stubSpec("rollover");
    const alert = stubSpec("alert");
    const result = selectRuleSpecs([a, b, rollover, alert], ["b"]).map(
      (s) => s.name,
    );
    expect(result).not.toContain("rollover");
    expect(result).not.toContain("alert");
  });

  it("handles multi-level transitive dependencies", () => {
    const a = stubSpec("a");
    const b = stubSpec("b", ["a"]);
    const c = stubSpec("c", ["b"]);
    const d = stubSpec("d");
    const result = selectRuleSpecs([a, b, c, d], ["c"]).map((s) => s.name);
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("handles selecting multiple specs", () => {
    const a = stubSpec("a");
    const b = stubSpec("b", ["a"]);
    const c = stubSpec("c");
    const result = selectRuleSpecs([a, b, c], ["b", "c"]).map((s) => s.name);
    expect(result).toContain("a");
    expect(result).toContain("b");
    expect(result).toContain("c");
    expect(result.indexOf("a")).toBeLessThan(result.indexOf("b"));
  });

  it("deduplicates specs that appear as both direct selection and dependency", () => {
    const a = stubSpec("a");
    const b = stubSpec("b", ["a"]);
    // Selecting both a and b should not duplicate a.
    const result = selectRuleSpecs([a, b], ["a", "b"]).map((s) => s.name);
    expect(result).toEqual(["a", "b"]);
  });

  it("throws for an unknown rule name", () => {
    const a = stubSpec("a");
    expect(() => selectRuleSpecs([a], ["missing"])).toThrow(
      'Unknown rule: "missing"',
    );
  });

  it("includes the available rule names in the error message", () => {
    const a = stubSpec("a");
    const b = stubSpec("b");
    expect(() => selectRuleSpecs([a, b], ["x"])).toThrow("a, b");
  });
});

// ---------------------------------------------------------------------------
// Nested list preservation during task modification
// Regression: when stampDone adds done: to a task in a file that also
// contains a bullet item with a nested ordered list, the nested list must
// not lose its indentation or gain a blank line.
// (The bug does NOT manifest in the init/normalizeFileContent path — only
//  when the rule pipeline modifies a task in the same file.)
// ---------------------------------------------------------------------------

describe("ruleSpecRunner — nested list preservation on task modification", () => {
  it("stampDone preserves nested numbered list in a nearby bullet item", async () => {
    // scenarios/stamp-done-nested-list/tasks.md:
    //   "* [x] completed task"
    //   "* bulleted list"
    //   "  1. Nested numbered list"
    //   "  2. Next item"
    const ctx = makeCtx(join(SCENARIOS, "stamp-done-nested-list"));
    const spec: RuleSpec = {
      name: "stamp",
      sources: [{ type: "path", value: "tasks.md" }],
      query: { type: "tasks", predicate: { type: "checked" } },
      actions: [
        { type: "task.setFieldDateIfMissing", key: "done", value: "today" },
      ],
    };
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(1);
    const content = result.changes[0]?.content ?? "";

    // The done: stamp was applied to the completed task.
    expect(content).toContain(`done:${TODAY_STR}`);

    // The nested ordered list must remain indented (no indentation loss).
    expect(content).toContain("  1. Nested numbered list");
    expect(content).toContain("  2. Next item");

    // No extra blank line must be inserted before the nested list.
    expect(content).not.toMatch(/\n\n\s*1\. Nested/);
  });
});

// ---------------------------------------------------------------------------
// ensureAudioTranscripts
// (Covers behavior not fully asserted by the E2E vault snapshots, such as
// placeholder-file creation, transcription-job enqueueing, and skip cases.)
// ---------------------------------------------------------------------------

describe("ruleSpecRunner — ensureAudioTranscripts", () => {
  async function withTempVault(
    run: (vaultPath: string) => Promise<void>,
  ): Promise<void> {
    const vaultPath = await fs.mkdtemp(
      join(tmpdir(), "onyx-vellum-transcript-"),
    );
    try {
      await run(vaultPath);
    } finally {
      await fs.rm(vaultPath, { recursive: true, force: true });
    }
  }

  it("inserts transcript embed, creates placeholder transcript, and enqueues one job when transcript is missing", async () => {
    await withTempVault(async (vaultPath) => {
      const notePath = join(vaultPath, "daily.md");
      const audioPath = join(vaultPath, "audio", "clip.m4a");
      const transcriptPath = join(vaultPath, "audio", "clip.transcript.md");

      await fs.mkdir(join(vaultPath, "audio"), { recursive: true });
      await fs.writeFile(
        notePath,
        "# Daily\n\n![[audio/clip.m4a]]\n\nAfter recording.",
        "utf-8",
      );
      await fs.writeFile(audioPath, "audio-bytes", "utf-8");

      const result = await runRuleSpec(
        ensureAudioTranscriptsSpec,
        makeCtx(vaultPath),
      );

      expect(result.changes).toHaveLength(2);
      const noteChange = result.changes.find((c) => c.path === notePath);
      const transcriptChange = result.changes.find(
        (c) => c.path === transcriptPath,
      );
      expect(noteChange?.content).toContain(
        "![[audio/clip.m4a]]\n![[audio/clip.transcript.md]]",
      );
      expectPendingTranscriptPlaceholder(
        transcriptChange?.content ?? "",
        "audio/clip.m4a",
      );
      expect(result.summary).toContain("enqueued 1 transcription job(s)");
    });
  });

  it("does not insert duplicate transcript embed when it already appears elsewhere in the file body", async () => {
    await withTempVault(async (vaultPath) => {
      const notePath = join(vaultPath, "daily.md");
      const audioPath = join(vaultPath, "audio", "clip.m4a");
      const transcriptPath = join(vaultPath, "audio", "clip.transcript.md");

      await fs.mkdir(join(vaultPath, "audio"), { recursive: true });
      await fs.writeFile(
        notePath,
        "![[audio/clip.m4a]]\n\nNotes...\n\n![[audio/clip.transcript.md]]",
        "utf-8",
      );
      await fs.writeFile(audioPath, "audio-bytes", "utf-8");

      const result = await runRuleSpec(
        ensureAudioTranscriptsSpec,
        makeCtx(vaultPath),
      );

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]?.path).toBe(transcriptPath);
      expectPendingTranscriptPlaceholder(
        result.changes[0]?.content ?? "",
        "audio/clip.m4a",
      );
    });
  });

  it("inserts transcript embeds immediately below each matched audio line when multiple embeds are present", async () => {
    await withTempVault(async (vaultPath) => {
      const notePath = join(vaultPath, "daily.md");
      await fs.mkdir(join(vaultPath, "audio"), { recursive: true });
      await fs.writeFile(
        notePath,
        "![[audio/one.m4a]]\nParagraph\n![[audio/two.m4a]]",
        "utf-8",
      );
      await fs.writeFile(join(vaultPath, "audio", "one.m4a"), "one", "utf-8");
      await fs.writeFile(join(vaultPath, "audio", "two.m4a"), "two", "utf-8");

      const result = await runRuleSpec(
        ensureAudioTranscriptsSpec,
        makeCtx(vaultPath),
      );
      const noteChange = result.changes.find((c) => c.path === notePath);

      expect(noteChange?.content).toContain(
        "![[audio/one.m4a]]\n![[audio/one.transcript.md]]\nParagraph\n![[audio/two.m4a]]\n![[audio/two.transcript.md]]",
      );
      expect(result.summary).toContain("enqueued 2 transcription job(s)");
    });
  });

  it("inserts transcript embed but does not create a file or enqueue a job when sibling transcript already exists", async () => {
    await withTempVault(async (vaultPath) => {
      const notePath = join(vaultPath, "daily.md");
      const audioPath = join(vaultPath, "audio", "clip.m4a");
      const transcriptPath = join(vaultPath, "audio", "clip.transcript.md");

      await fs.mkdir(join(vaultPath, "audio"), { recursive: true });
      await fs.writeFile(notePath, "![[audio/clip.m4a]]", "utf-8");
      await fs.writeFile(audioPath, "audio-bytes", "utf-8");
      await fs.writeFile(transcriptPath, "# Existing transcript", "utf-8");

      const result = await runRuleSpec(
        ensureAudioTranscriptsSpec,
        makeCtx(vaultPath),
      );

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]?.path).toBe(notePath);
      expect(result.changes[0]?.content).toContain(
        "![[audio/clip.transcript.md]]",
      );
      expect(result.summary).toBe("Processed 1 link(s) across 1 file(s).");
    });
  });

  it("skips links whose resolved audio path escapes the vault root", async () => {
    await withTempVault(async (vaultPath) => {
      const notePath = join(vaultPath, "daily.md");
      const outsideAudioPath = join(dirname(vaultPath), "outside.m4a");

      await fs.writeFile(notePath, "![[../outside.m4a]]", "utf-8");
      await fs.writeFile(outsideAudioPath, "audio-bytes", "utf-8");

      try {
        const result = await runRuleSpec(
          ensureAudioTranscriptsSpec,
          makeCtx(vaultPath),
        );
        expect(result.changes).toHaveLength(0);
      } finally {
        await fs.rm(outsideAudioPath, { force: true });
      }
    });
  });

  it("skips links when the audio file is missing", async () => {
    await withTempVault(async (vaultPath) => {
      await fs.writeFile(
        join(vaultPath, "daily.md"),
        "![[audio/missing.m4a]]",
        "utf-8",
      );

      const result = await runRuleSpec(
        ensureAudioTranscriptsSpec,
        makeCtx(vaultPath),
      );
      expect(result.changes).toHaveLength(0);
      expect(result.summary).toBe("Processed 1 link(s) across 0 file(s).");
    });
  });
});

// ---------------------------------------------------------------------------
// LinkQuery type
// (not covered by E2E vault — no link-query specs exist there)
// ---------------------------------------------------------------------------

describe("LinkQuery", () => {
  it("satisfies LinkQuery with embed and extension filters", () => {
    const q: LinkQuery = { type: "link", embed: true, extension: ".m4a" };
    expect(q.type).toBe("link");
    expect(q.embed).toBe(true);
    expect(q.extension).toBe(".m4a");
  });
});
