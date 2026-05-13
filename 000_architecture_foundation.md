# 000 — Architecture Foundation

## Goal

Establish the architecture and key decisions before any implementation begins, so that later tasks have a clear, consistent target to implement against.

---

## Decisions Already Made

| # | Decision |
|---|----------|
| 1 | Only `.m4a` files are supported in v1. |
| 2 | Both `![[foo.m4a]]` (Obsidian wikilink embed) and `![](foo.m4a)` (standard markdown embed) are supported. |
| 3 | The transcript file lives beside the audio file and is named `foo.transcript.md` (basename preserved). |
| 4 | If the transcript file already exists, leave it alone — it is either complete or in progress. |
| 5 | A missing transcript file is the sole trigger for processing. |
| 6 | Dry run shows a unified diff for the source note and logs the audio file that would be processed; no files are written. |
| 7 | Transcription is async and non-blocking; the rule engine enqueues a job and moves on. |
| 8 | If transcription fails the error message is written into the transcript file; the worker continues. |
| 9 | If the audio file referenced by an embed does not exist, skip processing (file may still be transferring). |
| 10 | All paths are constrained to the vault root; embeds that escape the vault are skipped. |
| 11 | No special user config is needed; existing per-rule `sources` scoping covers the use case. |
| 12 | The transcript embed inserted into the source note mirrors the style of the audio embed (wikilink ↔ wikilink, markdown ↔ markdown). |
| 13 | A filesystem queue (`pending/`, `processing/`, `done/`, `failed/`) is used rather than Redis or any external broker. |
| 14 | The placeholder transcript includes a generated `<job-id>` so the worker can locate its output file. |

---

## Architectural Direction

The new feature should be modelled as a **link query**.  Embeds are a filtered subset of links (`embed: true`), so:

- `TaskQuery` continues to target task list items.
- `LinkQuery` targets Markdown links and wikilinks, with optional filters for `embed` and `extension`.
- Future possible selectors (not in scope now): plain links, tags, mentions.

This avoids duplicating shared file-processing logic: source resolution, file loading, frontmatter splitting, and change assembly are extracted into clearly named helpers used by both the task branch and the new link branch of `runRuleSpec`.

Prefer **structured `ActionResult`-style return values** over side-effect-only custom actions so that dry-run diffs include all planned writes (including the transcript placeholder).

> **Do not over-generalise** beyond what is needed for tasks and links right now.  Introduce link-specific actions only when the link branch is built; do not force premature unification.

---

## Acceptance Criteria

- [ ] All decisions above are documented and agreed before any source file is created.
- [ ] The link-query shape (`LinkQuery`) is sketched and reviewed (see task 001).
- [ ] No feature code exists yet; this task produces documentation only.
