import { completedTaskRolloverRule } from './completedTaskRollover.js';
import { incompleteTaskAlertRule } from './incompleteTaskAlert.js';
import type { Rule } from './types.js';

export const rules: Rule[] = [
  completedTaskRolloverRule,
  incompleteTaskAlertRule,
];

export type { Rule, RuleContext, FileChange, RuleResult } from './types.js';
