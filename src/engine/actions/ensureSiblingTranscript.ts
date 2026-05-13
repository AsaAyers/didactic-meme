import type { MarkdownLink } from "../../markdown/links.js";
import type { EnsureSiblingTranscriptAction } from "../../rules/types.js";
import type { ActionOutcome } from "./types.js";

export function applyEnsureSiblingTranscript(
  taskText: string,
  _action: EnsureSiblingTranscriptAction,
  _link: MarkdownLink | undefined,
): ActionOutcome {
  void _action;
  void _link;
  // Implementation lives in plan 004's rule module.
  return { text: taskText };
}
