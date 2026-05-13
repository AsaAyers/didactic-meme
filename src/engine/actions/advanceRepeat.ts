import { addDays, differenceInCalendarDays } from "date-fns";
import { getInlineField, setInlineField } from "../../markdown/inlineFields.js";
import {
  computeNextDue,
  parseDateStr,
  parseRepeat,
} from "../../rules/scheduleUtils.js";
import type { AdvanceRepeatAction } from "../../rules/types.js";
import { formatDate } from "./dateHelpers.js";
import type { ActionOutcome } from "./types.js";

export function applyAdvanceRepeat(
  taskText: string,
  _action: AdvanceRepeatAction,
  today: Date,
): ActionOutcome {
  const repeatStr = getInlineField(taskText, "repeat");
  const schedule = repeatStr ? parseRepeat(repeatStr) : null;
  if (!schedule) return { text: taskText };

  const completionDateStr = getInlineField(taskText, "done");
  const completionDate = completionDateStr
    ? (parseDateStr(completionDateStr) ?? today)
    : today;

  const newDue = computeNextDue(completionDate, schedule);
  const newDueStr = formatDate(newDue);

  const existingDueStr = getInlineField(taskText, "due");
  const oldDue = existingDueStr
    ? (parseDateStr(existingDueStr) ?? completionDate)
    : completionDate;
  const delta = differenceInCalendarDays(newDue, oldDue);

  let newText = setInlineField(taskText, "due", newDueStr);

  const startStr = getInlineField(taskText, "start");
  if (startStr) {
    const startDate = parseDateStr(startStr);
    if (startDate) {
      newText = setInlineField(
        newText,
        "start",
        formatDate(addDays(startDate, delta)),
      );
    }
  }

  const snoozeStr = getInlineField(taskText, "snooze");
  if (snoozeStr) {
    const snoozeDate = parseDateStr(snoozeStr);
    if (snoozeDate) {
      newText = setInlineField(
        newText,
        "snooze",
        formatDate(addDays(snoozeDate, delta)),
      );
    }
  }

  return { text: newText, uncheck: true };
}
