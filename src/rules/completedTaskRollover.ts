import { addDays, differenceInCalendarDays } from 'date-fns';
import { parseMarkdown, stringifyMarkdown } from '../markdown/parse.js';
import { extractTasks, removeTask, setTaskChecked, updateTaskText } from '../markdown/tasks.js';
import { getInlineField, setInlineField } from '../markdown/inlineFields.js';
import {
  parseRepeat,
  computeNextDue,
  parseDateStr,
  formatDateStr,
} from './scheduleUtils.js';
import { walkMarkdownFiles } from '../engine/io.js';
import type { Rule, RuleContext, RuleResult, FileChange } from './types.js';

export const completedTaskRolloverRule: Rule = {
  name: 'completedTaskRollover',
  async run(ctx: RuleContext): Promise<RuleResult> {
    const { vaultPath, today } = ctx;
    const mdFiles = await walkMarkdownFiles(vaultPath);

    const changes: FileChange[] = [];
    let totalProcessed = 0;

    for (const filePath of mdFiles) {
      const raw = await ctx.readFile(filePath);
      if (!raw) continue;

      const tree = parseMarkdown(raw);
      const tasks = extractTasks(tree);
      const completedTasks = tasks.filter((t) => t.checked);

      if (completedTasks.length === 0) continue;

      for (const task of completedTasks) {
        const repeatStr = getInlineField(task.text, 'repeat');
        const schedule = repeatStr ? parseRepeat(repeatStr) : null;

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
          updateTaskText(tree, task.text, newText);
          setTaskChecked(tree, newText, false);
        } else {
          // No repeat schedule — remove the completed task in place.
          removeTask(tree, task.text);
        }
      }

      changes.push({ path: filePath, content: stringifyMarkdown(tree) });
      totalProcessed += completedTasks.length;
    }

    if (totalProcessed === 0) {
      return { changes: [], summary: 'No completed tasks found.' };
    }

    return {
      changes,
      summary: `Processed ${totalProcessed} completed task(s).`,
    };
  },
};
