# 001 — Query Model: Generalise to Links

## Goal

Extend the declarative query model so that rule specs can target Markdown links (including embeds) in addition to task list items.

---

## Current Limitation

`TaskQuery` (and the `Query` union that wraps it) only knows about GFM task-list items. The rule engine's `runRuleSpec` therefore has no way to select links or embeds from a file body.

```ts
// Current types.ts (simplified)
export type TaskQuery = { type: "tasks" /* task predicates */ };
export type Query = TaskQuery;
```

Any rule that needs to act on audio embeds cannot be expressed with the existing model.

---

## Proposed Change

Add a `LinkQuery` variant to the `Query` union:

```ts
export type LinkQuery = {
  type: "link";
  /** When true, only match embeds (![[...]] or ![](...)).  Default: false (match all links). */
  embed?: boolean;
  /** When set, only match links whose target ends with this extension (e.g. ".m4a"). */
  extension?: string;
};

export type Query = TaskQuery | LinkQuery;
```

### Intended Usage — Audio Feature

```ts
const audioQuery: LinkQuery = {
  type: "link",
  embed: true,
  extension: ".m4a",
};
```

This matches every embedded `.m4a` wikilink or markdown embed found in the scanned source files.

---

## Constraints

- **Task query is unchanged.** Existing rules continue to work with no modifications.
- **Link-specific actions** (`link.ensureSiblingTranscript`, `link.requestTranscription`, etc.) will be added in task 003 rather than forcing premature unification with task actions.
- The `LinkQuery` type lives alongside `TaskQuery` in `src/rules/types.ts`.

---

## Acceptance Criteria

- [ ] `LinkQuery` type added to `src/rules/types.ts`.
- [ ] `Query` union updated to `TaskQuery | LinkQuery`.
- [ ] Existing `TaskQuery`-based rule specs compile without changes.
- [ ] TypeScript build passes with no new errors.
- [ ] Unit test or type-level assertion confirms that `{ type: "link", embed: true, extension: ".m4a" }` satisfies `LinkQuery`.
