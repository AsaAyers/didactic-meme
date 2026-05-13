# 003 — Rule Engine: Link Branch and Shared File-Processing Helpers

## Goal

Extend `src/engine/ruleSpecRunner.ts` to handle `LinkQuery` specs while extracting clearly named, shared file-processing helpers to avoid duplicating logic between the task branch and the new link branch.

---

## Current Situation

`runRuleSpec` is task-centric. It resolves source paths, loads each file, splits frontmatter, runs task predicates, applies task actions, and assembles a `FileChange`. All of this logic is currently inlined in one function body, making it hard to reuse for the link branch without copy-paste.

---

## Files to Update

- `src/engine/ruleSpecRunner.ts` — primary change

---

## Required Refactor: Extract Shared Helpers

Before adding the link branch, extract the following clearly named helpers (module-private or exported as needed):

| Helper                                                           | Responsibility                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `resolveEffectiveSourcePaths(spec, vaultPath, options)`          | Apply glob source rules and `--only` filter; return absolute file paths. |
| `loadMarkdownSourceFile(filePath)`                               | Read file from disk (or staged queue), split into frontmatter + body.    |
| `buildMarkdownFileChange(filePath, originalContent, newContent)` | Produce a `FileChange` only when content has actually changed.           |
| `runTaskQuerySpec(spec, files, ctx)`                             | Existing task-branch logic, now isolated.                                |
| `runLinkQuerySpec(spec, files, ctx)`                             | New link-branch logic (see below).                                       |

> **Do not duplicate** source resolution, file loading, frontmatter splitting, or change assembly between the two branches.

---

## Link Branch Responsibilities (`runLinkQuerySpec`)

1. For each source file, call `extractMarkdownLinks` and filter with `matchesLinkQuery`.
2. For each matching link, delegate to the rule's link actions (initially `link.ensureSiblingTranscript` and `link.requestTranscription`).
3. Collect action results; use `buildMarkdownFileChange` to produce `FileChange` objects.
4. Stage new files (transcript placeholder) through the normal change pipeline so **dry-run diffs include every planned write**.

---

## Action Result Model

Use a structured `LinkActionResult` rather than side-effect-only custom actions:

```ts
export type LinkActionResult = {
  /** Updated body of the source note (if changed). */
  updatedBody?: string;
  /** New files to create, keyed by absolute path. */
  newFiles?: Record<string, string>;
  /** Transcription jobs to enqueue. */
  transcriptionJobs?: TranscriptionJob[];
};
```

This keeps dry-run behaviour predictable and testable.

---

## Acceptance Criteria

- [ ] All five helpers extracted and used by both branches.
- [ ] `runRuleSpec` delegates to `runTaskQuerySpec` or `runLinkQuerySpec` based on `spec.query.type`.
- [ ] Dry-run mode includes a diff for the transcript placeholder file.
- [ ] All existing task-based rule specs pass their tests unchanged.
- [ ] TypeScript build passes.
