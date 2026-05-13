import { createHash } from "node:crypto";
import type { MarkdownLink } from "../../markdown/links.js";
import type { RequestTranscriptionAction } from "../../rules/types.js";
import type { ActionOutcome, LinkActionContext } from "./types.js";
import { resolveTranscriptContext } from "./linkTranscriptionContext.js";

function buildJobId(
  link: MarkdownLink,
  transcriptPath: string,
  sourceNotePath: string,
  createdAtMs: number,
): string {
  const digest = createHash("sha1")
    .update(
      `${sourceNotePath}|${link.target}|${transcriptPath}|${link.lineIndex}`,
    )
    .digest("hex")
    .slice(0, 12);
  return `${createdAtMs.toString(36)}-${digest}`;
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

  return {
    text: taskText,
    transcriptionJobs: [
      {
        id: buildJobId(
          link,
          transcript.transcriptPath,
          ctx.sourceNotePath,
          createdAtMs,
        ),
        audioPath: transcript.audioPath,
        transcriptPath: transcript.transcriptPath,
        sourceNotePath: ctx.sourceNotePath,
        createdAt,
      },
    ],
  };
}
