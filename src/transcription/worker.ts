import { promises as fs } from "node:fs";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createFasterWhisperBackend } from "./fasterWhisperBackend.js";
import { buildFailureContent, buildSuccessContent } from "./format.js";
import { claimNext, markDone, markFailed } from "./queue.js";
import { resolveStateDir } from "./runtime.js";
import type { TranscriptionJob, WorkerOptions } from "./types.js";

const DEFAULT_POLL_INTERVAL_MS = 2_000;

function buildSourceAudioWikilink(job: TranscriptionJob): string {
  const sourceDir = dirname(job.sourceNotePath);
  const relTarget = relative(sourceDir, job.audioPath).replace(/\\/g, "/");
  return `[[${relTarget}]]`;
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

      const sourceAudioWikilink = buildSourceAudioWikilink(job);
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

async function main(): Promise<void> {
  const vaultPath = process.env["VAULT_PATH"] ?? "/vault";
  const stateDir = resolveStateDir(process.env, vaultPath);
  const backend = createFasterWhisperBackend({
    executablePath: process.env["FASTER_WHISPER_EXECUTABLE"],
    scriptPath: process.env["FASTER_WHISPER_SCRIPT"],
    model: process.env["FASTER_WHISPER_MODEL"],
    device: process.env["FASTER_WHISPER_DEVICE"],
    computeType: process.env["FASTER_WHISPER_COMPUTE_TYPE"],
    downloadRoot: process.env["FASTER_WHISPER_DOWNLOAD_ROOT"],
  });

  console.log(`Starting transcription worker...`);
  console.log(`Vault: ${vaultPath}`);
  console.log(`State dir: ${stateDir}`);

  await startWorker({ stateDir, backend });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  main().catch((err: unknown) => {
    console.error("Fatal transcription worker error:", (err as Error).message);
    process.exit(1);
  });
}
