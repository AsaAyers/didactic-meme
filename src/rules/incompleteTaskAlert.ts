import type { CustomAction, RuleSpec } from './types.js';

const httpAlert: CustomAction = {
  type: 'custom',
  run: async ({ tasks, dryRun, log }) => {
    const alertUrl = process.env['ALERT_URL'];
    const content = tasks.map((t) => `- [${t.checked ? 'x' : ' '}] ${t.text}`).join('\n') + '\n';
    if (dryRun) {
      const destination = alertUrl ? `to ${alertUrl}` : '(no ALERT_URL configured)';
      log(`[dry-run] incompleteTaskAlert: would send alert ${destination}:\n${content}`);
      return;
    }
    if (!alertUrl) return;
    const alertToken = process.env['ALERT_TOKEN'];
    const headers: Record<string, string> = { 'Content-Type': 'text/markdown' };
    if (alertToken) headers['Authorization'] = `Bearer ${alertToken}`;
    await fetch(alertUrl, { method: 'POST', headers, body: content });
  },
};

export const incompleteTaskAlertSpec: RuleSpec = {
  name: 'incompleteTaskAlert',
  dependencies: ['completedTaskRollover'],
  sources: [{ type: 'glob', pattern: '**/*.md', exclude: ['archive/**', 'templates/**'] }],
  query: { type: 'tasks', predicate: { type: 'unchecked' } },
  actions: [httpAlert],
};
