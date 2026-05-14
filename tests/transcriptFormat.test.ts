import { describe, expect, it } from "vitest";
import {
  buildFailureContent,
  buildPlaceholder,
  buildSuccessContent,
} from "../src/transcription/format.js";

describe("transcription format helpers", () => {
  it("builds placeholder content with pending status, job id, and source audio", () => {
    const content = buildPlaceholder("abc123", "[[audio/clip.m4a]]");
    expect(content).toBe(`# Transcript

Status: pending
Job: abc123
Source audio: [[audio/clip.m4a]]

> Transcription is pending. This file will be updated when the job completes.
`);
  });

  it("builds success content with done status and transcript text", () => {
    const content = buildSuccessContent(
      "abc123",
      "[[audio/clip.m4a]]",
      "hello world",
    );
    expect(content).toBe(`
Status: done
Job: abc123
Source audio: [[audio/clip.m4a]]

# Transcript
hello world
`);
  });

  it("builds failure content with failed status and error details", () => {
    const content = buildFailureContent(
      "abc123",
      "[[audio/clip.m4a]]",
      "backend unavailable",
    );
    expect(content).toBe(`# Transcript

Status: failed
Job: abc123
Source audio: [[audio/clip.m4a]]

> Transcription failed.

## Error

backend unavailable
`);
  });
});
