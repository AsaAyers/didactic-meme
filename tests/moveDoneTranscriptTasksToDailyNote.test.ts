import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runAllRules } from "../src/engine/runner.js";

const TODAY = new Date(2026, 4, 3);
const CREATED_DIRS: string[] = [];

async function makeVault(): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), "onyx-vellum-move-transcript-"));
  CREATED_DIRS.push(dir);
  return dir;
}

beforeEach(() => {
  CREATED_DIRS.length = 0;
});

afterEach(async () => {
  await Promise.all(
    CREATED_DIRS.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("moveDoneTranscriptTasksToDailyNote", () => {
  it("moves completed transcript tasks to an existing daily note", async () => {
    const vaultPath = await makeVault();

    await fs.mkdir(join(vaultPath, "daily"), { recursive: true });
    await fs.mkdir(join(vaultPath, "audio"), { recursive: true });

    await fs.writeFile(
      join(vaultPath, ".onyx-vellum.json"),
      JSON.stringify(
        {
          rules: {
            moveDoneTranscriptTasksToDailyNote: { dailyNotesFolder: "daily" },
          },
        },
        null,
        2,
      ) + "\n",
      "utf-8",
    );
    await fs.writeFile(
      join(vaultPath, "daily", "2026-05-01.md"),
      "# Daily\n\nExisting note\n",
      "utf-8",
    );
    await fs.writeFile(
      join(vaultPath, "audio", "session.transcript.md"),
      "* [x] Follow up with team done:2026-05-01\n",
      "utf-8",
    );

    await runAllRules({ vaultPath, today: TODAY, dryRun: false, env: {} });

    const transcript = await fs.readFile(
      join(vaultPath, "audio", "session.transcript.md"),
      "utf-8",
    );
    const dailyNote = await fs.readFile(
      join(vaultPath, "daily", "2026-05-01.md"),
      "utf-8",
    );

    expect(transcript).not.toContain("Follow up with team");
    expect(dailyNote).toContain("* [x] Follow up with team done:2026-05-01");
  });

  it("does nothing when dailyNotesFolder is not configured", async () => {
    const vaultPath = await makeVault();

    await fs.mkdir(join(vaultPath, "audio"), { recursive: true });
    await fs.writeFile(
      join(vaultPath, ".onyx-vellum.json"),
      JSON.stringify({ rules: {} }, null, 2) + "\n",
      "utf-8",
    );
    const original = "* [x] Keep in transcript done:2026-05-01\n";
    await fs.writeFile(
      join(vaultPath, "audio", "session.transcript.md"),
      original,
      "utf-8",
    );

    await runAllRules({ vaultPath, today: TODAY, dryRun: false, env: {} });

    const transcript = await fs.readFile(
      join(vaultPath, "audio", "session.transcript.md"),
      "utf-8",
    );
    expect(transcript).toContain("Keep in transcript done:2026-05-01");
  });

  it("does nothing when the target daily note does not exist", async () => {
    const vaultPath = await makeVault();

    await fs.mkdir(join(vaultPath, "daily"), { recursive: true });
    await fs.mkdir(join(vaultPath, "audio"), { recursive: true });

    await fs.writeFile(
      join(vaultPath, ".onyx-vellum.json"),
      JSON.stringify(
        {
          rules: {
            moveDoneTranscriptTasksToDailyNote: { dailyNotesFolder: "daily" },
          },
        },
        null,
        2,
      ) + "\n",
      "utf-8",
    );
    const original = "* [x] No daily note yet done:2026-05-02\n";
    await fs.writeFile(
      join(vaultPath, "audio", "session.transcript.md"),
      original,
      "utf-8",
    );

    await runAllRules({ vaultPath, today: TODAY, dryRun: false, env: {} });

    const transcript = await fs.readFile(
      join(vaultPath, "audio", "session.transcript.md"),
      "utf-8",
    );
    expect(transcript).toContain("No daily note yet done:2026-05-02");
  });

  it("respects sources override for non-transcript markdown files", async () => {
    const vaultPath = await makeVault();

    await fs.mkdir(join(vaultPath, "daily"), { recursive: true });
    await fs.mkdir(join(vaultPath, "notes"), { recursive: true });

    await fs.writeFile(
      join(vaultPath, ".onyx-vellum.json"),
      JSON.stringify(
        {
          rules: {
            moveDoneTranscriptTasksToDailyNote: {
              dailyNotesFolder: "daily",
              sources: [{ type: "glob", pattern: "notes/**/*.md" }],
            },
          },
        },
        null,
        2,
      ) + "\n",
      "utf-8",
    );
    await fs.writeFile(
      join(vaultPath, "daily", "2026-05-03.md"),
      "# Daily\n",
      "utf-8",
    );
    await fs.writeFile(
      join(vaultPath, "notes", "tasks.md"),
      "* [x] Override source target done:2026-05-03\n",
      "utf-8",
    );

    await runAllRules({ vaultPath, today: TODAY, dryRun: false, env: {} });

    const sourceNote = await fs.readFile(join(vaultPath, "notes", "tasks.md"), "utf-8");
    const dailyNote = await fs.readFile(
      join(vaultPath, "daily", "2026-05-03.md"),
      "utf-8",
    );

    expect(sourceNote).not.toContain("Override source target done:2026-05-03");
    expect(dailyNote).toContain("* [x] Override source target done:2026-05-03");
  });
});
