# 009 — Tests: Unit Tests for Link and Transcript Helpers

## Goal

Add focused unit tests for logic that the E2E vault run does not adequately exercise on its own.

---

## Guiding Principle

The E2E vault scenarios (task 008) are the primary regression safety net.  Only add unit tests for behaviour that the vault run cannot conveniently catch — such as edge cases in pure helper functions, queue atomicity under error conditions, and format string correctness.

Do **not** write unit tests that duplicate what a vault snapshot already catches (e.g. "wikilink embed is inserted below audio line" — the E2E snapshot verifies this end-to-end).

---

## Suggested Test Files

### `tests/links.test.ts`

Covers `src/markdown/links.ts` helpers for cases not already exercised by E2E:

- `extractMarkdownLinks` — empty body, body with no embeds, multiple embeds on same line, embeds inside code blocks (should not match), mixed wikilink and markdown embed in same file.
- `matchesLinkQuery` — `embed: false` does not match wikilink embeds; `extension` filter is case-insensitive or exact (document the chosen behaviour); `embed` and `extension` combined.
- `deriveTranscriptTarget` — paths with directories, paths with spaces, paths with multiple dots in basename.
- `buildMirroredTranscriptEmbed` — wikilink source → wikilink output; markdown source → markdown output; alt text is dropped.
- `hasEmbedAnywhere` — exact match, partial match (must not trigger), match in middle of line.
- `insertEmbedBelowLine` — single line, last line, line index 0.

### `tests/transcriptionQueue.test.ts`

Covers `src/transcription/queue.ts`:

- `enqueue` writes a JSON file to `pending/`.
- `claimNext` returns `null` when queue is empty.
- `claimNext` returns the oldest job and moves it to `processing/`.
- `markDone` moves job from `processing/` to `done/`.
- `markFailed` moves job from `processing/` to `failed/` and preserves the error in the filename or a sidecar.
- Calling `claimNext` twice concurrently does not return the same job (basic atomicity check using a temp directory).

### `tests/transcriptFormat.test.ts`

Covers `src/transcription/format.ts`:

- `buildPlaceholder` — output contains job-id, audio wikilink, and "pending" status.
- `buildSuccessContent` — output contains transcript text and "done" status.
- `buildFailureContent` — output contains error message and "failed" status.
- All three functions produce stable, snapshot-friendly output (no embedded timestamps).

---

## Acceptance Criteria

- [ ] `tests/links.test.ts` created with the cases listed above.
- [ ] `tests/transcriptionQueue.test.ts` created with the cases listed above.
- [ ] `tests/transcriptFormat.test.ts` created with the cases listed above.
- [ ] No test duplicates behaviour already covered by an E2E vault snapshot.
- [ ] `npm test` passes with all new tests green.
