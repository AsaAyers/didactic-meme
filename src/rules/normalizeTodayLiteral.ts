import type { RuleSpec } from './types.js';

/** Inline date fields that may legally contain the literal "today". */
const DATE_KEYS = ['due', 'start', 'snooze', 'completionDate'] as const;

/**
 * Normalization rule: scan every Markdown file in the vault and replace the
 * literal string "today" in any inline date field with the actual date string
 * (YYYY-MM-DD) for ctx.today.
 *
 * This rule is registered first so that subsequent rules always see real
 * dates rather than the "today" keyword.
 *
 * Example transformation:
 *   `- [ ] Pay bills due:today`  →  `- [ ] Pay bills due:2026-05-03`
 */
export const normalizeTodayLiteralSpec: RuleSpec = {
  name: 'normalizeTodayLiteral',
  sources: [{ type: 'glob', pattern: '**/*.md' }],
  query: { type: 'tasks' },
  actions: DATE_KEYS.map((key) => ({
    type: 'task.replaceFieldDateValue' as const,
    key,
    from: 'today',
    to: 'today', // resolved to the actual date by the engine
  })),
};
