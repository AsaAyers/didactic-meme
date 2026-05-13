import type { CustomAction } from "../../rules/types.js";
import type { ActionOutcome } from "./types.js";

export function applyCustom(
  taskText: string,
  _action: CustomAction,
): ActionOutcome {
  void _action;
  // Side-effect action — no text transformation. Fired separately per-file
  // via CustomAction.run once all matched tasks are collected.
  return { text: taskText };
}
