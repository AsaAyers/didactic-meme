/**
 * Tests for CLI-level behavior: --help text, rule selection via runAllRules,
 * unknown-rule validation.
 *
 * Rule-selection engine logic (selectRuleSpecs) is tested in
 * ruleSpecRunner.test.ts.  These tests exercise the integration between the
 * runner and the registered rule registry.
 */
import { describe, it, expect } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAllRules } from '../src/engine/runner.js';
import { HELP_TEXT } from '../src/helpText.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_VAULT = join(__dirname, 'test_vault');

const TODAY = new Date(2026, 4, 3); // 2026-05-03

// ---------------------------------------------------------------------------
// --help text
// ---------------------------------------------------------------------------

describe('HELP_TEXT', () => {
  it('mentions --dry-run', () => {
    expect(HELP_TEXT).toContain('--dry-run');
  });

  it('mentions --verbose', () => {
    expect(HELP_TEXT).toContain('--verbose');
  });

  it('mentions --init', () => {
    expect(HELP_TEXT).toContain('--init');
  });

  it('mentions --help', () => {
    expect(HELP_TEXT).toContain('--help');
  });

  it('mentions the "all" keyword', () => {
    expect(HELP_TEXT).toContain('all');
  });

  it('lists known rule names', () => {
    expect(HELP_TEXT).toContain('normalizeTodayLiteral');
    expect(HELP_TEXT).toContain('stampDone');
    expect(HELP_TEXT).toContain('completedTaskRollover');
    expect(HELP_TEXT).toContain('incompleteTaskAlert');
  });

  it('mentions VAULT_PATH environment variable', () => {
    expect(HELP_TEXT).toContain('VAULT_PATH');
  });

  it('shows a usage example with a single rule name', () => {
    expect(HELP_TEXT).toContain('stampDone');
  });
});

// ---------------------------------------------------------------------------
// runAllRules — selectedRuleNames
// ---------------------------------------------------------------------------

describe('runAllRules — selectedRuleNames', () => {
  it('runs all rules when selectedRuleNames is "all"', async () => {
    // Expect changes from the vault including normalizeTodayLiteral transforms.
    const { changes } = await runAllRules({
      vaultPath: TEST_VAULT,
      today: TODAY,
      dryRun: true,
      env: {},
      selectedRuleNames: 'all',
    });
    // The vault TODO.md has due:today which normalizeTodayLiteral replaces.
    const todoChange = changes.find((c) => c.path.endsWith('TODO.md'));
    expect(todoChange).toBeDefined();
    expect(todoChange!.content).toContain('due:2026-05-03');
  });

  it('runs all rules when selectedRuleNames is omitted (backward compat)', async () => {
    const { changes } = await runAllRules({
      vaultPath: TEST_VAULT,
      today: TODAY,
      dryRun: true,
      env: {},
    });
    const todoChange = changes.find((c) => c.path.endsWith('TODO.md'));
    expect(todoChange).toBeDefined();
  });

  it('selecting stampDone also runs normalizeTodayLiteral (its dependency)', async () => {
    // The vault has tasks with due:today in TODO.md.
    // normalizeTodayLiteral should run because stampDone depends on it.
    const { changes } = await runAllRules({
      vaultPath: TEST_VAULT,
      today: TODAY,
      dryRun: true,
      env: {},
      selectedRuleNames: ['stampDone'],
    });
    const todoChange = changes.find((c) => c.path.endsWith('TODO.md'));
    expect(todoChange).toBeDefined();
    // normalizeTodayLiteral ran → "today" replaced with ISO date.
    expect(todoChange!.content).toContain('due:2026-05-03');
  });

  it('selecting normalizeTodayLiteral alone does not run unrelated rules', async () => {
    // rollover and alert are unrelated to normalizeTodayLiteral.
    // When only normalizeTodayLiteral is selected, the vault's completed tasks
    // should not have their done stamped by stampDone.
    const { changes } = await runAllRules({
      vaultPath: TEST_VAULT,
      today: TODAY,
      dryRun: true,
      env: {},
      selectedRuleNames: ['normalizeTodayLiteral'],
    });
    // Every change should be attributable to normalizeTodayLiteral:
    // no file should have had done stamped on a checked task (that
    // would be stampDone's doing).
    for (const change of changes) {
      expect(change.content).not.toMatch(/\[x\].*done:/);
    }
  });

  it('throws when an unknown rule name is passed to runAllRules', async () => {
    await expect(
      runAllRules({
        vaultPath: TEST_VAULT,
        today: TODAY,
        dryRun: true,
        env: {},
        selectedRuleNames: ['nonExistentRule'],
      }),
    ).rejects.toThrow('Unknown rule: "nonExistentRule"');
  });
});
