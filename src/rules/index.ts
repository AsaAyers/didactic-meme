import { stampCompletionDateSpec } from './stampCompletionDate.js';
import { completedTaskRolloverSpec } from './completedTaskRollover.js';
import { incompleteTaskAlertSpec } from './incompleteTaskAlert.js';
import { normalizeTodayLiteralSpec } from './normalizeTodayLiteral.js';
import type { CollectSpec, RuleSpec } from './types.js';

/**
 * Declarative rule specs — interpreted by runRuleSpec in the engine.
 * Listed in execution order: normalization runs first so subsequent rules
 * always see resolved date values rather than the "today" keyword.
 */
export const ruleSpecs: RuleSpec[] = [
  normalizeTodayLiteralSpec,
  stampCompletionDateSpec,
  completedTaskRolloverSpec,
];

/**
 * Collect specs: aggregate tasks across files into a single output file.
 * The optional CustomAction on each spec runs after the file is flushed to disk.
 */
export const collectSpecs: CollectSpec[] = [incompleteTaskAlertSpec];
