import { join } from 'node:path';
import { addDays, differenceInCalendarDays } from 'date-fns';
import { parseMarkdown, stringifyMarkdown } from '../markdown/parse.js';
import { extractTasks, removeTask, setTaskChecked, updateTaskText } from '../markdown/tasks.js';
import { appendUnderHeading } from '../markdown/headings.js';
import { getInlineField, setInlineField } from '../markdown/inlineFields.js';
import {
  parseRepeat,
  computeNextDue,
  parseDateStr,
  formatDateStr,
} from './scheduleUtils.js';
import type { Rule, RuleContext, RuleResult, FileChange } from './types.js';

function formatDate(date: Date): { year: string; dateStr: string } {
  const dateStr = formatDateStr(date);
  const year = dateStr.slice(0, 4);
  return { year, dateStr };
}

export const completedTaskRolloverRule: Rule = {
  name: 'completedTaskRollover',
  async run(ctx: RuleContext): Promise<RuleResult> {
    const { vaultPath, today, env } = ctx;
    const headingName = (env['DAILY_NOTE_HEADING'] as string | undefined) ?? 'Completed Tasks';
    const { year, dateStr } = formatDate(today);

    const todoPath = join(vaultPath, 'TODO.md');
    const dailyNotePath = join(vaultPath, year, `${dateStr}.md`);

    const todoRaw = await ctx.readFile(todoPath);
    if (!todoRaw) {
      return { changes: [], summary: 'TODO.md not found, nothing to do.' };
    }

    const todoTree = parseMarkdown(todoRaw);
    const tasks = extractTasks(todoTree);
    const completedTasks = tasks.filter((t) => t.checked);

    if (completedTasks.length === 0) {
      return { changes: [], summary: 'No completed tasks found.' };
    }

    const dailyNoteRaw = await ctx.readFile(dailyNotePath);
    const dailyTree = parseMarkdown(dailyNoteRaw);

    const appendedLines: string[] = [];

    for (const task of completedTasks) {
      const repeatStr = getInlineField(task.text, 'repeat');
      const schedule = repeatStr ? parseRepeat(repeatStr) : null;

      // Log the original completed task text to the daily note.
      appendedLines.push(`- [x] ${task.text}`);

      if (schedule) {
        // Determine the effective completion date.
        // Rule 1 (stampCompletionDate) stamps this field; fall back to today if
        // the field is not yet visible in this read (rule 1's write is staged but
        // not yet committed to disk).
        const completionDateStr = getInlineField(task.text, 'completionDate');
        const completionDate = completionDateStr
          ? (parseDateStr(completionDateStr) ?? today)
          : today;

        // Compute the next due date.
        const newDue = computeNextDue(completionDate, schedule);
        const newDueStr = formatDateStr(newDue);

        // Determine oldDue for delta computation:
        // use the existing due: field if present, else fall back to completionDate.
        const existingDueStr = getInlineField(task.text, 'due');
        const oldDue = existingDueStr
          ? (parseDateStr(existingDueStr) ?? completionDate)
          : completionDate;

        const delta = differenceInCalendarDays(newDue, oldDue);

        // Build the updated task text with new due: field.
        let newText = setInlineField(task.text, 'due', newDueStr);

        // Shift start: if present.
        const startStr = getInlineField(task.text, 'start');
        if (startStr) {
          const startDate = parseDateStr(startStr);
          if (startDate) {
            newText = setInlineField(newText, 'start', formatDateStr(addDays(startDate, delta)));
          }
        }

        // Shift snooze: if present.
        const snoozeStr = getInlineField(task.text, 'snooze');
        if (snoozeStr) {
          const snoozeDate = parseDateStr(snoozeStr);
          if (snoozeDate) {
            newText = setInlineField(newText, 'snooze', formatDateStr(addDays(snoozeDate, delta)));
          }
        }

        // Apply the updated text, then uncheck the task.
        updateTaskText(todoTree, task.text, newText);
        setTaskChecked(todoTree, newText, false);
      } else {
        // No repeat schedule — remove the completed task from TODO.
        removeTask(todoTree, task.text);
      }
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
