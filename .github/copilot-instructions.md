# Copilot Instructions

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
