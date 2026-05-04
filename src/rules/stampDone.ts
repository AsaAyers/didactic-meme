import type { RuleSpec } from './types.js';

export const stampDoneSpec: RuleSpec = {
  name: 'stampDone',
  dependencies: ['normalizeTodayLiteral'],
  sources: [{ type: 'glob', pattern: '**/*.md' }],
  query: { type: 'tasks', predicate: { type: 'checked' } },
  actions: [{ type: 'task.setFieldDateIfMissing', key: 'done', value: 'unknown' }],
};
