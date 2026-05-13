import { basename } from "node:path";
import { promises as fs } from "node:fs";
import { buildFailureContent, buildSuccessContent } from "./format.js";
import { claimNext, markDone, markFailed } from "./queue.js";
import type { TranscriptionJob, WorkerOptions } from "./types.js";

const DEFAULT_POLL_INTERVAL_MS = 2_000;

function toAudioWikilink(audioPath: string): string {
  return `[[${basename(audioPath)}]]`;
}

async function recoverStaleProcessingJobs(stateDir: string): Promise<void> {
  await fs.mkdir(`${stateDir}/pending`, { recursive: true });
  while (true) {
    const job = await readNextProcessingJob(stateDir);
    if (!job) return;
    await fs.rename(
      `${stateDir}/processing/${job.id}.json`,
      `${stateDir}/pending/${job.id}.json`,
    );
  }
}

async function readNextProcessingJob(
  stateDir: string,
): Promise<TranscriptionJob | null> {
  const processingDir = `${stateDir}/processing`;
  await fs.mkdir(processingDir, { recursive: true });
  const files = (await fs.readdir(processingDir))
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
  const first = files[0];
  if (!first) return null;
  const raw = await fs.readFile(`${processingDir}/${first}`, "utf-8");
  return JSON.parse(raw) as TranscriptionJob;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startWorker(options: WorkerOptions): Promise<void> {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const sleep = options.sleep ?? defaultSleep;
  const logger = options.logger ?? console;

  await recoverStaleProcessingJobs(options.stateDir);

  while (options.shouldContinue?.() ?? true) {
    try {
      const job = await claimNext(options.stateDir);
      if (!job) {
        await sleep(pollIntervalMs);
        continue;
      }

      try {
        const transcriptText = await options.backend.transcribe(job.audioPath);
        await fs.writeFile(
          job.transcriptPath,
          buildSuccessContent(
            job.id,
            toAudioWikilink(job.audioPath),
            transcriptText,
          ),
          "utf-8",
        );
        await markDone(options.stateDir, job.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await fs.writeFile(
          job.transcriptPath,
          buildFailureContent(job.id, toAudioWikilink(job.audioPath), message),
          "utf-8",
        );
        await markFailed(options.stateDir, job.id, message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`transcription worker loop error: ${message}`);
      await sleep(pollIntervalMs);
    }
  }
}
