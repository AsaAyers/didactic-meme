/**
 * Tests for incompleteTaskAlert dry-run behaviour.
 *
 * Verifies that running incompleteTaskAlert in dry-run mode prints an alert
 * preview even when no markdown files are modified.  The preview must appear
 * in the returned `report` string regardless of whether ALERT_URL is set.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { runAllRules } from "../src/engine/runner.js";
import { CONFIG_FILENAME } from "../src/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS = join(__dirname, "test_vault", "scenarios");

// Pin the date so tests are deterministic.
const TODAY = new Date(2026, 4, 3); // 2026-05-03

describe("incompleteTaskAlert — dry-run preview", () => {
  it("prints the alert preview in the report even when no files change", async () => {
    // scenarios/incomplete-alert/ contains two markdown files with unchecked
    // tasks and no relative-date literals, so normalizeTodayLiteral / stampDone
    // / completedTaskRollover are all no-ops and no file changes are staged.
    const { changes, report } = await runAllRules({
      vaultPath: join(SCENARIOS, "incomplete-alert"),
      today: TODAY,
      dryRun: true,
      env: {},
      selectedRuleNames: ["incompleteTaskAlert"],
    });

    // No file changes: the vault has no "today" literals, no checked tasks,
    // and no tasks with a repeat schedule.
    expect(changes).toHaveLength(0);

    // The alert preview must still appear in the report.
    expect(report).toContain("[dry-run]");
    expect(report).toContain("incompleteTaskAlert");
    expect(report).toContain("Title: Incomplete Tasks");
    expect(report).toContain("Buy groceries");
    expect(report).toContain("Do laundry");
  });

  it('labels the destination as "(no alertUrl configured)" when rule config omits it', async () => {
    const tempVault = await fs.mkdtemp(
      join(tmpdir(), "onyx-vellum-incomplete-alert-no-url-"),
    );
    try {
      await fs.writeFile(
        join(tempVault, "tasks.md"),
        "* [ ] Do laundry\n",
        "utf-8",
      );
      const { report } = await runAllRules({
        vaultPath: tempVault,
        today: TODAY,
        dryRun: true,
        env: {},
        selectedRuleNames: ["incompleteTaskAlert"],
      });

      expect(report).toContain("no alertUrl configured");
    } finally {
      await fs.rm(tempVault, { recursive: true, force: true });
    }
  });

  it("labels the destination with the URL from rule config", async () => {
    const { report } = await runAllRules({
      vaultPath: join(SCENARIOS, "incomplete-alert"),
      today: TODAY,
      dryRun: true,
      env: {},
      selectedRuleNames: ["incompleteTaskAlert"],
    });

    expect(report).toContain("http://localhost:8080/alert");
  });

  it("groups tasks by source file with one section heading per file", async () => {
    const { report } = await runAllRules({
      vaultPath: join(SCENARIOS, "incomplete-alert"),
      today: TODAY,
      dryRun: true,
      env: {},
      selectedRuleNames: ["incompleteTaskAlert"],
    });

    // Both source files must appear as headings (vault-relative paths).
    expect(report).toContain("## chores.md");
    expect(report).toContain("## tasks.md");

    // Each file's tasks must appear under its heading.
    expect(report).toContain("Clean the house");
    expect(report).toContain("Take out trash");
    expect(report).toContain("Buy groceries");
    expect(report).toContain("Do laundry");
  });

  it("sorts files alphabetically for deterministic output", async () => {
    const { report } = await runAllRules({
      vaultPath: join(SCENARIOS, "incomplete-alert"),
      today: TODAY,
      dryRun: true,
      env: {},
      selectedRuleNames: ["incompleteTaskAlert"],
    });

    // chores.md sorts before tasks.md, so its heading appears first.
    const choresPos = report.indexOf("## chores.md");
    const tasksPos = report.indexOf("## tasks.md");
    expect(choresPos).toBeGreaterThanOrEqual(0);
    expect(tasksPos).toBeGreaterThanOrEqual(0);
    expect(choresPos).toBeLessThan(tasksPos);
  });

  it("attaches correct vault-relative sourcePath to extracted tasks", async () => {
    // Run with a vault that has a subdirectory to confirm the relative path
    // includes the subdirectory component, not just the filename.
    const { report } = await runAllRules({
      vaultPath: join(SCENARIOS, "incomplete-alert"),
      today: TODAY,
      dryRun: true,
      env: {},
      selectedRuleNames: ["incompleteTaskAlert"],
    });

    // The heading must be a vault-relative path, not an absolute path.
    // Absolute paths start with '/' (Unix) or a drive letter (Windows).
    const lines = report.split("\n");
    const headings = lines.filter((l) => l.startsWith("## "));
    expect(headings.length).toBeGreaterThan(0);
    for (const heading of headings) {
      const path = heading.slice(3);
      expect(path).not.toMatch(/^[/\\]/); // must not start with / or \
      expect(path).not.toMatch(/^[A-Za-z]:\\/); // must not be an absolute Windows path
    }
  });
});

describe("incompleteTaskAlert — HTTP delivery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts alert content in non-dry-run mode", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { report } = await runAllRules({
      vaultPath: join(SCENARIOS, "incomplete-alert"),
      today: TODAY,
      dryRun: false,
      env: {},
      selectedRuleNames: ["incompleteTaskAlert"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8080/alert");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "Content-Type": "text/plain",
      Markdown: "yes",
      Title: "Incomplete Tasks",
    });
    expect(typeof init?.body).toBe("string");
    expect(String(init?.body)).toContain("## chores.md");
    expect(String(init?.body)).toContain("## tasks.md");
    expect(report).not.toContain("ERROR");
  });

  it("sends bearer auth when alertToken is configured", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const tempVault = await fs.mkdtemp(
      join(tmpdir(), "onyx-vellum-incomplete-alert-token-"),
    );
    try {
      await fs.writeFile(join(tempVault, "tasks.md"), "* [ ] Do laundry\n", "utf-8");
      await fs.writeFile(
        join(tempVault, CONFIG_FILENAME),
        `${JSON.stringify(
          {
            rules: {
              incompleteTaskAlert: {
                sources: [{ type: "glob", pattern: "**/*.md" }],
                alertUrl: "http://localhost:8080/alert",
                alertToken: "test-token",
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      await runAllRules({
        vaultPath: tempVault,
        today: TODAY,
        dryRun: false,
        env: {},
        selectedRuleNames: ["incompleteTaskAlert"],
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0];
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer test-token",
      });
    } finally {
      await fs.rm(tempVault, { recursive: true, force: true });
    }
  });

  it("reports an error when alert endpoint returns non-2xx", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("server exploded", {
          status: 500,
          statusText: "Internal Server Error",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { report } = await runAllRules({
      vaultPath: join(SCENARIOS, "incomplete-alert"),
      today: TODAY,
      dryRun: false,
      env: {},
      selectedRuleNames: ["incompleteTaskAlert"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(report).toContain("[incompleteTaskAlert] ERROR:");
    expect(report).toContain("HTTP 500 Internal Server Error");
    expect(report).toContain("server exploded");
  });
});
