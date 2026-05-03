import { parseMarkdown, stringifyMarkdown } from '../markdown/parse.js';
import { extractTasks, updateTaskText } from '../markdown/tasks.js';
import { getInlineField, setInlineField } from '../markdown/inlineFields.js';
import { walkMarkdownFiles } from '../engine/io.js';
import { formatDateStr } from './scheduleUtils.js';
import type { Rule, RuleContext, RuleResult, FileChange } from './types.js';

export const stampCompletionDateRule: Rule = {
  name: 'stampCompletionDate',
  async run(ctx: RuleContext): Promise<RuleResult> {
    const { vaultPath, today } = ctx;
    const todayStr = formatDateStr(today);
    const mdFiles = await walkMarkdownFiles(vaultPath);

    let stamped = 0;
    const changes: FileChange[] = [];

    for (const filePath of mdFiles) {
      const raw = await ctx.readFile(filePath);
      if (!raw) continue;

      const tree = parseMarkdown(raw);
      const tasks = extractTasks(tree);
      const completedTasks = tasks.filter((t) => t.checked);

      let fileStamped = 0;
      for (const task of completedTasks) {
        if (!getInlineField(task.text, 'completionDate')) {
          const newText = setInlineField(task.text, 'completionDate', todayStr);
          updateTaskText(tree, task.text, newText);
          fileStamped++;
        }
      }

      if (fileStamped > 0) {
        changes.push({ path: filePath, content: stringifyMarkdown(tree) });
        stamped += fileStamped;
      }
    }

    if (stamped === 0) {
      return { changes: [], summary: 'No tasks needed completion date stamping.' };
    }

    return {
      changes,
      summary: `Stamped completionDate:${todayStr} on ${stamped} completed task(s).`,
    };
  },
};
