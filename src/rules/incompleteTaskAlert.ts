import type { CustomAction, RuleSpec } from './types.js';
import type { Task } from '../markdown/tasks.js';

const httpAlert: CustomAction = {
  type: 'custom',
  run: async (tasks: Task[]) => {
    const alertUrl = process.env['ALERT_URL'];
    if (!alertUrl) return;
    const content = tasks.map((t) => `- [${t.checked ? 'x' : ' '}] ${t.text}`).join('\n') + '\n';
    const alertToken = process.env['ALERT_TOKEN'];
    const headers: Record<string, string> = { 'Content-Type': 'text/markdown' };
    if (alertToken) headers['Authorization'] = `Bearer ${alertToken}`;
    await fetch(alertUrl, { method: 'POST', headers, body: content });
  },
};

export const incompleteTaskAlertSpec: RuleSpec = {
  name: 'incompleteTaskAlert',
  sources: [{ type: 'glob', pattern: '**/*.md' }],
  query: { type: 'tasks', predicate: { type: 'unchecked' } },
  actions: [httpAlert],
};
