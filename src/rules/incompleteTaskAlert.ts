import { join } from 'node:path';
import { parseMarkdown, extractTasks } from '../markdown/index.js';
import { walkMarkdownFiles } from '../engine/io.js';
import type { Rule, RuleContext, RuleResult } from './types.js';

export const incompleteTaskAlertRule: Rule = {
  name: 'incompleteTaskAlert',
  async run(ctx: RuleContext): Promise<RuleResult> {
    const { vaultPath, env } = ctx;

    const alertPath = (env['ALERT_FILE'] as string | undefined) ?? join(vaultPath, 'tmp_alert.md');
    const alertUrl = env['ALERT_URL'] as string | undefined;
    const alertToken = env['ALERT_TOKEN'] as string | undefined;

    const mdFiles = await walkMarkdownFiles(vaultPath);
    const incompleteTasks: string[] = [];

    for (const filePath of mdFiles) {
      const raw = await ctx.readFile(filePath);
      if (!raw) continue;

      const tree = parseMarkdown(raw);
      const tasks = extractTasks(tree);
      for (const t of tasks) {
        if (!t.checked) incompleteTasks.push(t.text);
      }
    }

    const content = incompleteTasks.map((t) => `- [ ] ${t}`).join('\n') + '\n';

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
