/**
 * Unit tests for the ruleSpecRunner engine.
 *
 * Only tests that are NOT already exercised by the E2E dry-run in
 * tests/normalizeTodayLiteral.test.ts belong here.
 *
 * The E2E vault (tests/test_vault/) is scanned by normalizeTodayLiteral with
 * a "**\/*.md" glob, which covers:
 *   - "today" replacement (main TODO.md)
 *   - "yesterday" / "tomorrow" date arithmetic (scenarios/relative-dates/)
 *   - Negative cases: files without matching fields are not modified
 *     (scenarios/date-before/, scenarios/field-exists/, etc.)
 *
 * Tests that remain here cover engine behaviour the E2E vault does NOT exercise:
 *   - task.setFieldDateIfMissing — not used by normalizeTodayLiteral
 *   - Predicates (checked, unchecked, fieldExists, fieldDateBefore, not) —
 *     normalizeTodayLiteral uses no predicate
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
