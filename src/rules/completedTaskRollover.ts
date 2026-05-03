import type { RuleSpec } from './types.js';

export const completedTaskRolloverSpec: RuleSpec = {
  name: 'completedTaskRollover',
  dependencies: ['stampCompletionDate'],
  sources: [{ type: 'glob', pattern: '**/*.md' }],
  query: {
    type: 'tasks',
    predicate: {
      type: 'and',
      predicates: [
        { type: 'checked' },
        { type: 'fieldExists', key: 'repeat' },
      ],
    },
  },
  actions: [{ type: 'task.advanceRepeat' }],
};
