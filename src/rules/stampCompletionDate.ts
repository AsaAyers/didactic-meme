import { join } from 'node:path';
import { readFile } from '../engine/io.js';
import {
  parseMarkdown,
  stringifyMarkdown,
  extractTasks,
  updateTaskText,
  getInlineField,
  setInlineField,
} from '../markdown/index.js';
import { formatDateStr } from './scheduleUtils.js';
import type { Rule, RuleContext, RuleResult } from './types.js';

export const stampCompletionDateRule: Rule = {
  name: 'stampCompletionDate',
  async run(ctx: RuleContext): Promise<RuleResult> {
    const { vaultPath, today } = ctx;
    const todoPath = join(vaultPath, 'TODO.md');

    const todoRaw = await readFile(todoPath);
    if (!todoRaw) {
      return { changes: [], summary: 'TODO.md not found, nothing to do.' };
    }

    const todoTree = parseMarkdown(todoRaw);
    const tasks = extractTasks(todoTree);
    const completedTasks = tasks.filter((t) => t.checked);

    const todayStr = formatDateStr(today);
    let stamped = 0;

    for (const task of completedTasks) {
      if (!getInlineField(task.text, 'completionDate')) {
        const newText = setInlineField(task.text, 'completionDate', todayStr);
        updateTaskText(todoTree, task.text, newText);
        stamped++;
      }
    }

    if (stamped === 0) {
      return { changes: [], summary: 'No tasks needed completion date stamping.' };
    }

    return {
      changes: [{ path: todoPath, content: stringifyMarkdown(todoTree) }],
      summary: `Stamped completionDate:${todayStr} on ${stamped} completed task(s).`,
    };
  },
};
