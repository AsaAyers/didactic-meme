import type { MarkdownLink } from "../../markdown/links.js";
import type { EnsureSiblingTranscriptAction } from "../../rules/types.js";
import type { ActionOutcome, LinkActionContext } from "./types.js";
import {
  maybeInsertTranscriptEmbed,
  resolveTranscriptContext,
} from "./linkTranscriptionContext.js";

const TRANSCRIPT_PLACEHOLDER = `# Transcript

Status: pending
Job: 
`;

export function applyEnsureSiblingTranscript(
  taskText: string,
  action: EnsureSiblingTranscriptAction,
  link: MarkdownLink | undefined,
  ctx?: LinkActionContext,
): ActionOutcome {
  void action;
  const transcript = resolveTranscriptContext(link, ctx);
  if (!transcript) return { text: taskText };

  const updatedBody = maybeInsertTranscriptEmbed(
    taskText,
    link,
    transcript.transcriptEmbed,
  );

  if (transcript.transcriptExists) {
    return { text: taskText, ...(updatedBody ? { updatedBody } : {}) };
  }

  return {
    text: taskText,
    ...(updatedBody ? { updatedBody } : {}),
    newFiles: {
      [transcript.transcriptPath]: TRANSCRIPT_PLACEHOLDER,
    },
  };
}
