/**
 * Unit tests for the ruleSpecRunner engine.
 *
 * Only tests that are NOT already exercised by the E2E dry-run in
 * tests/normalizeTodayLiteral.test.ts belong here.  Specifically:
 *   - Date arithmetic for "yesterday" and "tomorrow" literals.
 *   - Engine mechanics (source resolution, predicates, actions) that the
 *     E2E vault does not exercise (no predicates, no path sources, no
 *     setFieldDateIfMissing action).
 *
 * Do NOT add tests that merely re-verify that "today" gets replaced — the
 * E2E snapshot already catches any regression in that path immediately.
 *
 * Each test uses a dedicated sub-directory under tests/test_vault/scenarios/
 * as its vaultPath, so no filesystem mocking is needed.  The scenario
 * directories are committed fixtures — create a new sub-directory if you need
 * a different file layout for a new test.
 */
import { describe, it, expect } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { runRuleSpec } from '../src/engine/ruleSpecRunner.js';
import type { RuleContext, RuleSpec } from '../src/rules/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS = join(__dirname, 'test_vault', 'scenarios');

const TODAY = new Date(2026, 4, 3); // 2026-05-03
const TODAY_STR = '2026-05-03';
const YESTERDAY_STR = '2026-05-02';
const TOMORROW_STR = '2026-05-04';

/** Build a context that reads directly from disk (no transform queue). */
function makeCtx(vaultPath: string): RuleContext {
  return {
    vaultPath,
    today: TODAY,
    dryRun: false,
    env: {},
    readFile: (path: string) => fs.readFile(path, 'utf-8').catch(() => ''),
  };
}

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

