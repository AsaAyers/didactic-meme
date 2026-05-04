# Copilot Instructions

## Testing

### Use test_vault for integration coverage; unit-test only what it misses

The primary integration test runs the full pipeline against `tests/test_vault/` in dry-run mode.
Every `.md` file anywhere under that directory must have a companion `.md.expected` file.
The test asserts that the pipeline's output for each `.md` exactly matches its `.md.expected`.
Files unchanged by the pipeline have a `.md.expected` identical to their source.

The E2E vault is `tests/test_vault/`.  All markdown files anywhere under this directory are scanned by the `normalizeTodayLiteral` glob rule, including fixture files under `scenarios/`.  Only add unit tests for behaviour the E2E run does **not** exercise.

**Good** — testing behaviour the E2E vault doesn't cover:
- Predicates (`checked`, `fieldDateBefore`, `not`, …) — `normalizeTodayLiteral` uses no predicate.
- The `setFieldDateIfMissing` action — not used by `normalizeTodayLiteral`.
- Negative/edge cases for actions (e.g. "does not overwrite an existing field").

**Bad** — redundant tests that the E2E already covers:
- A test that verifies `"due:today"` is transformed to an ISO date.  If that breaks, the E2E snapshot fails immediately.
- A test that verifies `"due:yesterday"` or `"due:tomorrow"` is resolved — `scenarios/relative-dates/TODO.md` is processed in the E2E run, so the snapshot catches any regression.
- A test that verifies multiple `today` fields are replaced in one pass.  The vault has three such fields and the snapshot captures the count.

### Adding a new scenario to the vault

Each scenario lives in `tests/test_vault/scenarios/<scenario-name>/` and must have:

1. **`tasks.md`** — the input file as it would exist on disk.
2. **`tasks.md.expected`** — the exact content the pipeline should produce.

If the pipeline does not modify the file, `tasks.md.expected` must be a copy of `tasks.md` (with any formatting normalisation the remark round-trip produces, e.g. `-` bullets becoming `*`).

**The vault must cover all possible scenarios.**  Whenever a new syntax, rule, or behaviour is added:

- Add a matching scenario directory so that the E2E test exercises it.
- Write the `.md.expected` to reflect the correct output with the pinned `TODAY = new Date(2026, 4, 3)` (Sunday 2026-05-03) that the test uses.
- If the new scenario involves a skip-weeks modifier, derive the expected due date using the formula: `offset = skipWeeks === 0 ? 1 : skipWeeks × 7 − 1`, then find the first date ≥ `completionDate + offset` whose weekday is in the repeat schedule.

**Existing scenario directories** (keep up to date when rules change):

| Directory | What it covers |
|---|---|
| `repeat-basic` | `repeat:s` (Sunday-only, no skip) |
| `repeat-rollover` | `repeat:a` with `start`/`snooze`/`due` shift |
| `repeat-today-fallback` | `repeat:s` without pre-existing `done:` |
| `repeat-daily-shorthand` | `repeat:d` (daily shorthand, no skip) |
| `repeat-daily-skip` | `repeat:1d` (daily with 1-week skip) |
| `repeat-weekly-skip` | `repeat:1mwf` (Mon/Wed/Fri with 1-week skip) |
| `rollover-already-copied` | task with `copied:1` is not re-cloned |
| `rollover-no-recurrence` | task without `repeat:` is never cloned |
| `rollover-not-today` | task with past `done:` date is skipped |

## Code style

### Avoid pass-through wrapper functions

Do not create functions that only forward their arguments to another function. Import and use the library function directly at the call site.

**Bad** — wrapping a library without adding value:
```ts
import { addDays as dateFnsAddDays } from 'date-fns';

export function addDays(date: Date, n: number): Date {
  return dateFnsAddDays(date, n);
}
```

**Good** — import the library function where it is needed:
```ts
import { addDays } from 'date-fns';

// use addDays directly
```

**Good** — a thin wrapper is fine when it adds meaningful logic (e.g. baking in a format string):
```ts
import { format } from 'date-fns';

export function formatDateStr(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}
```
