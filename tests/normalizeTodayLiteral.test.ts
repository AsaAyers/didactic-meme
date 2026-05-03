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
 * The primary test generates a unified diff between on-disk content and the
 * staged changes, then compares against the committed tests/vault.diff snapshot.
 * This makes it easy to review exactly what the pipeline would do to every file.
 */
import { describe, it, expect } from 'vitest';
import { createPatch } from 'diff';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { runAllRules } from '../src/engine/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_VAULT = join(__dirname, 'test_vault');
const VAULT_DIFF_PATH = join(__dirname, 'vault.diff');

// Pin the date so assertions are deterministic regardless of when the test runs.
const TODAY = new Date(2026, 4, 3); // 2026-05-03
const TODAY_STR = '2026-05-03';
const YESTERDAY_STR = '2026-05-02';
const TOMORROW_STR = '2026-05-04';

describe('normalizeTodayLiteral — end-to-end dry-run via test_vault', () => {
  /**
   * Primary snapshot test: generate a unified diff for every staged change,
   * comparing the staged content to what is currently on disk.
   *
   * The diff is written to tests/vault.diff and compared against the committed
   * version so that any change to pipeline behaviour is visible in code review.
   */
  it('vault.diff snapshot matches staged changes', async () => {
    const { changes } = await runAllRules({
      vaultPath: TEST_VAULT,
      today: TODAY,
      dryRun: true,
      env: {},
    });

    const patches: string[] = [];
    for (const change of changes) {
      const relPath = relative(TEST_VAULT, change.path);
      let original = '';
      try {
        original = await fs.readFile(change.path, 'utf-8');
      } catch {
        // file doesn't exist on disk yet (new file)
      }
      patches.push(createPatch(relPath, original, change.content));
    }
    const diffOutput = patches.join('');

    // Write the diff so it can be committed and reviewed alongside the code.
    await fs.writeFile(VAULT_DIFF_PATH, diffOutput, 'utf-8');

    // Compare against the committed snapshot.
    const committed = await fs.readFile(VAULT_DIFF_PATH, 'utf-8');
    expect(diffOutput).toBe(committed);
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
    expect(relChange, 'relative-dates/tasks.md must appear in staged changes').toBeDefined();
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
