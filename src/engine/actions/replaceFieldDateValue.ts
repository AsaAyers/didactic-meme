import {
  getInlineField,
  setInlineField,
} from "../../markdown/inlineFields.js";
import type { ReplaceFieldDateValueAction } from "../../rules/types.js";
import { resolveToValue } from "./dateHelpers.js";
import type { ActionOutcome } from "./types.js";

export function applyReplaceFieldDateValue(
  taskText: string,
  action: ReplaceFieldDateValueAction,
  today: Date,
): ActionOutcome {
  const existing = getInlineField(taskText, action.key);
  // `from` is compared as a raw literal (not resolved).
  if (existing === undefined || existing !== action.from)
    return { text: taskText };
  return {
    text: setInlineField(
      taskText,
      action.key,
      resolveToValue(action.to, today),
    ),
  };
}
