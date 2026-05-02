import { join } from 'node:path';
import { readFile } from '../engine/io.js';
import {
  parseMarkdown,
  stringifyMarkdown,
  extractTasks,
  removeTask,
  setTaskChecked,
  appendUnderHeading,
} from '../markdown/index.js';
import type { Rule, RuleContext, RuleResult, FileChange } from './types.js';

function formatDate(date: Date): { year: string; dateStr: string } {
  const year = date.getFullYear().toString();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return { year, dateStr: `${year}-${month}-${day}` };
}

export const completedTaskRolloverRule: Rule = {
  name: 'completedTaskRollover',
  async run(ctx: RuleContext): Promise<RuleResult> {
    const { vaultPath, today, env } = ctx;
    const headingName = (env['DAILY_NOTE_HEADING'] as string | undefined) ?? 'Completed Tasks';
    const { year, dateStr } = formatDate(today);

    const todoPath = join(vaultPath, 'TODO.md');
    const dailyNotePath = join(vaultPath, year, `${dateStr}.md`);

    const todoRaw = await readFile(todoPath);
    if (!todoRaw) {
      return { changes: [], summary: 'TODO.md not found, nothing to do.' };
    }

    const todoTree = parseMarkdown(todoRaw);
    const tasks = extractTasks(todoTree);
    const completedTasks = tasks.filter((t) => t.checked);

    if (completedTasks.length === 0) {
      return { changes: [], summary: 'No completed tasks found.' };
    }

    const dailyNoteRaw = await readFile(dailyNotePath);
    const dailyTree = parseMarkdown(dailyNoteRaw);

    const appendedLines: string[] = [];

    for (const task of completedTasks) {
      if (task.tags.includes('recurring')) {
        setTaskChecked(todoTree, task.text, false);
      } else {
        removeTask(todoTree, task.text);
      }
      appendedLines.push(`- [x] ${task.text}`);
    }

    appendUnderHeading(dailyTree, headingName, appendedLines);

    const changes: FileChange[] = [
      { path: todoPath, content: stringifyMarkdown(todoTree) },
      { path: dailyNotePath, content: stringifyMarkdown(dailyTree) },
    ];

    return {
      changes,
      summary: `Rolled over ${completedTasks.length} completed task(s) to ${dateStr}.`,
    };
  },
};
