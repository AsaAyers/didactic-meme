# Copilot Instructions

## Testing

### Use test_vault for integration coverage; unit-test only what it misses

The primary integration test runs the full pipeline against `tests/test_vault/` in dry-run mode and compares the exact terminal output to a pinned `const expected = "..."` string.  This single test catches regressions in any behavior the vault exercises.

The E2E vault is `tests/test_vault/`.  All markdown files anywhere under this directory are scanned by the `normalizeTodayLiteral` glob rule, including fixture files under `scenarios/`.  Only add unit tests for behaviour the E2E run does **not** exercise.

**Good** — testing behaviour the E2E vault doesn't cover:
- Predicates (`checked`, `fieldDateBefore`, `not`, …) — `normalizeTodayLiteral` uses no predicate.
- The `setFieldDateIfMissing` action — not used by `normalizeTodayLiteral`.
- Negative/edge cases for actions (e.g. "does not overwrite an existing field").

**Bad** — redundant tests that the E2E already covers:
- A test that verifies `"due:today"` is transformed to an ISO date.  If that breaks, the E2E snapshot fails immediately.
- A test that verifies `"due:yesterday"` or `"due:tomorrow"` is resolved — `scenarios/relative-dates/TODO.md` is processed in the E2E run, so the snapshot catches any regression.
- A test that verifies multiple `today` fields are replaced in one pass.  The vault has three such fields and the snapshot captures the count.

When the E2E vault is the right place to add a scenario, commit a new fixture file anywhere under `tests/test_vault/` and update the `const expected` snapshot accordingly.  For isolated engine mechanics (predicates, setFieldDateIfMissing), add a fixture file under `tests/test_vault/scenarios/<scenario-name>/` and write a focused unit test.

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
