/**
 * Tests for incompleteTaskAlert dry-run behaviour.
 *
 * Verifies that running incompleteTaskAlert in dry-run mode prints an alert
 * preview even when no markdown files are modified.  The preview must appear
 * in the returned `report` string regardless of whether ALERT_URL is set.
 */
import { describe, it, expect } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAllRules } from '../src/engine/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS = join(__dirname, 'test_vault', 'scenarios');

// Pin the date so tests are deterministic.
const TODAY = new Date(2026, 4, 3); // 2026-05-03

describe('incompleteTaskAlert — dry-run preview', () => {
  it('prints the alert preview in the report even when no files change', async () => {
    // scenarios/incomplete-alert/tasks.md contains two unchecked tasks with no
    // relative-date literals, so normalizeTodayLiteral / stampDone /
    // completedTaskRollover are all no-ops and no file changes are staged.
    const { changes, report } = await runAllRules({
      vaultPath: join(SCENARIOS, 'incomplete-alert'),
      today: TODAY,
      dryRun: true,
      env: {},
      selectedRuleNames: ['incompleteTaskAlert'],
    });

    // No file changes: the vault has no "today" literals, no checked tasks,
    // and no tasks with a repeat schedule.
    expect(changes).toHaveLength(0);

    // The alert preview must still appear in the report.
    expect(report).toContain('[dry-run]');
    expect(report).toContain('incompleteTaskAlert');
    expect(report).toContain('Buy groceries');
    expect(report).toContain('Do laundry');
  });

  it('labels the destination as "(no ALERT_URL configured)" when env var is absent', async () => {
    // Ensure ALERT_URL is not set for this test.
    const savedUrl = process.env['ALERT_URL'];
    delete process.env['ALERT_URL'];

    try {
      const { report } = await runAllRules({
        vaultPath: join(SCENARIOS, 'incomplete-alert'),
        today: TODAY,
        dryRun: true,
        env: {},
        selectedRuleNames: ['incompleteTaskAlert'],
      });

      expect(report).toContain('no ALERT_URL configured');
    } finally {
      if (savedUrl !== undefined) process.env['ALERT_URL'] = savedUrl;
    }
  });

  it('labels the destination with the URL when ALERT_URL is set', async () => {
    const savedUrl = process.env['ALERT_URL'];
    process.env['ALERT_URL'] = 'https://example.com/hook';

    try {
      const { report } = await runAllRules({
        vaultPath: join(SCENARIOS, 'incomplete-alert'),
        today: TODAY,
        dryRun: true,
        env: {},
        selectedRuleNames: ['incompleteTaskAlert'],
      });

      expect(report).toContain('https://example.com/hook');
    } finally {
      if (savedUrl !== undefined) {
        process.env['ALERT_URL'] = savedUrl;
      } else {
        delete process.env['ALERT_URL'];
      }
    }
  });
});
