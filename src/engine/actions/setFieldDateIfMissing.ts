import {
  getInlineField,
  setInlineField,
} from "../../markdown/inlineFields.js";
import type { SetFieldDateIfMissingAction } from "../../rules/types.js";
import { resolveToValue } from "./dateHelpers.js";
import type { ActionOutcome } from "./types.js";

export function applySetFieldDateIfMissing(
  taskText: string,
  action: SetFieldDateIfMissingAction,
  today: Date,
): ActionOutcome {
  if (getInlineField(taskText, action.key) !== undefined)
    return { text: taskText };
  return {
    text: setInlineField(
      taskText,
      action.key,
      resolveToValue(action.value, today),
    ),
  };
}
