# didactic-meme

A TypeScript-based Markdown automation pipeline for an [Obsidian](https://obsidian.md/) vault.

Reads and writes Markdown files structurally (AST-based, not regex) using the [unified/remark](https://github.com/remarkjs/remark) ecosystem. Rules are declared in one central registry and run sequentially.

## Inline Fields

Tasks in `/TODO.md` may carry **inline fields** — `key:value` tokens embedded in the task text. All date-valued fields use the `YYYY-MM-DD` format.

| Field | Example | Description |
|---|---|---|
| `completionDate` | `completionDate:2026-05-03` | Date the task was checked off. Stamped automatically by Rule 1. |
| `due` | `due:2026-05-10` | Target/deadline date. Set automatically on repeat. |
| `start` | `start:2026-05-04` | Task should not be surfaced before this date. |
| `snooze` | `snooze:2026-05-06` | Suppress surfacing until this date (stronger than `start`). |
| `repeat` | `repeat:1s` | Recurrence schedule (see grammar below). |

### `repeat` grammar

```
repeat := <skipWeeks>? <days>
skipWeeks := one or more decimal digits   (number of weeks to skip; default 0)
days      := one or more characters from the alphabet  s m t w h f a
```

Weekday alphabet: `s`=Sunday · `m`=Monday · `t`=Tuesday · `w`=Wednesday · `h`=Thursday · `f`=Friday · `a`=Saturday

**Examples:**

| Value | Meaning |
|---|---|
| `repeat:smtwhfa` | Daily (every day, skipWeeks=0) |
| `repeat:s` | Weekly on Sunday (skipWeeks=0) |
| `repeat:1s` | Every other Sunday — skip 1 week, then next Sunday |
| `repeat:2mwf` | Skip 2 weeks then schedule on the next Mon, Wed, or Fri |

**Next-due algorithm:**

```
minDate = completionDate + skipWeeks × 7 + 1 day
newDue  = first date ≥ minDate whose weekday is in <days>
```

When a repeating task is completed, `due:` is always set to `newDue`. If `start:` or `snooze:` are present they are shifted forward by the same number of days as `due` moved (`delta = newDue − oldDue`; if no `due:` existed, `oldDue = completionDate`).

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

### Lint

```bash
npm run lint
```

Auto-fix lint issues:

```bash
npm run lint:fix
```

## Git Hooks (Husky)

A Husky pre-commit hook runs `npm run lint` before every commit. If lint fails the commit is aborted, so all committed code is guaranteed to be lint-clean.

The hook is installed automatically when you run `npm install` (via the `prepare` script).

## Rules

Rules run sequentially in the order listed in the central registry (`src/rules/index.ts`).

### Rule 1 – Stamp Completion Date

**Source:** `src/rules/stampCompletionDate.ts`

Scans `/TODO.md` for completed (checked) tasks and stamps each one that does **not** already carry a `completionDate:YYYY-MM-DD` inline field with `completionDate:<today>`. This ensures every completed task has an explicit, traceable completion timestamp before later rules run.

### Rule 2 – Completed Task Rollover

**Source:** `src/rules/completedTaskRollover.ts`

Processes every completed task in `/TODO.md`:

- **With `repeat:`**: Computes the next due date using the repeat grammar and the `completionDate` inline field (falls back to today if the field is not yet present). Sets/overwrites `due:` to the new date. Shifts `start:` and `snooze:` forward by the same number of days (`delta = newDue − oldDue`; if no `due:` existed, `oldDue = completionDate`). Unchecks the task so it stays in `TODO.md` for the next cycle.
- **Without `repeat:`**: Removes the task from `TODO.md`.

Every processed task is **appended** to today's daily note at `YYYY/YYYY-MM-DD.md` under the heading defined by `DAILY_NOTE_HEADING` (default: `Completed Tasks`). The heading is created if it doesn't exist, and trailing blank lines are trimmed before appending.

### Rule 3 – Incomplete Task Alert

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
│   ├── tasks.ts                # extract / toggle / remove / update GFM task items
│   ├── headings.ts             # append-under-heading with auto-create + trim
│   └── inlineFields.ts         # getInlineField / setInlineField utilities
├── engine/
│   ├── io.ts                   # readFile, FileWriteManager (stage/commit)
│   └── runner.ts               # sequential rule runner + summary log
└── rules/
    ├── index.ts                # ← central rule registry (add new rules here)
    ├── types.ts                # Rule / RuleContext / FileChange / RuleResult types
    ├── scheduleUtils.ts        # parseRepeat, computeNextDue, date helpers
    ├── stampCompletionDate.ts  # Rule 1
    ├── completedTaskRollover.ts # Rule 2
    └── incompleteTaskAlert.ts  # Rule 3
tests/
├── tasks.test.ts               # extract tasks, toggle, remove, update
├── headings.test.ts            # append-under-heading with trim + create
├── inlineFields.test.ts        # getInlineField / setInlineField
├── scheduleUtils.test.ts       # parseRepeat, computeNextDue, date helpers
├── stampCompletionDate.test.ts # Rule 1 behaviour
└── completedTaskRollover.test.ts # Rule 2 behaviour
```

## Adding a New Rule

1. Create `src/rules/myRule.ts` implementing the `Rule` interface.
2. Import and add it to the array in **`src/rules/index.ts`** — that is the single central place rules are declared.
