import type { RemoveTaskAction } from "../../rules/types.js";
import type { ActionOutcome } from "./types.js";

export function applyRemoveTask(
  taskText: string,
  _action: RemoveTaskAction,
): ActionOutcome {
  void _action;
  return { text: taskText, remove: true };
}