import type { TranscriptResult } from "./processTranscript.js";

export type TranscriptionStatus =
  | "pending"
  | "removingDeadAir"
  | "transcribing"
  | "trimDeadAir"
  | "processingTranscript"
  | "failedDeadAir"
  | "failedTranscription"
  | "done";

export type TranscriptionJob = {
  jobId: string;
  sourceAudioWikilink: string;
  status: TranscriptionStatus;
  transcriptText?: string;
  errorMessage?: string;
  transcriptResult?: TranscriptResult;
  trimmed?: boolean;
};

export function formatTranscriptFile({
  jobId,
  sourceAudioWikilink,
  status,
  transcriptResult,
  errorMessage,
  transcriptText,
  trimmed,
}: TranscriptionJob) {
  const frontmatter = `---
status: ${status}
trimmedAudio: ${trimmed ? "yes" : "no"}
jobId: ${jobId}${transcriptResult?.filename ? `\nfilename: "${transcriptResult.filename}"` : ""}
---`;

  const parts: string[] = [];

  parts.push(`
Source audio: ${sourceAudioWikilink}
`);

  switch (status) {
    case "pending":
      parts.push("> Transcription is pending.");
      break;
    case "transcribing":
      parts.push("> Transcription is in progress.");
      break;
    case "processingTranscript":
      parts.push("> Transcript is being processed.");
      break;
    case "removingDeadAir":
      parts.push("> Removing dead air before final transcription.");
      break;
    case "failedDeadAir":
      parts.push("> Dead air removal failed.");
      break;
    case "failedTranscription":
      parts.push("> Transcription failed during audio processing.");
      break;
    case "done": /* do nothing */
  }

  if (errorMessage) {
    parts.push(`## Error

${errorMessage}
`);
  }

  const transcriptContent = transcriptText ?? "";
  if (transcriptContent) {
    parts.push(`# Transcript\n\n${transcriptContent}`);
  }

  if (transcriptResult?.summary) {
    parts.push(`# Summary\n\n${transcriptResult.summary}`);
  }

  if (transcriptResult && (transcriptResult?.tasks.length ?? 0) > 0) {
    const tasks = transcriptResult.tasks.map((task) => task.toString());

    parts.push(`# Tasks\n\n${tasks.join("\n")}`);
  }

  return `${frontmatter}${parts.join("\n")}`;
}
