import { stampCompletionDateSpec } from './stampCompletionDate.js';
import { completedTaskRolloverSpec } from './completedTaskRollover.js';
import { incompleteTaskAlertSpec, httpAlertSpec } from './incompleteTaskAlert.js';
import { normalizeTodayLiteralSpec } from './normalizeTodayLiteral.js';
import type { CollectSpec, RuleSpec } from './types.js';

/**
 * Declarative rule specs — interpreted by runRuleSpec in the engine.
 * Listed in execution order: normalization runs first so subsequent rules
 * always see resolved date values rather than the "today" keyword.
 * Specs with CustomAction actions run in a post-flush phase automatically.
 */
export const ruleSpecs: RuleSpec[] = [
  normalizeTodayLiteralSpec,
  stampCompletionDateSpec,
  completedTaskRolloverSpec,
  httpAlertSpec,
];

/**
 * Collect specs: aggregate tasks across files into a single output file.
 * These run after task-mutation ruleSpecs and before any CustomAction specs.
 */
export const collectSpecs: CollectSpec[] = [incompleteTaskAlertSpec];
