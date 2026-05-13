import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { enqueue } from "../src/transcription/queue.js";
import { startWorker } from "../src/transcription/worker.js";
import type { TranscriptionJob } from "../src/transcription/types.js";

const CREATED_DIRS: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), prefix));
  CREATED_DIRS.push(dir);
  return dir;
}

async function runWorkerForSingleJob(job: TranscriptionJob): Promise<string> {
  const stateDir = await createTempDir("didactic-meme-worker-state-");
  await enqueue(stateDir, job);

  let shouldRun = true;
  await startWorker({
    stateDir,
    backend: {
      async transcribe() {
        return "transcript body";
      },
    },
    pollIntervalMs: 1,
    shouldContinue: () => {
      if (shouldRun) {
        shouldRun = false;
        return true;
      }
      return false;
    },
    sleep: async () => Promise.resolve(),
  });

  return fs.readFile(job.transcriptPath, "utf-8");
}

afterEach(async () => {
  await Promise.all(
    CREATED_DIRS.splice(0).map((dir) =>
      fs.rm(dir, { recursive: true, force: true }),
    ),
  );
});

describe("transcription worker", () => {
  it("writes source audio wikilink relative to source note", async () => {
    const vaultDir = await createTempDir("didactic-meme-worker-vault-");
    const audioPath = join(vaultDir, "audio", "clip.m4a");
    const transcriptPath = join(vaultDir, "audio", "clip.transcript.md");
    const sourceNotePath = join(vaultDir, "daily.md");
    await fs.mkdir(join(vaultDir, "audio"), { recursive: true });

    const content = await runWorkerForSingleJob({
      id: "01j-worker-a",
      audioPath,
      transcriptPath,
      sourceNotePath,
      createdAt: "2026-05-13T00:00:00.000Z",
    });

    expect(content).toContain("Status: done");
    expect(content).toContain("Source audio: [[audio/clip.m4a]]");
  });

  it("supports parent-directory relative paths from nested notes", async () => {
    const vaultDir = await createTempDir("didactic-meme-worker-vault-");
    const sourceNotePath = join(vaultDir, "notes", "daily.md");
    const audioPath = join(vaultDir, "audio", "clip.m4a");
    const transcriptPath = join(vaultDir, "audio", "clip.transcript.md");
    await fs.mkdir(join(vaultDir, "notes"), { recursive: true });
    await fs.mkdir(join(vaultDir, "audio"), { recursive: true });

    const content = await runWorkerForSingleJob({
      id: "01j-worker-b",
      audioPath,
      transcriptPath,
      sourceNotePath,
      createdAt: "2026-05-13T00:00:00.000Z",
    });

    expect(content).toContain("Status: done");
    expect(content).toContain("Source audio: [[../audio/clip.m4a]]");
  });
});
