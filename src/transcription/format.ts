import type { TranscriptResult } from "./processTranscript.js";

type Status =
  | "pending"
  | "removingDeadAir"
  | "transcribing"
  | "processingTranscript"
  | "failedDeadAir"
  | "failedTranscription"
  | "done";

type TranscriptionJob = {
  jobId: string;
  sourceAudioWikilink: string;
  status: Status;
  transcriptText?: string;
  errorMessage?: string;
  transcriptResult?: TranscriptResult;
};

export function formatTranscriptFile({
  jobId,
  sourceAudioWikilink,
  status,
  transcriptResult,
  errorMessage,
  transcriptText,
}: TranscriptionJob) {
  const frontmatter = `---
status: ${status}
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
    case "removingDeadAir":
      parts.push("> Removing dead air before final transcription.");
      break;
    case "failedDeadAir":
      parts.push("> Dead air removal failed.");
      break;
    case "failedTranscription":
      parts.push("> Transcription failed during audio processing.");
      break;
  }

  if (errorMessage) {
    parts.push(`## Error

${errorMessage}
`);
  }

  const transcriptContent =
    transcriptResult?.cleanedTranscript ?? transcriptText ?? "";
  if (transcriptContent) {
    parts.push(`# Transcript\n\n${transcriptContent}`);
  }

  if (transcriptResult?.summary) {
    parts.push(`# Summary\n\n${transcriptResult.summary}`);
  }

  if (transcriptResult && (transcriptResult?.tasks.length ?? 0) > 0) {
    const tasks = transcriptResult.tasks.map(
      (task) =>
        `- [${task.complete ? "x" : " "}] ${task.title} ${task.dueDate ? "due:" + task.dueDate : ""} - ${task.details}`,
    );

    parts.push(`# Tasks\n\n${tasks.join("\n")}`);
  }

  return `${frontmatter}${parts.join("\n")}`;
}
