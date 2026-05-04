import type { RuleSpec } from './types.js';

/**
 * Completed-task rollover rule.
 *
 * Finds every **recurring** checked task that was completed **today** (i.e.
 * its `done:` field equals today's date, as stamped by `stampDone`) and that
 * has not yet been processed (no `copied:1` marker).  For each such task the
 * rule:
 *
 *   1. Appends `copied:1` to the completed task so it is not re-processed on
 *      subsequent pipeline runs (idempotency marker).
 *   2. Inserts a fresh incomplete copy of the task directly after it, with the
 *      clone's date fields (due, start, snooze) advanced according to the
 *      `repeat:` schedule.  The `done:` field is not included on the clone.
 *
 * Tasks without a `repeat:` field are **never** duplicated and never receive
 * `copied:1`, regardless of their `done:` date.
 *
 * Depends on `stampDone` so that freshly completed tasks (newly checked since
 * the last run) already carry a real `done:YYYY-MM-DD` stamp when this rule
 * evaluates them.
 *
 * Predicate (all must be true):
 *   - task is checked
 *   - `repeat` field is present
 *   - done < tomorrow  (i.e. done ≤ today)
 *   - done ≥ today     (expressed as NOT done < today)
 *   - `copied` field is absent
 */
export const completedTaskRolloverSpec: RuleSpec = {
  name: 'completedTaskRollover',
  dependencies: ['stampDone'],
  sources: [{ type: 'glob', pattern: '**/*.md' }],
  query: {
    type: 'tasks',
    predicate: {
      type: 'and',
      predicates: [
        { type: 'checked' },
        // Only recurring tasks are rolled over
        { type: 'fieldExists', key: 'repeat' },
        // done <= today: done is strictly before tomorrow
        { type: 'fieldDateBefore', key: 'done', date: 'tomorrow' },
        // done >= today: done is NOT strictly before today
        { type: 'not', predicate: { type: 'fieldDateBefore', key: 'done', date: 'today' } },
        // Not yet rolled over (idempotency guard)
        { type: 'not', predicate: { type: 'fieldExists', key: 'copied' } },
      ],
    },
  },
  actions: [{ type: 'task.rollover' }],
};
