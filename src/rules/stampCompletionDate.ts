import type { RuleSpec } from './types.js';

export const stampCompletionDateSpec: RuleSpec = {
  name: 'stampCompletionDate',
  sources: [{ type: 'glob', pattern: '**/*.md' }],
  query: { type: 'tasks', predicate: { type: 'checked' } },
  actions: [{ type: 'task.setFieldDateIfMissing', key: 'completionDate', value: 'today' }],
};
