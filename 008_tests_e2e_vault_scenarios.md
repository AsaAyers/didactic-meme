# 008 — Tests: E2E Vault Scenarios

## Goal

Add `tests/test_vault/scenarios/` directories that give the main vault integration test full coverage of the `ensureAudioTranscripts` rule.

---

## Reminder: Repo Testing Guidance

- Every `.md` file anywhere under `tests/test_vault/` **must** have a matching `.md.expected` file.
- The E2E test runs `runAllRules` in dry-run mode against `tests/test_vault/` with `today` pinned to `new Date(2026, 4, 3)` (2026-05-03).
- If the pipeline does not modify a file, `.md.expected` must be identical to the source (accounting for any remark round-trip normalisation, e.g. `-` bullets becoming `*`).
- Transcription must be **faked** — no real Docker or model execution in tests.

---

## Required Scenarios

### `audio-embed-wikilink-missing-transcript`

- `tasks.md` contains `![[recordings/2024-01-15 12.34.56.m4a]]`.
- No `.transcript.md` exists.
- `tasks.md.expected` shows the transcript embed inserted below the audio embed.
- `recordings/2024-01-15 12.34.56.transcript.md.expected` contains the placeholder content (with a stable fake job-id for snapshot purposes).

### `audio-embed-markdown-missing-transcript`

- `tasks.md` contains `![](recordings/2024-01-15 12.34.56.m4a)`.
- No `.transcript.md` exists.
- `tasks.md.expected` shows the standard-markdown transcript embed inserted.
- Transcript placeholder `.md.expected` present.

### `audio-embed-transcript-already-exists`

- `tasks.md` contains the audio embed but **no** transcript embed.
- `recordings/2024-01-15 12.34.56.transcript.md` already exists with real content.
- `tasks.md.expected` shows the transcript embed inserted (embed still added to note).
- `recordings/2024-01-15 12.34.56.transcript.md.expected` is **identical** to the input (file not touched).
- No new job enqueued.

### `audio-embed-audio-missing`

- `tasks.md` contains an embed referencing an audio file that does not exist.
- `tasks.md.expected` is **identical** to `tasks.md` (no changes).

### `audio-embed-outside-vault-skipped`

- `tasks.md` contains `![[../outside/secret.m4a]]` (path escapes vault root).
- `tasks.md.expected` is identical (skipped without error).

### `audio-embed-transcription-failure`

- The scenario uses the fake backend configured to return an error.
- Transcript placeholder `.md.expected` contains the failure content format (see task 005).

---

## Fixture Guidance

- Audio fixture files (`.m4a`) can be zero-byte files; the rule only checks for existence.
- Use a **deterministic fake job-id** (e.g. `"test-job-001"`) injected via a test helper so snapshots are stable.
- The fake transcription backend returns a fixed string (`"Fake transcript text."`) to keep `.expected` files simple.

---

## Acceptance Criteria

- [ ] All six scenario directories created with `tasks.md` and `tasks.md.expected`.
- [ ] Zero-byte `.m4a` fixture files present where needed.
- [ ] Fake transcriber backend implemented and wired into the E2E test run.
- [ ] `npm test` passes with all new snapshots matching.
- [ ] No real Docker, GPU, or audio model is invoked during tests.
