import type { MarkdownLink } from "../../markdown/links.js";
import type { RequestTranscriptionAction } from "../../rules/types.js";
import type { ActionOutcome, LinkActionContext } from "./types.js";
import { resolveTranscriptContext } from "./linkTranscriptionContext.js";

function buildJobId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function applyRequestTranscription(
  taskText: string,
  action: RequestTranscriptionAction,
  link: MarkdownLink | undefined,
  ctx?: LinkActionContext,
): ActionOutcome {
  void action;
  const transcript = resolveTranscriptContext(link, ctx);
  if (!transcript || transcript.transcriptExists || !ctx) {
    return { text: taskText };
  }

  return {
    text: taskText,
    transcriptionJobs: [
      {
        id: buildJobId(),
        audioPath: transcript.audioPath,
        transcriptPath: transcript.transcriptPath,
        sourceNotePath: ctx.sourceNotePath,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}
