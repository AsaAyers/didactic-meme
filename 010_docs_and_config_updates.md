# 010 — Docs and Config Updates

## Goal

Update `README.md` and any config-related documentation to reflect the new `ensureAudioTranscripts` rule.

---

## What to Document

### Supported Embed Forms

Explain that the rule matches both:

- Obsidian wikilink embeds: `![[recordings/2024-01-15 12.34.56.m4a]]`
- Standard Markdown embeds: `![](recordings/2024-01-15 12.34.56.m4a)`

### Sibling Transcript Creation

Document that a sibling transcript file `<basename>.transcript.md` is created in the same directory as the audio file.

### Mirrored Embed Insertion

Document that a transcript embed is inserted into the source note immediately below the audio embed, mirroring the embed style used by the audio.

### Async Processing

Document that transcription runs in the background; the rule engine enqueues a job and moves on. The transcript file will be updated once the worker completes.

### Existing Transcript — No-Op

Document that if `<basename>.transcript.md` already exists the rule does not overwrite it. Only the transcript embed in the source note is inserted if missing.

### Missing Audio File — Skip

Document that if the referenced audio file does not exist the embed is silently skipped (the file may still be transferring).

### Failure Content

Document that if transcription fails the transcript file is updated with an error message.

### Docker Compose Worker Path

Point users to `007_docker_compose_gpu_transcriber.md` (or the relevant README section) for instructions on starting the GPU worker with `docker compose up`.

---

## Configuration

The rule uses the **existing per-rule `sources` model** — no special transcript configuration is needed for v1. To restrict the rule to a specific folder, configure its `sources` in `.didatic-meme.json`:

```json
{
  "rules": {
    "ensureAudioTranscripts": {
      "sources": [{ "type": "glob", "pattern": "daily/**/*.md" }]
    }
  }
}
```

### Dry-Run Behaviour

In dry-run mode (`--dry-run`), the rule:

1. Logs the audio file that would be processed.
2. Shows a unified diff of the source note (embed insertion).
3. Shows the content of the transcript placeholder that would be created.
4. Does **not** write any files or enqueue any jobs.

---

## Rule List

Add `ensureAudioTranscripts` to the rule list in `README.md`:

| Rule                     | What it does                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| …                        | …                                                                                                                                                                                   |
| `ensureAudioTranscripts` | For each embedded `.m4a` audio file, creates a sibling `.transcript.md` placeholder and enqueues async GPU transcription. Inserts a mirrored transcript embed into the source note. |

---

## Acceptance Criteria

- [ ] `README.md` rule table updated with `ensureAudioTranscripts`.
- [ ] Supported embed forms documented.
- [ ] Sibling transcript creation, mirrored embed insertion, async processing, no-op for existing transcript, and skip for missing audio all documented.
- [ ] Failure content format documented.
- [ ] Dry-run behaviour documented.
- [ ] Per-rule `sources` config example present.
- [ ] Docker Compose worker setup referenced.
