# didactic-meme

A TypeScript-based Markdown automation pipeline for an [Obsidian](https://obsidian.md/) vault.

Reads and writes Markdown files structurally (AST-based, not regex) using the [unified/remark](https://github.com/remarkjs/remark) ecosystem. Rules are declared in one central registry and run sequentially.

## Inline Fields

Tasks in any `.md` file in the vault may carry **inline fields** — `key:value` tokens embedded in the task text. All date-valued fields use the `YYYY-MM-DD` format.

| Field       | Example             | Description                                                         |
| ----------- | ------------------- | ------------------------------------------------------------------- |
| `done`      | `done:2026-05-03`   | Date the task was checked off. Stamped automatically by Rule 2.     |
| `due`       | `due:2026-05-10`    | Target/deadline date. Set automatically on repeat.                  |
| `start`     | `start:2026-05-04`  | Task should not be surfaced before this date.                       |
| `snooze`    | `snooze:2026-05-06` | Suppress surfacing until this date (stronger than `start`).         |
| `repeat`    | `repeat:1s`         | Recurrence schedule (see grammar below).                            |
| `copied`    | `copied:1`          | Marker set by `completedTaskRollover` to prevent duplicate cloning. |
| `ephemeral` | `ephemeral:1`       | Marks a task as ephemeral — auto-removed if missed (see Rule 5).    |

### `repeat` grammar

```
repeat := <skipWeeks>? <days>
skipWeeks := one or more decimal digits   (number of weeks to skip; default 0)
days      := "d" | [smtwhfa]+
             ("d" is a daily shorthand for all seven days)
```

Weekday alphabet: `s`=Sunday · `m`=Monday · `t`=Tuesday · `w`=Wednesday · `h`=Thursday · `f`=Friday · `a`=Saturday

**Daily shorthand `d`** is an alias for `smtwhfa` (all seven days). The two
forms are completely interchangeable; prefer `d` for brevity.

**Examples:**

| Value            | Meaning                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `repeat:d`       | Daily (every day, skipWeeks=0) — shorthand for `smtwhfa`           |
| `repeat:smtwhfa` | Daily (every day, skipWeeks=0) — explicit form                     |
| `repeat:1d`      | Daily with 1-week skip — completing on Tue schedules Wed next week |
| `repeat:s`       | Weekly on Sunday (skipWeeks=0)                                     |
| `repeat:1s`      | Every other Sunday — skip 1 week, then next Sunday                 |
| `repeat:2mwf`    | Skip 2 weeks then schedule on the next Mon, Wed, or Fri            |

**Next-due algorithm:**

```
offset  = skipWeeks === 0 ? 1 : skipWeeks × 7 − 1
minDate = done + offset
newDue  = first date ≥ minDate whose weekday is in <days>
```

The `(n × 7 − 1)` offset for n > 0 keeps the task anchored to roughly the same weekday each cycle — completing a `repeat:1mwf` task on Monday produces a next due of Monday (~1 week later), not Tuesday.

When a repeating task is completed, `due:` is always set to `newDue`. If `start:` or `snooze:` are present they are shifted forward by the same number of days as `due` moved (`delta = newDue − oldDue`; if no `due:` existed, `oldDue = done`).

**Migration from `repeat:smtwhfa`:** replace with `repeat:d`. No other changes required.

## Vault Configuration (`.didactic-meme.json`)

On first run, `didactic-meme` creates a `.didactic-meme.json` file in your vault root populated with the default `sources` for every built-in rule. You can edit this file to customise which files each rule processes, alert delivery settings, and watch-mode options.

### Config shape

```jsonc
{
  // Optional watch-mode settings.
  "watch": {
    // Debounce duration in milliseconds (default: 60000 = 60 s).
    "debounce": 60000,
    // Optional scheduled run times (HH:MM local time) for incompleteTaskAlert.
    "alertSchedule": ["09:00"],
  },

  // Rule-specific settings and source overrides.
  "rules": {
    "normalizeTodayLiteral": {
      "sources": [{ "type": "glob", "pattern": "**/*.md" }],
    },
    "stampDone": {
      "sources": [{ "type": "glob", "pattern": "**/*.md" }],
    },
    "completedTaskRollover": {
      "sources": [{ "type": "glob", "pattern": "**/*.md" }],
    },
    "removeEphemeralOverdueTasks": {
      "sources": [{ "type": "glob", "pattern": "**/*.md" }],
    },
    "incompleteTaskAlert": {
      "sources": [
        {
          "type": "glob",
          "pattern": "**/*.md",
          "exclude": ["archive/**", "templates/**"],
        },
      ],
      "alertUrl": "http://localhost:8080/alert",
      "alertToken": "optional-token",
    },
  },
}
```

### Source types

| Type     | Fields                                           | Description                                                                                                        |
| -------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `"glob"` | `pattern` (required), `exclude` (optional array) | Matches files using a glob pattern relative to the vault root. `exclude` patterns are also relative to vault root. |
| `"path"` | `value` (required)                               | A single concrete file path relative to the vault root.                                                            |

### Auto-migration

When a new rule is added in a future release, its default entry is merged into `rules` in your existing `.didactic-meme.json` automatically on the next run. You do not need to edit the file by hand unless you want a non-default value.

### Validation

The file is validated with [zod](https://zod.dev/) on every run. If the file is malformed or contains an invalid source type the run aborts with a clear error message. Fix or delete the file and re-run.

## Watch Mode (`--watch`)

The `--watch` flag keeps the process running and automatically applies the selected rules whenever a vault markdown file changes.

```bash
# Watch the vault and run all rules on each changed file
VAULT_PATH=/my/vault didactic-meme --watch all

# Watch with dry-run (show diffs, write nothing)
VAULT_PATH=/my/vault didactic-meme --watch --dry-run all

# Watch and apply only specific rules on changes
VAULT_PATH=/my/vault didactic-meme --watch stampDone
```

### How it works

1. **Native watcher** — Uses Node.js's built-in `fs.watch()` with `recursive: true`. No polling is ever used.
2. **Per-file debouncing** — When a `.md` file changes, a debounce timer starts for that file. If the file changes again before the timer expires the timer resets. Rules are only run after the file has been idle for the full debounce period.
3. **Targeted processing** — Only the changed file is processed (equivalent to passing `--only <changedFile>` on the command line). The rest of the vault is not touched.

### Log output

| Log line                                      | Meaning                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| `[watch] change: notes/foo.md`                | A change event was received for `notes/foo.md`; debounce timer started/reset. |
| `[watch] Processing after idle: notes/foo.md` | Debounce timer expired; rules are about to run for `notes/foo.md`.            |
| `[watch] Error processing notes/foo.md: …`    | An error occurred while running rules for the file.                           |

### Debounce configuration

The debounce duration defaults to **60 seconds** and can be changed via the `watch.debounce` key in `.didactic-meme.json`:

```json
{
  "watch": { "debounce": 5000 }
}
```

Set `debounce` to the number of milliseconds the file must be idle before rules are triggered. Shorter values give faster feedback; the default 60 s is suitable for vaults edited by Obsidian, which can produce many rapid save events for a single logical edit.

### Compatibility

- `--watch` is **not** compatible with `--init`. Use them in separate invocations.
- `--watch` can be combined with `--dry-run` and `--verbose`.
- `--watch` does not use `--only`; the changed-file path is always used as the implicit filter.

## Environment Variables

| Variable     | Required | Default | Description                              |
| ------------ | -------- | ------- | ---------------------------------------- |
| `VAULT_PATH` | **Yes**  | —       | Absolute path to the Obsidian vault root |

## Docker / Docker Compose

A `Dockerfile` and `docker-compose.yml` are provided for containerized local development.
The vault is always mounted at `/vault` inside the container; `VAULT_PATH` is preset to `/vault`.

### Default watch mode

Set `VAULT_PATH` to your vault directory and start the service:

```bash
VAULT_PATH=/path/to/your/vault docker compose up
```

This mounts your vault at `/vault` inside the container and runs `didactic-meme --watch all` — all rules fire whenever a vault markdown file changes. If `VAULT_PATH` is not set it defaults to `./vault` (a `vault/` directory next to `docker-compose.yml`).

### One-off commands with arbitrary arguments

Use `docker compose run --rm` to pass any CLI arguments instead of the default watch invocation:

```bash
# Dry-run all rules once
VAULT_PATH=/path/to/your/vault docker compose run --rm didactic-meme --dry-run all

# Run only the stampDone rule
VAULT_PATH=/path/to/your/vault docker compose run --rm didactic-meme stampDone

# Watch with dry-run
VAULT_PATH=/path/to/your/vault docker compose run --rm didactic-meme --watch --dry-run all
```

### Build the image

```bash
docker compose build
```

## Global Installation

Install the `didactic-meme` command globally so you can run it from anywhere:

```bash
npm install -g .
```

> **Note:** The `prepare` script runs `npm run build` automatically, so no
> separate build step is needed before installing.

Then use the installed command:

```bash
# Show help
didactic-meme --help

# Dry-run all rules against your vault
VAULT_PATH=/path/to/your/vault didactic-meme --dry-run all

# Run only the stampDone rule (dependencies included automatically)
VAULT_PATH=/path/to/your/vault didactic-meme stampDone

# Normalize the vault with --init
VAULT_PATH=/path/to/your/vault didactic-meme --init

# Preview --init changes without writing (dry-run)
VAULT_PATH=/path/to/your/vault didactic-meme --init --dry-run
```

To uninstall:

```bash
npm uninstall -g didactic-meme
```

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
VAULT_PATH=/path/to/your/vault didactic-meme --help
```

### Run all rules (real mode)

```bash
VAULT_PATH=/path/to/your/vault didactic-meme all
```

### Run specific rules

Pass one or more rule names as positional arguments. The runner
automatically includes each rule's transitive dependencies and executes
them in the correct order.

```bash
# Stamp done dates only (normalizeTodayLiteral runs first automatically
# because it is a declared dependency of stampDone)
VAULT_PATH=/path/to/your/vault didactic-meme stampDone
```

```bash
# Run multiple rules explicitly
VAULT_PATH=/path/to/your/vault didactic-meme normalizeTodayLiteral stampDone
```

### Run with dry-run (prints a unified diff, no files written)

```bash
VAULT_PATH=/path/to/your/vault didactic-meme --dry-run all
```

```bash
# Dry-run for a single rule (dependencies included automatically)
VAULT_PATH=/path/to/your/vault didactic-meme --dry-run stampDone
```

`--dry-run` outputs a unified diff (one patch per changed file, sorted by path) to
stdout without writing anything to disk. The format is the same as the
`tests/vault.diff` snapshot used by the test suite.

Add `--verbose` to also print rule-progress logs and the run summary:

```bash
VAULT_PATH=/path/to/your/vault didactic-meme --dry-run --verbose all
```

### Normalize the vault with `--init`

```bash
VAULT_PATH=/path/to/your/vault didactic-meme --init
```

`--init` performs a two-step initialization pass over every `.md` file in
the vault:

1. **Formatting normalization** — each file is round-tripped through the
   parse → stringify pipeline (remark) and written back only if the content
   changed. No rule-driven date transformations are applied (e.g. `due:today`
   is left as-is).

2. **done stamping** — every checked (`[x]`) task that does **not**
   already have a `done:` inline field is stamped with
   `done:unknown`.
   This back-fills a placeholder date for tasks that were
   completed before `--init` was run. The `unknown` value is
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
VAULT_PATH=/path/to/your/vault didactic-meme --init --dry-run
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

Rules run sequentially in dependency order. Each rule declares which other
rules must complete before it, and the runner performs a stable topological
sort so the order is correct regardless of how rules are listed in the
registry.

### Rule 1 – Normalize Today Literal

**Source:** `src/rules/normalizeTodayLiteral.ts`

Scans all `**/*.md` files and replaces relative date literals (`today`,
`yesterday`, `tomorrow`) in inline date fields with resolved ISO dates
(`YYYY-MM-DD`). This runs first so all subsequent rules always operate on
real dates rather than relative keywords.

**Dependencies:** none

### Rule 2 – Stamp Done

**Source:** `src/rules/stampDone.ts`

Scans all `**/*.md` files in the vault for completed (checked) tasks and stamps each one that does **not** already carry a `done:` inline field with `done:YYYY-MM-DD` (today's date). This ensures every freshly completed task has an explicit completion date before later rules run.

**Dependencies:** `normalizeTodayLiteral`

### Rule 3 – Completed Task Rollover

**Source:** `src/rules/completedTaskRollover.ts`

Finds every **recurring** checked task (one that has a `repeat:` field) whose `done:` date equals **today** and that does not already carry a `copied:1` marker, then:

1. Appends `copied:1` to the completed task so it is not re-processed on subsequent runs (idempotency guard).
2. Inserts a fresh **incomplete** copy of the task immediately after the completed one, with the clone's date fields (`due`, `start`, `snooze`) advanced according to the `repeat:` schedule. The `done:` field is **not** included on the clone.

Tasks without a `repeat:` field are **never** duplicated and never receive `copied:1`, even if they are checked and have a `done:` date.

**Meaning of `copied:1`:** A task marked `copied:1` has already been rolled over in a previous pipeline run. The rollover rule skips it on all subsequent runs. Tasks completed before today (i.e. `done:` is an older date) are also skipped.

**Dependencies:** `stampDone`

### Rule 4 – Incomplete Task Alert

**Source:** `src/rules/incompleteTaskAlert.ts`

Finds all **incomplete** (unchecked) tasks across all `**/*.md` files in the vault and:

1. Groups them by file and sorts them by due date.
2. If `rules.incompleteTaskAlert.alertUrl` is set in `.didactic-meme.json`, performs an HTTP POST of the content to that URL with `Content-Type: text/markdown` and, if `rules.incompleteTaskAlert.alertToken` is set, `Authorization: Bearer <token>`.

**Dependencies:** `stampDone`

### Rule 5 – Remove Ephemeral Overdue Tasks

**Source:** `src/rules/removeEphemeralOverdueTasks.ts`

Removes **unchecked** tasks that carry an `ephemeral` field, have a `due:` date, and whose due date is **strictly before today** (yesterday or earlier). A task that was not completed by its deadline is considered expired and is deleted from the file.

**Behavior:**

- Completed (checked) tasks are **never** removed, even if overdue — if you finished it, it stays.
- An ephemeral task with **no `due:` field** is not removed (safe default; no deadline means no expiry).
- Idempotent: re-running after removal produces no further changes.
- `--dry-run` shows the diff of what would be removed without writing.

**Usage:**

```markdown
- [ ] Read the article ephemeral:1 due:2026-05-10
```

If today is 2026-05-11 and the task is still unchecked, it is silently deleted on the next pipeline run.

**Dependencies:** `normalizeTodayLiteral`

## Project Structure

```
src/
├── index.ts                    # CLI entrypoint
├── helpText.ts                 # --help output text (exported for testing)
├── config.ts                   # Vault-level config (.didactic-meme.json) — zod schemas + load/apply helpers
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
    ├── removeEphemeralOverdueTasks.ts # Rule 5
    └── incompleteTaskAlert.ts  # Rule 4
tests/
├── cli.test.ts                 # --help text, selectedRuleNames behaviour
├── config.test.ts              # vault-level config: create, merge, validation
├── tasks.test.ts               # extract tasks, toggle, remove, update
├── headings.test.ts            # append-under-heading with trim + create
├── inlineFields.test.ts        # getInlineField / setInlineField
├── scheduleUtils.test.ts       # parseRepeat, computeNextDue, date helpers
└── ruleSpecRunner.test.ts      # runRuleSpec, sortRuleSpecs, selectRuleSpecs
```

## Adding a New Rule

1. Create `src/rules/myRule.ts` and define a `RuleSpec` object with a unique `name`.
2. Declare any other rule names that must run before yours in the optional `dependencies` array.
3. Import and add it to the array in **`src/rules/index.ts`** — that is the single central place rules are declared. The runner automatically topologically sorts rules by their declared dependencies, so registration order does not matter.
