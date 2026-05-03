import { join } from 'node:path';
import { readFile } from '../engine/io.js';
import { parseMarkdown, extractTasks } from '../markdown/index.js';
import type { Rule, RuleContext, RuleResult } from './types.js';

export const incompleteTaskAlertRule: Rule = {
  name: 'incompleteTaskAlert',
  async run(ctx: RuleContext): Promise<RuleResult> {
    const { vaultPath, env } = ctx;

    const todoPath = join(vaultPath, 'TODO.md');
    const alertPath = (env['ALERT_FILE'] as string | undefined) ?? join(vaultPath, 'tmp_alert.md');
    const alertUrl = env['ALERT_URL'] as string | undefined;
    const alertToken = env['ALERT_TOKEN'] as string | undefined;

    const todoRaw = await readFile(todoPath);
    if (!todoRaw) {
      return { changes: [], summary: 'TODO.md not found, nothing to do.' };
    }

    const todoTree = parseMarkdown(todoRaw);
    const tasks = extractTasks(todoTree);
    const incompleteTasks = tasks.filter((t) => !t.checked);

    const content = incompleteTasks.map((t) => `- [ ] ${t.text}`).join('\n') + '\n';

    if (alertUrl) {
      const headers: Record<string, string> = { 'Content-Type': 'text/markdown' };
      if (alertToken) {
        headers['Authorization'] = `Bearer ${alertToken}`;
      }
      await fetch(alertUrl, {
        method: 'POST',
        headers,
        body: content,
      });
    }

    return {
      changes: [{ path: alertPath, content }],
      summary: `Found ${incompleteTasks.length} incomplete task(s). Alert written to ${alertPath}.`,
    };
  },
};
