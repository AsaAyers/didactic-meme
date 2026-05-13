# 005 — Transcript Placeholder and Queue Contract

## Goal

Define the exact content format for the transcript placeholder file and the JSON shape for filesystem queue jobs, so that all tasks implement against the same contract.

---

## Placeholder Transcript Format

When a transcript file does not exist, the rule creates it with the following content (a generated `<job-id>` is included so the worker can locate the output file):

```markdown
# Transcript

Status: pending
Job: <job-id>
Source audio: [[foo.m4a]]

> Transcription is pending. This file will be updated when the job completes.
```

Replace `<job-id>` with the actual generated job ID (e.g. a UUID or timestamp-prefixed random string).
Replace `[[foo.m4a]]` with a wikilink pointing at the audio file 

---

## Failure Content Format

If the worker cannot transcribe the audio, it **replaces the entire placeholder** with:

```markdown
# Transcript

Status: failed
Job: <job-id>
Source audio: [[foo.m4a]]

> Transcription failed.

## Error

<error message here>
```

---

## Success Content Format

On success the worker **replaces the entire placeholder** with:

```markdown
# Transcript

Status: done
Job: <job-id>
Source audio: [[foo.m4a]]

<transcript text here>
```

> Always **replace** the placeholder file in full rather than appending to it. This keeps the file clean and snapshot-friendly.

---

## Filesystem Queue Layout

```
<state-dir>/
├── pending/      ← jobs waiting to be picked up
├── processing/   ← job moved here while worker is active
├── done/         ← completed jobs
└── failed/       ← jobs that errored
```

The queue lives **outside the vault** if possible (configurable via the Docker Compose environment) to avoid polluting the user's notes.

---

## Queue Job JSON Shape

Each job is stored as a single JSON file named `<job-id>.json`:

```json
{
  "id": "01J0000000-abc123",
  "audioPath": "/vault/recordings/2024-01-15 12.34.56.m4a",
  "transcriptPath": "/vault/recordings/2024-01-15 12.34.56.transcript.md",
  "sourceNotePath": "/vault/daily/2024-01-15.md",
  "createdAt": "2024-01-15T12:34:56.000Z"
}
```

All paths are **absolute** inside the container.

---

## Job ID Requirements

- Globally unique within the queue directory.
- Sortable by creation time (prefix with timestamp or use a time-ordered UUID such as UUIDv7 or `Date.now().toString(36) + "-" + Math.random().toString(36).slice(2)`).
- Safe for use as a filename (no slashes or special characters).

---

## Acceptance Criteria

- [ ] Placeholder format documented and implemented consistently in `src/transcription/format.ts`.
- [ ] Failure and success formats documented and implemented.
- [ ] Queue job JSON shape matches the definition above.
- [ ] Job IDs are unique, time-ordered, and filename-safe.
- [ ] Worker always replaces the placeholder file rather than appending.
- [ ] All placeholder/format logic is unit-tested in `tests/transcriptFormat.test.ts`.
