import { addDays, differenceInCalendarDays } from "date-fns";
import {
  getInlineField,
  removeInlineField,
  setInlineField,
} from "../../markdown/inlineFields.js";
import { computeNextDue, parseDateStr, parseRepeat } from "../../rules/scheduleUtils.js";
import type { RolloverAction } from "../../rules/types.js";
import { formatDate } from "./dateHelpers.js";
import type { ActionOutcome } from "./types.js";

export function applyRollover(
  taskText: string,
  _action: RolloverAction,
  today: Date,
): ActionOutcome {
  // Create clone text: remove done: (not applicable on an active task).
  let cloneText = removeInlineField(taskText, "done");

  // Apply the repeat schedule to the clone's dates, leaving the original
  // task's dates untouched.
  const repeatStr = getInlineField(cloneText, "repeat");
  if (repeatStr) {
    const schedule = parseRepeat(repeatStr);
    if (schedule) {
      const doneStr = getInlineField(taskText, "done");
      const doneDate = doneStr ? (parseDateStr(doneStr) ?? today) : today;
      const newDue = computeNextDue(doneDate, schedule);
      const newDueStr = formatDate(newDue);

      const existingDueStr = getInlineField(cloneText, "due");
      const oldDue = existingDueStr
        ? (parseDateStr(existingDueStr) ?? doneDate)
        : doneDate;
      const delta = differenceInCalendarDays(newDue, oldDue);

      cloneText = setInlineField(cloneText, "due", newDueStr);

      const startStr = getInlineField(cloneText, "start");
      if (startStr) {
        const startDate = parseDateStr(startStr);
        if (startDate) {
          cloneText = setInlineField(
            cloneText,
            "start",
            formatDate(addDays(startDate, delta)),
          );
        }
      }

      const snoozeStr = getInlineField(cloneText, "snooze");
      if (snoozeStr) {
        const snoozeDate = parseDateStr(snoozeStr);
        if (snoozeDate) {
          cloneText = setInlineField(
            cloneText,
            "snooze",
            formatDate(addDays(snoozeDate, delta)),
          );
        }
      }
    }
  }

  // Mark the original task as copied and return the clone text for insertion.
  return {
    text: setInlineField(taskText, "copied", "1"),
    insertDuplicateAfter: cloneText,
  };
}
