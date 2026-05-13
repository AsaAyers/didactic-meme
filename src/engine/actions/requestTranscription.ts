import { randomUUID } from "node:crypto";
import type { MarkdownLink } from "../../markdown/links.js";
import type { RequestTranscriptionAction } from "../../rules/types.js";
import type { ActionOutcome, LinkActionContext } from "./types.js";
import { resolveTranscriptContext } from "./linkTranscriptionContext.js";
import { buildPlaceholder } from "../../transcription/format.js";
import type { TranscriptionJob } from "../../transcription/types.js";

function buildJobId(createdAtMs: number): string {
  const uuid = randomUUID();
  return `${createdAtMs.toString(36)}-${uuid}`;
}

export function applyRequestTranscription(
  taskText: string,
  action: RequestTranscriptionAction,
  link: MarkdownLink | undefined,
  ctx?: LinkActionContext,
): ActionOutcome {
  void action;
  if (!link || !ctx) {
    return { text: taskText };
  }
  const transcript = resolveTranscriptContext(link, ctx);
  if (!transcript || transcript.transcriptExists) {
    return { text: taskText };
  }

  const createdAtMs = ctx.today.getTime();
  const createdAt = ctx.today.toISOString();
  const job: TranscriptionJob = {
    id: ctx.jobIdFactory?.(ctx.today) ?? buildJobId(createdAtMs),
    audioPath: transcript.audioPath,
    transcriptPath: transcript.transcriptPath,
    sourceNotePath: ctx.sourceNotePath,
    createdAt,
  };

  return {
    text: taskText,
    newFiles: {
      [transcript.transcriptPath]: buildPlaceholder(
        job.id,
        `[[${link.target}]]`,
      ),
    },
    transcriptionJobs: [job],
  };
}
