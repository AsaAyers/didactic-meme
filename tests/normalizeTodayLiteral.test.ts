/**
 * End-to-end integration tests for the full pipeline run in dry-run mode.
 *
 * Tests use tests/test_vault/ — the complete committed vault.  The
 * normalizeTodayLiteral glob ("**\/*.md") scans the entire vault, including
 * the unit-test fixture files under scenarios/.  This means any regression in
 * the pipeline is immediately visible here without needing separate unit tests.
 *
 * No mocking: files are read from disk, the full rule pipeline executes, and
 * the returned { changes, report } are inspected.
 *
 * The primary test pins the exact terminal output a user would see when running:
 *   VAULT_PATH=tests/test_vault npm run run -- --dry-run
 * so that any change to the pipeline output is immediately visible in review.
 */
import { describe, it, expect } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { runAllRules } from '../src/engine/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_VAULT = join(__dirname, 'test_vault');

// Pin the date so assertions are deterministic regardless of when the test runs.
const TODAY = new Date(2026, 4, 3); // 2026-05-03
const TODAY_STR = '2026-05-03';
const YESTERDAY_STR = '2026-05-02';
const TOMORROW_STR = '2026-05-04';

describe('normalizeTodayLiteral — end-to-end dry-run via test_vault', () => {
  /**
   * Primary snapshot test: the full terminal output must match exactly.
   *
   * Replace the vault-specific absolute path with the stable placeholder
   * "<vault>" so the assertion is portable across machines.
   */
  it('dry-run report matches expected terminal output', async () => {
    const { report } = await runAllRules({
      vaultPath: TEST_VAULT,
      today: TODAY,
      dryRun: true,
      env: {},
    });

    const normalized = report.split(TEST_VAULT + '/').join('<vault>/');

    const expected = [
      'Running rule spec: normalizeTodayLiteral',
      'Running rule: stampCompletionDate',
      'Running rule: completedTaskRollover',
      'Running rule: incompleteTaskAlert',
      '[dry-run] Would write: <vault>/TODO.md',
      '[dry-run] Would write: <vault>/scenarios/not-predicate/TODO.md',
      '[dry-run] Would write: <vault>/scenarios/relative-dates/TODO.md',
      '[dry-run] Would write: <vault>/scenarios/unchecked-today/TODO.md',
      '[dry-run] Would write: <vault>/tmp_alert.md',
      '\n=== Run Summary ===',
      '  [normalizeTodayLiteral] Modified 7 task(s) across 4 file(s).',
      '  [stampCompletionDate] No tasks needed completion date stamping.',
      '  [completedTaskRollover] No completed tasks found.',
      `  [incompleteTaskAlert] Found 3 incomplete task(s). Alert written to <vault>/tmp_alert.md.`,
      '\nFiles written:',
      '  <vault>/TODO.md',
      '  <vault>/scenarios/not-predicate/TODO.md',
      '  <vault>/scenarios/relative-dates/TODO.md',
      '  <vault>/scenarios/unchecked-today/TODO.md',
      '  <vault>/tmp_alert.md',
    ].join('\n');

    expect(normalized).toBe(expected);
  });

  it('changed files contain resolved ISO dates, not relative literals', async () => {
    const { changes } = await runAllRules({
      vaultPath: TEST_VAULT,
      today: TODAY,
      dryRun: true,
      env: {},
    });

    // Main vault file: three "today" literals replaced.
    const todoChange = changes.find((c) => c.path === join(TEST_VAULT, 'TODO.md'));
    expect(todoChange, 'TODO.md must appear in staged changes').toBeDefined();
    const todoContent = todoChange!.content;
    expect(todoContent).toContain(`due:${TODAY_STR}`);
    expect(todoContent).toContain(`start:${TODAY_STR}`);
    expect(todoContent).toContain(`snooze:${TODAY_STR}`);
    expect(todoContent).not.toMatch(/\bdue:today\b/);
    expect(todoContent).not.toMatch(/\bstart:today\b/);
    expect(todoContent).not.toMatch(/\bsnooze:today\b/);

    // relative-dates scenario: "yesterday" and "tomorrow" replaced with ISO dates.
    const relChange = changes.find((c) => c.path.includes('relative-dates'));
    expect(relChange, 'relative-dates/TODO.md must appear in staged changes').toBeDefined();
    expect(relChange!.content).toContain(`due:${YESTERDAY_STR}`);
    expect(relChange!.content).toContain(`start:${TOMORROW_STR}`);
    expect(relChange!.content).not.toContain('due:yesterday');
    expect(relChange!.content).not.toContain('start:tomorrow');
  });

  it('does not modify the test_vault files on disk (dry-run guard)', async () => {
    const rawBefore = await fs.readFile(join(TEST_VAULT, 'TODO.md'), 'utf-8');

    await runAllRules({
      vaultPath: TEST_VAULT,
      today: TODAY,
      dryRun: true,
      env: {},
    });

    const rawAfter = await fs.readFile(join(TEST_VAULT, 'TODO.md'), 'utf-8');
    expect(rawAfter).toBe(rawBefore);
  });
});
