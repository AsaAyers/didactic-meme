# Copilot Instructions

## Testing

### Use test_vault for integration coverage; unit-test only what it misses

The primary integration test runs the full pipeline against `tests/test_vault/main/` in dry-run mode and compares the exact terminal output to a pinned `const expected = "..."` string.  This single test catches regressions in any behavior the vault exercises.

Only add unit tests for behavior that the test_vault run does **not** exercise.

**Good** — testing behavior the E2E vault doesn't cover:
- Date arithmetic for `"yesterday"` and `"tomorrow"` literals (the vault only uses `"today"`).
- Predicates (`checked`, `fieldDateBefore`, `not`, …) — `normalizeTodayLiteral` uses no predicate.
- The `setFieldDateIfMissing` action — not used by `normalizeTodayLiteral`.
- Negative/edge cases for actions (e.g. "does not overwrite an existing field").

**Bad** — redundant tests that the E2E already covers:
- A test that verifies `"due:today"` is transformed to an ISO date.  If that breaks, the E2E snapshot fails immediately.
- A test that verifies multiple `today` fields are replaced in one pass.  The vault has three such fields and the snapshot captures the count.

When the E2E vault is the right place to add a scenario, commit a new fixture file under `tests/test_vault/main/` and update the `const expected` snapshot accordingly.  For isolated engine mechanics, add a fixture file under `tests/test_vault/scenarios/<scenario-name>/` and write a focused unit test.

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
