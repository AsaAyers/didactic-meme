/**
 * Integration test for the normalizeTodayLiteral rule.
 *
 * Uses tests/test_vault — a real directory committed to the repository — and
 * runs the full pipeline in dry-run mode.  No mocking: the test reads actual
 * files from disk and inspects the in-memory transform queue output.
 */
import { describe, it, expect } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAllRules } from '../src/engine/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_VAULT = join(__dirname, 'test_vault');

// Fix today so dates in assertions are deterministic regardless of when the
// test is run.
const TODAY = new Date(2026, 4, 3); // 2026-05-03
const TODAY_STR = '2026-05-03';

describe('normalizeTodayLiteral — dry-run integration via test_vault', () => {
  it('replaces all "today" inline-field literals in TODO.md with the run date', async () => {
    const changes = await runAllRules({
      vaultPath: TEST_VAULT,
      today: TODAY,
      dryRun: true,
      env: {},
    });

    // The normalization rule must have staged TODO.md.
    const todoChange = changes.find((c) => c.path.endsWith('TODO.md'));
    expect(todoChange, 'TODO.md must appear in staged changes').toBeDefined();

    const content = todoChange!.content;
    expect(content).toContain(`due:${TODAY_STR}`);
    expect(content).toContain(`start:${TODAY_STR}`);
    expect(content).toContain(`snooze:${TODAY_STR}`);

    // The raw "today" literal must be gone.
    expect(content).not.toMatch(/\bdue:today\b/);
    expect(content).not.toMatch(/\bstart:today\b/);
    expect(content).not.toMatch(/\bsnooze:today\b/);
  });

  it('does not modify the test_vault files on disk (dry-run guard)', async () => {
    // Running with dryRun: true must never write to the real filesystem.
    // We verify this by reading the raw file after the run and confirming it
    // still contains the original "today" literals.
    const { promises: fs } = await import('node:fs');
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
