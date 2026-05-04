# didactic-meme

A TypeScript-based Markdown automation pipeline for an [Obsidian](https://obsidian.md/) vault.

Reads and writes Markdown files structurally (AST-based, not regex) using the [unified/remark](https://github.com/remarkjs/remark) ecosystem. Rules are declared in one central registry and run sequentially.

## Inline Fields

Tasks in any `.md` file in the vault may carry **inline fields** — `key:value` tokens embedded in the task text. All date-valued fields use the `YYYY-MM-DD` format.

| Field | Example | Description |
|---|---|---|
| `done` | `done:2026-05-03` | Date the task was checked off. Stamped automatically by Rule 2. |
| `due` | `due:2026-05-10` | Target/deadline date. Set automatically on repeat. |
| `start` | `start:2026-05-04` | Task should not be surfaced before this date. |
| `snooze` | `snooze:2026-05-06` | Suppress surfacing until this date (stronger than `start`). |
| `repeat` | `repeat:1s` | Recurrence schedule (see grammar below). |
| `copied` | `copied:1` | Marker set by `completedTaskRollover` to prevent duplicate cloning. |

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
minDate = done + skipWeeks × 7 + 1 day
newDue  = first date ≥ minDate whose weekday is in <days>
```

When a repeating task is completed, `due:` is always set to `newDue`. If `start:` or `snooze:` are present they are shifted forward by the same number of days as `due` moved (`delta = newDue − oldDue`; if no `due:` existed, `oldDue = done`).

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `VAULT_PATH` | **Yes** | — | Absolute path to the Obsidian vault root |
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

### Show help

```bash
VAULT_PATH=/path/to/your/vault yarn run run -- --help
```

### Run all rules (real mode)

```bash
VAULT_PATH=/path/to/your/vault yarn run run -- all
```

### Run specific rules

Pass one or more rule names as positional arguments.  The runner
automatically includes each rule's transitive dependencies and executes
them in the correct order.

```bash
# Stamp done dates only (normalizeTodayLiteral runs first automatically
# because it is a declared dependency of stampDone)
VAULT_PATH=/path/to/your/vault yarn run run -- stampDone
```

```bash
# Run multiple rules explicitly
VAULT_PATH=/path/to/your/vault yarn run run -- normalizeTodayLiteral stampDone
```

### Run with dry-run (prints a unified diff, no files written)

```bash
VAULT_PATH=/path/to/your/vault yarn run run -- --dry-run all
```

```bash
# Dry-run for a single rule (dependencies included automatically)
VAULT_PATH=/path/to/your/vault yarn run run -- --dry-run stampDone
```

`--dry-run` outputs a unified diff (one patch per changed file, sorted by path) to
stdout without writing anything to disk.  The format is the same as the
`tests/vault.diff` snapshot used by the test suite.

Add `--verbose` to also print rule-progress logs and the run summary:

```bash
VAULT_PATH=/path/to/your/vault yarn run run -- --dry-run --verbose all
```

### Normalize the vault with `--init`

```bash
VAULT_PATH=/path/to/your/vault npm run run -- --init
```

`--init` performs a two-step initialization pass over every `.md` file in
the vault:

1. **Formatting normalization** — each file is round-tripped through the
   parse → stringify pipeline (remark) and written back only if the content
   changed.  No rule-driven date transformations are applied (e.g. `due:today`
   is left as-is).

2. **done stamping** — every checked (`[x]`) task that does **not**
   already have a `done:` inline field is stamped with
   `done:unknown`.
   This back-fills a placeholder date for tasks that were
   completed before `--init` was run.  The `unknown` value is
   intentionally not a real date, so it is never matched by the
   date-based predicates in the normal rule pipeline (in particular,
   `completedTaskRollover` will not clone tasks stamped by `--init`).

This is intended to be run once before making rule-driven changes so that
subsequent diffs reflect only intentional semantic edits rather than incidental
formatting noise or missing done fields.

- Only `.md` files are processed; other file types are ignored.
- YAML frontmatter (`---\n...\n---`) is preserved verbatim; only the body is normalized.
- Obsidian wikilinks (`[[Page]]`, `![[image.png]]`) are round-tripped without escaping.
- Hidden directories (e.g. `.git`, `.obsidian`) are skipped automatically.
- A summary line is printed: `Init: scanned N file(s), rewrote M.`

**Stability guarantee**: after the first normalization pass `--init` runs a
second pass internally to verify that the normalized output is itself a NOOP.
If the second pass would still produce changes the command exits with an error
— this protects against a buggy pipeline that would re-format on every run.

Combine with `--dry-run` to preview which files would be rewritten:

```bash
VAULT_PATH=/path/to/your/vault npm run run -- --init --dry-run
```

`--init` and the normal rule-pipeline mode are mutually exclusive: use one or
the other per invocation.

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

Rules run sequentially in dependency order.  Each rule declares which other
rules must complete before it, and the runner performs a stable topological
sort so the order is correct regardless of how rules are listed in the
registry.

### Rule 1 – Normalize Today Literal

**Source:** `src/rules/normalizeTodayLiteral.ts`

Scans all `**/*.md` files and replaces relative date literals (`today`,
`yesterday`, `tomorrow`) in inline date fields with resolved ISO dates
(`YYYY-MM-DD`).  This runs first so all subsequent rules always operate on
real dates rather than relative keywords.

**Dependencies:** none

### Rule 2 – Stamp Done

**Source:** `src/rules/stampDone.ts`

Scans all `**/*.md` files in the vault for completed (checked) tasks and stamps each one that does **not** already carry a `done:` inline field with `done:YYYY-MM-DD` (today's date). This ensures every freshly completed task has an explicit completion date before later rules run.

**Dependencies:** `normalizeTodayLiteral`

### Rule 3 – Completed Task Rollover

**Source:** `src/rules/completedTaskRollover.ts`

Finds every checked task whose `done:` date equals **today** and that does not already carry a `copied:1` marker, then:

1. Appends `copied:1` to the completed task so it is not re-processed on subsequent runs (idempotency guard).
2. Inserts a fresh **incomplete** copy of the task immediately after the completed one.
   - If the task has a `repeat:` schedule, the clone's date fields (`due`, `start`, `snooze`) are advanced according to that schedule (same algorithm as the `computeNextDue` helper), leaving the original task's dates untouched.
   - If no `repeat:` field is present, the clone inherits the original date fields unchanged.
   - The `done:` field is **not** included on the clone.

**Meaning of `copied:1`:** A task marked `copied:1` has already been rolled over in a previous pipeline run.  The rollover rule skips it on all subsequent runs.  Tasks completed before today (i.e. `done:` is an older date) are also skipped.

**Dependencies:** `stampDone`

### Rule 4 – Incomplete Task Alert

**Source:** `src/rules/incompleteTaskAlert.ts`

Finds all **incomplete** (unchecked) tasks across all `**/*.md` files in the vault and:

1. Writes them as a Markdown list to `ALERT_FILE` (default: `$VAULT_PATH/tmp_alert.md`).
2. If `ALERT_URL` is set, performs an HTTP POST of the file contents to that URL with `Content-Type: text/markdown` and, if `ALERT_TOKEN` is set, `Authorization: Bearer <token>`.

**Dependencies:** `completedTaskRollover`

## Project Structure

```
src/
├── index.ts                    # CLI entrypoint
├── helpText.ts                 # --help output text (exported for testing)
├── markdown/
│   ├── parse.ts                # unified/remark parse + stringify + gray-matter helpers
│   ├── tasks.ts                # extract / toggle / remove / update GFM task items
│   ├── headings.ts             # append-under-heading with auto-create + trim
│   └── inlineFields.ts         # getInlineField / setInlineField utilities
├── engine/
│   ├── io.ts                   # readFile, FileWriteManager (stage/commit)
│   └── runner.ts               # rule runner, sortRuleSpecs, selectRuleSpecs, runInitPass
└── rules/
    ├── index.ts                # ← central rule registry (add new rules here)
    ├── types.ts                # Rule / RuleContext / FileChange / RuleResult types
    ├── scheduleUtils.ts        # parseRepeat, computeNextDue, date helpers
    ├── normalizeTodayLiteral.ts # Rule 1
    ├── stampDone.ts            # Rule 2
    ├── completedTaskRollover.ts # Rule 3
    └── incompleteTaskAlert.ts  # Rule 4
tests/
├── cli.test.ts                 # --help text, selectedRuleNames behaviour
├── tasks.test.ts               # extract tasks, toggle, remove, update
├── headings.test.ts            # append-under-heading with trim + create
├── inlineFields.test.ts        # getInlineField / setInlineField
├── scheduleUtils.test.ts       # parseRepeat, computeNextDue, date helpers
└── ruleSpecRunner.test.ts      # runRuleSpec, sortRuleSpecs, selectRuleSpecs
```

## Adding a New Rule

1. Create `src/rules/myRule.ts` and define a `RuleSpec` object with a unique `name`.
2. Declare any other rule names that must run before yours in the optional `dependencies` array.
3. Import and add it to the array in **`src/rules/index.ts`** — that is the single central place rules are declared.  The runner automatically topologically sorts rules by their declared dependencies, so registration order does not matter.
