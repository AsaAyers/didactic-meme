# 002 — Markdown Link Extraction and Insertion

## Goal

Create `src/markdown/links.ts` with helpers for extracting links from a Markdown body, matching them against a `LinkQuery`, deriving transcript targets, and inserting new embeds.

---

## Scope (v1)

**In scope**

- Embedded Obsidian wikilinks: `![[foo.m4a]]`
- Embedded standard Markdown images/audio: `![](foo.m4a)` and `![alt text](foo.m4a)`

Non-empty alt text may be tolerated if it simplifies the regex — the `MarkdownLink` type should capture it for round-trip fidelity.

**Out of scope (do not implement now)**

- Plain non-embed links (`[[foo]]`, `[text](url)`)
- Reference-style links (`[text][ref]`)
- Obsidian alias parsing (`![[foo|alias]]` → extract alias)
- Heading or block refs (`![[foo#section]]`, `![[foo^block]]`)
- Complex URL normalisation or percent-encoding

---

## Types

```ts
/** A single link or embed found in the document body. */
export type MarkdownLink = {
  /** Raw source string as it appears in the document, e.g. `![[foo.m4a]]`. */
  raw: string;
  /** The link target / path, e.g. `foo.m4a` or `audio/rec.m4a`. */
  target: string;
  /** True when the link uses the embed syntax (`![[...]]` or `![](...)``). */
  embed: boolean;
  /** True when the link uses Obsidian wikilink syntax (`[[...]]`). */
  wikilink: boolean;
  /** Zero-based index of the line where this link starts. */
  lineIndex: number;
};

/** Describes the planned insertion of a transcript embed below an audio embed. */
export type TranscriptLinkPlan = {
  audioLink: MarkdownLink;
  transcriptTarget: string;
  transcriptEmbed: string;
};
```

---

## Required Helpers

All helpers are exported from `src/markdown/links.ts`.

### `extractMarkdownLinks(body: string): MarkdownLink[]`

Scans the body line-by-line and returns every wikilink embed and standard markdown embed found.  Returns results in document order.

### `matchesLinkQuery(link: MarkdownLink, query: LinkQuery): boolean`

Returns `true` when the given `MarkdownLink` satisfies all non-undefined fields of `query`.

### `deriveTranscriptTarget(audioTarget: string): string`

Strips the audio extension and appends `.transcript.md`.

```
"recordings/2024-01-15.m4a"  →  "recordings/2024-01-15.transcript.md"
"note.m4a"                   →  "note.transcript.md"
```

### `buildMirroredTranscriptEmbed(link: MarkdownLink, transcriptTarget: string): string`

Produces an embed string that mirrors the style of the source audio embed:

| Source embed | Generated transcript embed |
|---|---|
| `![[rec.m4a]]` | `![[rec.transcript.md]]` |
| `![](rec.m4a)` | `![](rec.transcript.md)` |
| `![My note](rec.m4a)` | `![](rec.transcript.md)` (alt text not mirrored) |

### `hasEmbedAnywhere(body: string, rawEmbed: string): boolean`

Returns `true` if `rawEmbed` appears verbatim anywhere in `body`.  Used to avoid inserting a duplicate embed.

### `insertEmbedBelowLine(body: string, lineIndex: number, rawEmbed: string): string`

Inserts `rawEmbed` as a new line immediately after line `lineIndex` (zero-based).  Uses **line-oriented string manipulation** — do not use AST mutation for this operation.

---

## Acceptance Criteria

- [ ] `src/markdown/links.ts` exists with all helpers above exported.
- [ ] `MarkdownLink` and `TranscriptLinkPlan` are exported from the module.
- [ ] All helpers have corresponding unit tests in `tests/links.test.ts` for cases not already covered by E2E vault scenarios.
- [ ] TypeScript build passes.
- [ ] No remark/unified AST is used for link extraction or insertion in this module.
