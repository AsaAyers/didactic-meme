/**
 * End-to-end snapshot tests for the committed test vault.
 *
 * Every `.md.expected` file under `tests/test_vault/` documents the exact output
 * the pipeline should produce for the corresponding `.md` path. For existing
 * files we compare against the staged dry-run output (or the on-disk source when
 * unchanged). For generated transcript files we compare against staged writes
 * even when the `.md` input file does not yet exist on disk.
 */
import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { runAllRules } from "../src/engine/runner.js";
import { walkMarkdownFiles } from "../src/engine/io.js";
import { startWorker } from "../src/transcription/worker.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_VAULT = join(__dirname, "test_vault");
const WORKER_ONLY_EXPECTED_OUTPUTS = new Set([
  join(
    TEST_VAULT,
    "scenarios",
    "audio-embed-transcription-failure",
    "recordings",
    "2024-01-15 12.34.56.transcript.md",
  ),
]);

// Pin the date so the test produces the same output regardless of when it runs.
const TODAY = new Date(2026, 4, 3); // 2026-05-03

const CREATED_DIRS: string[] = [];
const deterministicJobIdFactory = (): string =>
  `${TODAY.getTime().toString(36)}-test-job-001`;

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), prefix));
  CREATED_DIRS.push(dir);
  return dir;
}

async function walkExpectedFiles(dir: string): Promise<string[]> {
  const expectedFiles: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      expectedFiles.push(...(await walkExpectedFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md.expected")) {
      expectedFiles.push(fullPath);
    }
  }

  return expectedFiles;
}

async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await fs.readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

afterEach(async () => {
  await Promise.all(
    CREATED_DIRS.splice(0).map((dir) =>
      fs.rm(dir, { recursive: true, force: true }),
    ),
  );
});

describe("test vault — .md.expected snapshots", () => {
  it("matches every committed .md.expected snapshot in dry-run mode", async () => {
    const { changes } = await runAllRules({
      vaultPath: TEST_VAULT,
      today: TODAY,
      dryRun: true,
      env: {},
      jobIdFactory: deterministicJobIdFactory,
    });

    const pipelineOutputs = new Map(changes.map((c) => [c.path, c.content]));
    const expectedFiles = await walkExpectedFiles(TEST_VAULT);
    const failures: string[] = [];
    const toEqual: string[] = [];

    for (const expectedPath of expectedFiles) {
      const actualPath = expectedPath.slice(0, -".expected".length);
      const relPath = relative(TEST_VAULT, actualPath);

      if (WORKER_ONLY_EXPECTED_OUTPUTS.has(actualPath)) {
        continue;
      }

      const expectedContent = await fs.readFile(expectedPath, "utf-8");
      const actualContent =
        pipelineOutputs.get(actualPath) ?? (await readOptionalFile(actualPath));

      if (actualContent === undefined) {
        failures.push(`${relPath}: expected output file was not produced`);
        toEqual.push("");
        continue;
      }

      if (actualContent !== expectedContent) {
        failures.push(`${relPath}\n${actualContent}`);
        toEqual.push(`${relPath}\n${expectedContent}`);
      }
    }

    expect(failures, `${failures.length} file failsures`).toEqual(toEqual);
  });

  it("does not modify any committed markdown file on disk in dry-run mode", async () => {
    const mdFiles = await walkMarkdownFiles(TEST_VAULT);
    const before = new Map(
      await Promise.all(
        mdFiles.map(async (p) => [p, await fs.readFile(p, "utf-8")] as const),
      ),
    );

    await runAllRules({
      vaultPath: TEST_VAULT,
      today: TODAY,
      dryRun: true,
      env: {},
      jobIdFactory: deterministicJobIdFactory,
    });

    for (const [p, content] of before) {
      const after = await fs.readFile(p, "utf-8");
      expect(
        after,
        `${relative(TEST_VAULT, p)} was modified on disk in dry-run mode`,
      ).toBe(content);
    }
  });

  it("uses the fake worker backend for the transcription failure scenario", async () => {
    const scenarioName = "audio-embed-transcription-failure";
    const sourceScenario = join(TEST_VAULT, "scenarios", scenarioName);
    const vaultPath = await createTempDir("onyx-vellum-vault-");
    const stateDir = await createTempDir("onyx-vellum-state-");
    const expectedAudioPath = join(
      vaultPath,
      "recordings",
      "2024-01-15 12.34.56.m4a",
    );
    const transcribedAudioPaths: string[] = [];
    let shouldContinue = true;

    await fs.cp(sourceScenario, vaultPath, { recursive: true });

    await runAllRules({
      vaultPath,
      today: TODAY,
      dryRun: false,
      env: { STATE_DIR: stateDir },
      selectedRuleNames: ["ensureAudioTranscripts"],
      jobIdFactory: () => "mopf7ts0-test-job-001",
    });

    await startWorker({
      stateDir,
      backend: {
        async transcribe(audioPath: string) {
          transcribedAudioPaths.push(audioPath);
          throw new Error(
            `Fake backend failed for ${relative(vaultPath, audioPath)}`,
          );
        },
      },
      pollIntervalMs: 1,
      shouldContinue: () => {
        if (shouldContinue) {
          shouldContinue = false;
          return true;
        }
        return false;
      },
      sleep: async () => Promise.resolve(),
    });

    expect(transcribedAudioPaths).toEqual([expectedAudioPath]);

    const expectedFiles = await walkExpectedFiles(sourceScenario);
    const failures: string[] = [];

    for (const expectedPath of expectedFiles) {
      const relPath = relative(sourceScenario, expectedPath).slice(
        0,
        -".expected".length,
      );
      const actualPath = join(vaultPath, relPath);
      const expectedContent = await fs.readFile(expectedPath, "utf-8");
      const actualContent = await readOptionalFile(actualPath);

      if (actualContent !== expectedContent) {
        failures.push(`${relPath}: output does not match .md.expected`);
      }
    }

    expect(failures, failures.join("\n")).toEqual([]);
  });
});
