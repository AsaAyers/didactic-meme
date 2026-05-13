# 004 — `ensureAudioTranscripts` Rule

## Goal

Create `src/rules/ensureAudioTranscripts.ts` and register it in `src/rules/index.ts`.  This rule detects embedded `.m4a` files, inserts a mirrored transcript embed in the source note, creates a placeholder transcript file, and enqueues a transcription job.

---

## Rule Shape

```ts
import type { RuleSpec } from "./types.js";

export const ensureAudioTranscriptsSpec: RuleSpec = {
  name: "ensureAudioTranscripts",
  query: { type: "link", embed: true, extension: ".m4a" },
  sources: [{ type: "glob", pattern: "**/*.md" }],
  actions: [
    { type: "link.ensureSiblingTranscript" },
    { type: "link.requestTranscription" },
  ],
};
```

---

## Step-by-Step Behaviour

For each audio embed matched by the query:

1. **Resolve the audio path** relative to the source note's directory.
2. **Skip** if the resolved path escapes the vault root.
3. **Skip** if the audio file does not exist on disk (it may still be transferring).
4. **Derive** the sibling transcript path: `<audioBasename>.transcript.md` in the same directory as the audio file.
5. **Transcript already exists:**
   - Do **not** modify the transcript file.
   - Do **not** enqueue a transcription job.
   - **Do** insert the transcript embed into the source note if it is not already present.
6. **Transcript missing:**
   - Insert the transcript embed into the source note if not already present.
   - Create the placeholder transcript file (see task 005 for exact format).
   - Enqueue a transcription job (see task 005 for job shape).

---

## Transcript Embed Insertion

Scan the **whole file body** before inserting to avoid duplicates (`hasEmbedAnywhere`).  Insert immediately after the audio embed line (`insertEmbedBelowLine`).

### Style mirroring examples

| Audio embed in note | Inserted transcript embed |
|---|---|
| `![[recordings/2024-01-15 12.34.56.m4a]]` | `![[recordings/2024-01-15 12.34.56.transcript.md]]` |
| `![](recordings/2024-01-15 12.34.56.m4a)` | `![](recordings/2024-01-15 12.34.56.transcript.md)` |

---

## Registration in `src/rules/index.ts`

Add `ensureAudioTranscripts` after the existing task rules so it does not interfere with them:

```ts
// Suggested order
export const ruleSpecs: RuleSpec[] = [
  stampCompletionDateSpec,
  completedTaskRolloverSpec,
  incompleteTaskAlertSpec,
  normalizeTodayLiteralSpec,
  ensureAudioTranscriptsSpec,   // ← append here
];
```

---

## Acceptance Criteria

- [ ] `src/rules/ensureAudioTranscripts.ts` exists and exports `ensureAudioTranscriptsSpec`.
- [ ] Rule registered in `src/rules/index.ts`.
- [ ] Embed inserted immediately after the audio embed line.
- [ ] No duplicate embed inserted when the transcript embed already exists.
- [ ] Placeholder file created only when transcript is missing.
- [ ] Job enqueued only when transcript is missing.
- [ ] Paths outside the vault are skipped without error.
- [ ] Missing audio file is skipped without error.
- [ ] All E2E vault scenarios for this rule pass (see task 008).
- [ ] TypeScript build passes.
