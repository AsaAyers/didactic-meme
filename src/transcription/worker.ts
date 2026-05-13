import { promises as fs } from "node:fs";
import { buildFailureContent, buildSuccessContent } from "./format.js";
import { claimNext, markDone, markFailed } from "./queue.js";
import type { WorkerOptions } from "./types.js";

const DEFAULT_POLL_INTERVAL_MS = 2_000;

async function readSourceAudioWikilink(
  transcriptPath: string,
  audioPath: string,
): Promise<string> {
  // Reuse the source-audio wikilink from the existing placeholder when present
  // so worker rewrites preserve relative vault links. Fall back to an absolute
  // audio-path wikilink when the placeholder cannot be read.
  try {
    const current = await fs.readFile(transcriptPath, "utf-8");
    const match = current.match(/^Source audio: (.+)$/m);
    if (match?.[1]) return match[1].trim();
  } catch {
    // Fall through to absolute-path wikilink fallback.
  }
  return `[[${audioPath}]]`;
}

async function recoverStaleProcessingJobs(stateDir: string): Promise<void> {
  const processingDir = `${stateDir}/processing`;
  const pendingDir = `${stateDir}/pending`;
  await fs.mkdir(processingDir, { recursive: true });
  await fs.mkdir(pendingDir, { recursive: true });
  const files = (await fs.readdir(processingDir))
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  await Promise.all(
    files.map((file) =>
      fs.rename(`${processingDir}/${file}`, `${pendingDir}/${file}`),
    ),
  );
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

      const sourceAudioWikilink = await readSourceAudioWikilink(
        job.transcriptPath,
        job.audioPath,
      );
      try {
        const transcriptText = await options.backend.transcribe(job.audioPath);
        await fs.writeFile(
          job.transcriptPath,
          buildSuccessContent(job.id, sourceAudioWikilink, transcriptText),
          "utf-8",
        );
        await markDone(options.stateDir, job.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await fs.writeFile(
          job.transcriptPath,
          buildFailureContent(job.id, sourceAudioWikilink, message),
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
