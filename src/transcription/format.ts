export function buildPlaceholder(
  jobId: string,
  sourceAudioWikilink: string,
): string {
  return `# Transcript

Status: pending
Job: ${jobId}
Source audio: ${sourceAudioWikilink}

> Transcription is pending. This file will be updated when the job completes.
`;
}

export function buildSuccessContent(
  jobId: string,
  sourceAudioWikilink: string,
  transcriptText: string,
): string {
  return `# Transcript

Status: done
Job: ${jobId}
Source audio: ${sourceAudioWikilink}

${transcriptText}
`;
}

export function buildFailureContent(
  jobId: string,
  sourceAudioWikilink: string,
  errorMessage: string,
): string {
  return `# Transcript

Status: failed
Job: ${jobId}
Source audio: ${sourceAudioWikilink}

> Transcription failed.

## Error

${errorMessage}
`;
}
