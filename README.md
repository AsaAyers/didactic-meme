# didactic-meme

A TypeScript-based Markdown automation pipeline for an [Obsidian](https://obsidian.md/) vault.

Reads and writes Markdown files structurally (AST-based, not regex) using the [unified/remark](https://github.com/remarkjs/remark) ecosystem. Rules are declared in one central registry and run sequentially.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `VAULT_PATH` | **Yes** | — | Absolute path to the Obsidian vault root |
| `DAILY_NOTE_HEADING` | No | `Completed Tasks` | Heading to append completed tasks under in the daily note |
| `ALERT_FILE` | No | `$VAULT_PATH/tmp_alert.md` | Path for the incomplete-task alert file |
| `ALERT_URL` | No | — | HTTP endpoint to POST `tmp_alert.md` content to |
| `ALERT_TOKEN` | No | — | Bearer token sent as `Authorization: Bearer …` header |

## How to Run

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Run (real mode)

```bash
VAULT_PATH=/path/to/your/vault npm run run
```

### Run with dry-run (no files written)

```bash
VAULT_PATH=/path/to/your/vault npm run run -- --dry-run
```

### Run tests

```bash
npm test
```

## Rules

### Rule 1 – Completed Task Rollover

**Source:** `src/rules/completedTaskRollover.ts`

Processes `/TODO.md` in the vault and handles completed (checked) tasks:

- If the task text contains the tag `#recurring`, the task is **unchecked** (reset to incomplete) in `/TODO.md`.
- Otherwise, the completed task is **removed** from `/TODO.md`.
- Every processed task (recurring or not) is **appended** to today's daily note at `YYYY/YYYY-MM-DD.md` under the heading defined by `DAILY_NOTE_HEADING` (default: `Completed Tasks`). The heading is created if it doesn't exist, and trailing blank lines are trimmed before appending.

### Rule 2 – Incomplete Task Alert

**Source:** `src/rules/incompleteTaskAlert.ts`

Finds all **incomplete** (unchecked) tasks in `/TODO.md` and:

1. Writes them as a Markdown list to `ALERT_FILE` (default: `$VAULT_PATH/tmp_alert.md`).
2. If `ALERT_URL` is set, performs an HTTP POST of the file contents to that URL with `Content-Type: text/markdown` and, if `ALERT_TOKEN` is set, `Authorization: Bearer <token>`.

## Project Structure

```
src/
├── index.ts                    # CLI entrypoint
├── markdown/
│   ├── parse.ts                # unified/remark parse + stringify + gray-matter helpers
│   ├── tasks.ts                # extract / toggle / remove GFM task items
│   └── headings.ts             # append-under-heading with auto-create + trim
├── engine/
│   ├── io.ts                   # readFile, FileWriteManager (stage/commit)
│   └── runner.ts               # sequential rule runner + summary log
└── rules/
    ├── index.ts                # ← central rule registry (add new rules here)
    ├── types.ts                # Rule / RuleContext / FileChange / RuleResult types
    ├── completedTaskRollover.ts
    └── incompleteTaskAlert.ts
tests/
├── tasks.test.ts               # extract tasks, toggle, remove
└── headings.test.ts            # append-under-heading with trim + create
```

## Adding a New Rule

1. Create `src/rules/myRule.ts` implementing the `Rule` interface.
2. Import and add it to the array in **`src/rules/index.ts`** — that is the single central place rules are declared.