describe('ruleSpecRunner — source resolution', () => {
  it('resolves a path source to an absolute path', async () => {
    // scenarios/path-source/TODO.md: "- [ ] Task"
    // The E2E vault only exercises glob sources, not path sources.
    const ctx = makeCtx(join(SCENARIOS, 'path-source'));
    const spec: RuleSpec = {
      name: 'test',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks' },
      actions: [],
    };
    // No actions → file is read but not modified.
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(0);
  });

  it('glob source excludes non-matching file extensions', async () => {
    // scenarios/glob-mixed/: a.md, b.md, notes.txt
    // The E2E vault has no .txt files; this verifies .txt is never matched.
    const ctx = makeCtx(join(SCENARIOS, 'glob-mixed'));
    const spec: RuleSpec = {
      name: 'test',
      sources: [{ type: 'glob', pattern: '**/*.md' }],
      query: { type: 'tasks' },
      actions: [{ type: 'task.replaceFieldDateValue', key: 'due', from: 'today', to: 'today' }],
    };
    const result = await runRuleSpec(spec, ctx);
    // No tasks have due:today in the .md files, and the .txt is never read.
    expect(result.changes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Date arithmetic for relative literals
// (The E2E vault only uses "today"; yesterday/tomorrow are not in main/TODO.md)
// ---------------------------------------------------------------------------

describe('ruleSpecRunner — date arithmetic', () => {
  it('resolves "yesterday" to the day before today', async () => {
    // scenarios/relative-dates/TODO.md: "- [ ] Task A due:yesterday / - [ ] Task B start:tomorrow"
    const ctx = makeCtx(join(SCENARIOS, 'relative-dates'));
    const spec: RuleSpec = {
      name: 'normalize',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks' },
      actions: [
        { type: 'task.replaceFieldDateValue', key: 'due', from: 'yesterday', to: 'yesterday' },
      ],
    };
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.content).toContain(`due:${YESTERDAY_STR}`);
  });

  it('resolves "tomorrow" to the day after today', async () => {
    // scenarios/relative-dates/TODO.md: "- [ ] Task A due:yesterday / - [ ] Task B start:tomorrow"
    const ctx = makeCtx(join(SCENARIOS, 'relative-dates'));
    const spec: RuleSpec = {
      name: 'normalize',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks' },
      actions: [
        { type: 'task.replaceFieldDateValue', key: 'start', from: 'tomorrow', to: 'tomorrow' },
      ],
    };
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.content).toContain(`start:${TOMORROW_STR}`);
  });
});

// ---------------------------------------------------------------------------
// task.replaceFieldDateValue — negative / edge cases
// (The E2E verifies the positive case; these cover behavior not visible there)
// ---------------------------------------------------------------------------

describe('ruleSpecRunner — replaceFieldDateValue edge cases', () => {
  it('does not modify a field whose value does not match from', async () => {
    // scenarios/no-replace/TODO.md: "- [ ] Pay rent due:2026-05-03"
    // Verifies the "from" guard: only exact matches are replaced.
    const ctx = makeCtx(join(SCENARIOS, 'no-replace'));
    const spec: RuleSpec = {
      name: 'normalize',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks' },
      actions: [{ type: 'task.replaceFieldDateValue', key: 'due', from: 'today', to: 'today' }],
    };
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(0);
  });

  it('does not modify tasks that do not have the target field', async () => {
    // scenarios/no-field/TODO.md: "- [ ] No date fields here"
    const ctx = makeCtx(join(SCENARIOS, 'no-field'));
    const spec: RuleSpec = {
      name: 'normalize',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks' },
      actions: [{ type: 'task.replaceFieldDateValue', key: 'due', from: 'today', to: 'today' }],
    };
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// task.setFieldDateIfMissing
// (Not used by normalizeTodayLiteral; not exercised by the E2E run)
// ---------------------------------------------------------------------------

describe('ruleSpecRunner — task.setFieldDateIfMissing', () => {
  it('sets a missing field to the current date', async () => {
    // scenarios/set-missing/TODO.md: "- [x] Finished task"
    const ctx = makeCtx(join(SCENARIOS, 'set-missing'));
    const spec: RuleSpec = {
      name: 'stamp',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks', predicate: { type: 'checked' } },
      actions: [{ type: 'task.setFieldDateIfMissing', key: 'completionDate', value: 'today' }],
    };
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.content).toContain(`completionDate:${TODAY_STR}`);
  });

  it('does not overwrite an existing field', async () => {
    // scenarios/set-existing/TODO.md: "- [x] Finished task completionDate:2026-01-01"
    const ctx = makeCtx(join(SCENARIOS, 'set-existing'));
    const spec: RuleSpec = {
      name: 'stamp',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks', predicate: { type: 'checked' } },
      actions: [{ type: 'task.setFieldDateIfMissing', key: 'completionDate', value: 'today' }],
    };
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Predicate evaluation
// (normalizeTodayLiteral uses no predicate; none of these are in the E2E run)
// ---------------------------------------------------------------------------

describe('ruleSpecRunner — predicates', () => {
  it('checked predicate selects only checked tasks', async () => {
    // scenarios/checked-unchecked/TODO.md: "- [x] Done / - [ ] Todo"
    const ctx = makeCtx(join(SCENARIOS, 'checked-unchecked'));
    const spec: RuleSpec = {
      name: 'test',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks', predicate: { type: 'checked' } },
      actions: [{ type: 'task.setFieldDateIfMissing', key: 'completionDate', value: 'today' }],
    };
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(1);
    const content = result.changes[0]?.content ?? '';
    expect(content).toContain(`- [x] Done completionDate:${TODAY_STR}`);
    expect(content).toContain('- [ ] Todo');
    expect(content).not.toContain('Todo completionDate');
  });

  it('unchecked predicate selects only unchecked tasks', async () => {
    // scenarios/unchecked-today/TODO.md: "- [x] Done / - [ ] Todo due:today"
    const ctx = makeCtx(join(SCENARIOS, 'unchecked-today'));
    const spec: RuleSpec = {
      name: 'test',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks', predicate: { type: 'unchecked' } },
      actions: [{ type: 'task.replaceFieldDateValue', key: 'due', from: 'today', to: 'today' }],
    };
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(1);
    const content = result.changes[0]?.content ?? '';
    expect(content).toContain(`due:${TODAY_STR}`);
    // The checked task had no due field and was not selected.
    expect(content).toContain('- [x] Done');
  });

  it('fieldExists predicate returns only tasks with that field', async () => {
    // scenarios/field-exists/TODO.md: "- [ ] With due:2026-05-01 / - [ ] Without"
    const ctx = makeCtx(join(SCENARIOS, 'field-exists'));
    const spec: RuleSpec = {
      name: 'test',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks', predicate: { type: 'fieldExists', key: 'due' } },
      actions: [
        { type: 'task.replaceFieldDateValue', key: 'due', from: '2026-05-01', to: TODAY_STR },
      ],
    };
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.content).toContain(`due:${TODAY_STR}`);
    expect(result.changes[0]?.content).toContain('- [ ] Without');
    expect(result.changes[0]?.content).not.toContain('Without due:');
  });

  it('fieldDateBefore predicate selects tasks whose date field is before the reference', async () => {
    // scenarios/date-before/TODO.md: overdue (2026-04-01) and future (2026-06-01)
    const ctx = makeCtx(join(SCENARIOS, 'date-before'));
    const spec: RuleSpec = {
      name: 'test',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: {
        type: 'tasks',
        predicate: { type: 'fieldDateBefore', key: 'due', date: 'today' },
      },
      actions: [
        { type: 'task.replaceFieldDateValue', key: 'due', from: '2026-04-01', to: TODAY_STR },
      ],
    };
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(1);
    const content = result.changes[0]?.content ?? '';
    expect(content).toContain(`due:${TODAY_STR}`);
    // Future task is not selected and its date is unchanged.
    expect(content).toContain('due:2026-06-01');
  });

  it('not predicate inverts selection', async () => {
    // scenarios/not-predicate/TODO.md: "- [ ] A due:today / - [ ] B"
    // Select tasks WITHOUT a due field → only B gets due:today set.
    const ctx = makeCtx(join(SCENARIOS, 'not-predicate'));
    const spec: RuleSpec = {
      name: 'test',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: {
        type: 'tasks',
        predicate: { type: 'not', predicate: { type: 'fieldExists', key: 'due' } },
      },
      actions: [{ type: 'task.setFieldDateIfMissing', key: 'due', value: 'today' }],
    };
    const result = await runRuleSpec(spec, ctx);
    expect(result.changes).toHaveLength(1);
    const content = result.changes[0]?.content ?? '';
    expect(content).toContain('- [ ] B due:');
    // Task A already had due:today — was not selected, stays as the literal "today".
    expect(content).toContain('due:today');
  });
});
