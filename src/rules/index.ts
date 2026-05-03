import { stampCompletionDateRule } from './stampCompletionDate.js';
import { completedTaskRolloverRule } from './completedTaskRollover.js';
import { incompleteTaskAlertRule } from './incompleteTaskAlert.js';
import { normalizeTodayLiteralSpec } from './normalizeTodayLiteral.js';
import type { Rule, RuleSpec } from './types.js';

/**
 * Declarative rule specs — interpreted by runRuleSpec in the engine.
 * Listed in execution order: normalization runs first so subsequent rules
 * always see resolved date values rather than the "today" keyword.
 */
export const ruleSpecs: RuleSpec[] = [normalizeTodayLiteralSpec];

/** Imperative rules (legacy model), run after all ruleSpecs are committed. */
export const rules: Rule[] = [
  stampCompletionDateRule,
  completedTaskRolloverRule,
  incompleteTaskAlertRule,
];
