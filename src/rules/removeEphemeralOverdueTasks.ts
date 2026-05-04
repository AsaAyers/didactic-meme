import type { RuleSpec } from "./types.js";

/**
 * Ephemeral task removal rule.
 *
 * Finds every **unchecked** task that carries an `ephemeral` field, has a
 * `due:` date, and whose due date is strictly before today (i.e. yesterday
 * or earlier).  Such tasks are removed from the file entirely — they were
 * not completed by their deadline and are no longer relevant.
 *
 * Safety rules:
 *   - Completed (checked) tasks are **never** removed, even if overdue.
 *   - Ephemeral tasks without a `due:` field are **not** removed.
 *   - Re-running after removal produces no further changes (idempotent).
 *
 * Predicate (all must be true):
 *   - task is unchecked
 *   - `ephemeral` field is present (any value)
 *   - `due` field is present
 *   - due < today  (strictly before today — due yesterday or earlier)
 */
export const removeEphemeralOverdueTasksSpec: RuleSpec = {
  name: "removeEphemeralOverdueTasks",
  dependencies: ["normalizeTodayLiteral"],
  sources: [{ type: "glob", pattern: "**/*.md" }],
  query: {
    type: "tasks",
    predicate: {
      type: "and",
      predicates: [
        { type: "unchecked" },
        { type: "fieldExists", key: "ephemeral" },
        { type: "fieldExists", key: "due" },
        { type: "fieldDateBefore", key: "due", date: "today" },
      ],
    },
  },
  actions: [{ type: "task.remove" }],
};
