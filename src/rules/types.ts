export type RuleContext = {
  vaultPath: string;
  today: Date;
  dryRun: boolean;
  env: NodeJS.ProcessEnv;
  /**
   * Read a file through the shared transform queue.
   * Always use this instead of importing io.readFile directly so that staged
   * changes from earlier rules in the same run are visible to later ones.
   */
  readFile: (path: string) => Promise<string>;
};

export type FileChange = {
  path: string;
  content: string;
};

export type RuleResult = {
  changes: FileChange[];
  summary: string;
};

export type Rule = {
  name: string;
  run(ctx: RuleContext): Promise<RuleResult>;
};

// ---------------------------------------------------------------------------
// Declarative RuleSpec model
// ---------------------------------------------------------------------------

/** A glob-pattern source (relative to vaultPath). */
export type GlobSource = { type: 'glob'; pattern: string };
/** A concrete relative-path source. */
export type PathSource = { type: 'path'; value: string };
export type Source = GlobSource | PathSource;

// --- Predicates -------------------------------------------------------------

export type CheckedPredicate = { type: 'checked' };
export type UncheckedPredicate = { type: 'unchecked' };
export type FieldExistsPredicate = { type: 'fieldExists'; key: string };
export type FieldEqualsPredicate = { type: 'fieldEquals'; key: string; value: string };
/** date: ISO "YYYY-MM-DD" or the literal "today" (resolved at run time). */
export type FieldDateBeforePredicate = { type: 'fieldDateBefore'; key: string; date: string };
export type FieldDateAfterPredicate = { type: 'fieldDateAfter'; key: string; date: string };
export type AndPredicate = { type: 'and'; predicates: TaskPredicate[] };
export type OrPredicate = { type: 'or'; predicates: TaskPredicate[] };
export type NotPredicate = { type: 'not'; predicate: TaskPredicate };

export type TaskPredicate =
  | CheckedPredicate
  | UncheckedPredicate
  | FieldExistsPredicate
  | FieldEqualsPredicate
  | FieldDateBeforePredicate
  | FieldDateAfterPredicate
  | AndPredicate
  | OrPredicate
  | NotPredicate;

// --- Queries ----------------------------------------------------------------

/** Select GFM task-list items from the resolved sources. */
export type TaskQuery = {
  type: 'tasks';
  /** When omitted, all tasks are selected. */
  predicate?: TaskPredicate;
};

export type Query = TaskQuery;

// --- Actions ----------------------------------------------------------------

/**
 * Set a date field on the task only when the field is absent.
 * value: ISO date string or "today" (resolved to ctx.today at run time).
 */
export type SetFieldDateIfMissingAction = {
  type: 'task.setFieldDateIfMissing';
  key: string;
  value: string;
};

/**
 * Replace a date field value when it matches `from`.
 * from: raw literal to match in the file (e.g. "today").
 * to:   replacement — ISO date string or "today" (resolved at run time).
 */
export type ReplaceFieldDateValueAction = {
  type: 'task.replaceFieldDateValue';
  key: string;
  from: string;
  to: string;
};

/**
 * For a checked task with a `repeat:` field: compute the next due date from
 * the completion date and the repeat schedule, shift `start:` and `snooze:`
 * by the same delta, then uncheck the task to reschedule it.
 *
 * Falls back to `ctx.today` when the `completionDate:` field is absent.
 * No-op when the task has no valid `repeat:` field.
 */
export type AdvanceRepeatAction = { type: 'task.advanceRepeat' };

/**
 * Escape hatch for side effects that require the file to be on disk.
 * Called once per source file after the file queue has been flushed.
 * Skipped in dry-run mode.
 * The absolute path to the file is the only argument.
 */
export type CustomAction = {
  type: 'custom';
  run: (filePath: string) => Promise<void>;
};

export type Action = SetFieldDateIfMissingAction | ReplaceFieldDateValueAction | AdvanceRepeatAction | CustomAction;

// --- RuleSpec ---------------------------------------------------------------

/**
 * Declarative rule: the engine resolves sources, runs the query, then applies
 * each action to every selected task and writes changed files back.
 */
export type RuleSpec = {
  name: string;
  sources: Source[];
  query: Query;
  actions: Action[];
};

// --- CollectSpec ------------------------------------------------------------

/**
 * Collects the text of all tasks matching the optional predicate across all
 * source files and writes them as a GFM task list to a vault-relative path.
 */
export type CollectSpec = {
  name: string;
  sources: Source[];
  predicate?: TaskPredicate;
  outputFile: string;
};
