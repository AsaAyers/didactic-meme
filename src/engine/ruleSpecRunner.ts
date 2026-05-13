import { join, relative } from "node:path";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { parseMarkdown, stringifyMarkdown } from "../markdown/parse.js";
import { joinFrontmatter, splitFrontmatter } from "../markdown/frontmatter.js";
import type { SplitFrontmatterResult } from "../markdown/frontmatter.js";
import {
  extractTasks,
  insertTaskAfter,
  removeTask,
  setTaskChecked,
  updateTaskText,
} from "../markdown/tasks.js";
import type { Task } from "../markdown/tasks.js";
import {
  getInlineField,
  removeInlineField,
  setInlineField,
} from "../markdown/inlineFields.js";
import {
  parseDateStr,
  parseRepeat,
  computeNextDue,
} from "../rules/scheduleUtils.js";
import { extractMarkdownLinks, matchesLinkQuery } from "../markdown/links.js";
import { walkMarkdownFiles } from "./io.js";
import type {
  Action,
  FileChange,
  GlobSource,
  LinkActionResult,
  PathSource,
  RuleContext,
  RuleSpec,
  Source,
  TaskPredicate,
} from "../rules/types.js";

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

/**
 * Minimal glob matcher that supports the patterns the engine needs:
 *   **\/*.ext  — any file with the given extension, anywhere in the tree
 *   *.ext      — files with the given extension in the root dir only
 *   dir/**    — all files under dir/, at any depth
 *
 * Processes the pattern character-by-character to avoid ordering issues that
 * arise when chained string replacements modify tokens injected by earlier
 * replacement passes.
 */
function matchesGlob(relPath: string, pattern: string): boolean {
  // Normalize path separators so the function works on Windows too.
  const p = relPath.replace(/\\/g, "/");
  const pat = pattern.replace(/\\/g, "/");

  let regexStr = "";
  let i = 0;
  while (i < pat.length) {
    const ch = pat[i];
    if (ch === "*" && pat[i + 1] === "*" && pat[i + 2] === "/") {
      // **/ → any directory prefix (zero or more path segments)
      regexStr += "(?:.+/)?";
      i += 3;
    } else if (ch === "*" && pat[i + 1] === "*") {
      // ** at end of pattern or followed by a non-/ character → match any
      // sequence of characters, including path separators.
      regexStr += ".*";
      i += 2;
    } else if (ch === "*") {
      regexStr += "[^/]*";
      i++;
    } else if (ch === "?") {
      regexStr += "[^/]";
      i++;
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      // Escape regex metacharacters that are literal in globs.
      regexStr += `\\${ch}`;
      i++;
    } else {
      regexStr += ch;
      i++;
    }
  }
  return new RegExp(`^${regexStr}$`).test(p);
}

async function resolveSource(
  vaultPath: string,
  source: GlobSource | PathSource,
): Promise<string[]> {
  if (source.type === "path") {
    return [join(vaultPath, source.value)];
  }
  // glob
  const allFiles = await walkMarkdownFiles(vaultPath);
  const excluded = source.exclude ?? [];
  return allFiles.filter(
    (f) =>
      matchesGlob(relative(vaultPath, f), source.pattern) &&
      !excluded.some((ex) => matchesGlob(relative(vaultPath, f), ex)),
  );
}

async function resolveSources(
  vaultPath: string,
  sources: Source[],
): Promise<string[]> {
  const pathSets = await Promise.all(
    sources.map((s) => resolveSource(vaultPath, s)),
  );
  // Deduplicate while preserving order.
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of pathSets.flat()) {
    if (!seen.has(path)) {
      seen.add(path);
      result.push(path);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Shared file-processing helpers
// ---------------------------------------------------------------------------

/**
 * Apply glob source rules and the `onlyGlob` filter; return absolute file
 * paths that are safe to process (.md only).
 */
async function resolveEffectiveSourcePaths(
  spec: RuleSpec,
  vaultPath: string,
  onlyGlob?: string,
): Promise<string[]> {
  const filePaths = await resolveSources(vaultPath, spec.sources);

  const effectivePaths =
    onlyGlob !== undefined
      ? filePaths.filter((p) => matchesGlob(relative(vaultPath, p), onlyGlob))
      : filePaths;

  for (const p of effectivePaths) {
    if (!p.endsWith(".md")) {
      throw new Error(
        `Engine only processes .md files; refusing to process: ${p}`,
      );
    }
  }

  return effectivePaths;
}

/**
 * Read a file from the staged queue (or disk) and split it into frontmatter
 * and body. Returns `null` if the file cannot be read or is empty.
 */
async function loadMarkdownSourceFile(
  filePath: string,
  readFile: (path: string) => Promise<string>,
): Promise<{ raw: string; parts: SplitFrontmatterResult } | null> {
  let raw: string;
  try {
    raw = await readFile(filePath);
  } catch {
    return null;
  }
  if (!raw) return null;
  const parts = splitFrontmatter(raw);
  return { raw, parts };
}

/**
 * Produce a `FileChange` when `newContent` differs from `originalContent`;
 * return `null` when there is no change.
 */
function buildMarkdownFileChange(
  filePath: string,
  originalContent: string,
  newContent: string,
): FileChange | null {
  if (newContent === originalContent) return null;
  return { path: filePath, content: newContent };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * Resolve date-relative literals to ISO date strings.
 * Handles "today", "yesterday" (today - 1 day), and "tomorrow" (today + 1 day).
 * Other values are passed through unchanged.
 */
function resolveToValue(value: string, today: Date): string {
  if (value === "today") return formatDate(today);
  if (value === "yesterday") return formatDate(addDays(today, -1));
  if (value === "tomorrow") return formatDate(addDays(today, 1));
  return value;
}

// ---------------------------------------------------------------------------
// Predicate evaluation
// ---------------------------------------------------------------------------

function evaluatePredicate(
  task: Task,
  predicate: TaskPredicate,
  today: Date,
): boolean {
  switch (predicate.type) {
    case "checked":
      return task.checked;
    case "unchecked":
      return !task.checked;
    case "fieldExists":
      return getInlineField(task.text, predicate.key) !== undefined;
    case "fieldEquals":
      return getInlineField(task.text, predicate.key) === predicate.value;
    case "fieldDateBefore": {
      const raw = getInlineField(task.text, predicate.key);
      if (!raw) return false;
      const fieldDate = parseDateStr(raw);
      const targetDate = parseDateStr(resolveToValue(predicate.date, today));
      if (!fieldDate || !targetDate) return false;
      return fieldDate < targetDate;
    }
    case "fieldDateAfter": {
      const raw = getInlineField(task.text, predicate.key);
      if (!raw) return false;
      const fieldDate = parseDateStr(raw);
      const targetDate = parseDateStr(resolveToValue(predicate.date, today));
      if (!fieldDate || !targetDate) return false;
      return fieldDate > targetDate;
    }
    case "and":
      return predicate.predicates.every((p) =>
        evaluatePredicate(task, p, today),
      );
    case "or":
      return predicate.predicates.some((p) =>
        evaluatePredicate(task, p, today),
      );
    case "not":
      return !evaluatePredicate(task, predicate.predicate, today);
  }
}

// ---------------------------------------------------------------------------
// Action application
// ---------------------------------------------------------------------------

type ActionOutcome = {
  text: string;
  uncheck?: boolean;
  insertDuplicateAfter?: string;
  remove?: boolean;
};

function applyAction(
  taskText: string,
  action: Action,
  today: Date,
): ActionOutcome {
  switch (action.type) {
    case "task.setFieldDateIfMissing": {
      if (getInlineField(taskText, action.key) !== undefined)
        return { text: taskText };
      return {
        text: setInlineField(
          taskText,
          action.key,
          resolveToValue(action.value, today),
        ),
      };
    }
    case "task.replaceFieldDateValue": {
      const existing = getInlineField(taskText, action.key);
      // `from` is compared as a raw literal (not resolved).
      if (existing === undefined || existing !== action.from)
        return { text: taskText };
      return {
        text: setInlineField(
          taskText,
          action.key,
          resolveToValue(action.to, today),
        ),
      };
    }
    case "task.advanceRepeat": {
      const repeatStr = getInlineField(taskText, "repeat");
      const schedule = repeatStr ? parseRepeat(repeatStr) : null;
      if (!schedule) return { text: taskText };

      const completionDateStr = getInlineField(taskText, "done");
      const completionDate = completionDateStr
        ? (parseDateStr(completionDateStr) ?? today)
        : today;

      const newDue = computeNextDue(completionDate, schedule);
      const newDueStr = formatDate(newDue);

      const existingDueStr = getInlineField(taskText, "due");
      const oldDue = existingDueStr
        ? (parseDateStr(existingDueStr) ?? completionDate)
        : completionDate;
      const delta = differenceInCalendarDays(newDue, oldDue);

      let newText = setInlineField(taskText, "due", newDueStr);

      const startStr = getInlineField(taskText, "start");
      if (startStr) {
        const startDate = parseDateStr(startStr);
        if (startDate) {
          newText = setInlineField(
            newText,
            "start",
            formatDate(addDays(startDate, delta)),
          );
        }
      }

      const snoozeStr = getInlineField(taskText, "snooze");
      if (snoozeStr) {
        const snoozeDate = parseDateStr(snoozeStr);
        if (snoozeDate) {
          newText = setInlineField(
            newText,
            "snooze",
            formatDate(addDays(snoozeDate, delta)),
          );
        }
      }

      return { text: newText, uncheck: true };
    }
    case "task.rollover": {
      // Create clone text: remove done: (not applicable on an active task).
      let cloneText = removeInlineField(taskText, "done");

      // Apply the repeat schedule to the clone's dates, leaving the original
      // task's dates untouched.
      const repeatStr = getInlineField(cloneText, "repeat");
      if (repeatStr) {
        const schedule = parseRepeat(repeatStr);
        if (schedule) {
          const doneStr = getInlineField(taskText, "done");
          const doneDate = doneStr ? (parseDateStr(doneStr) ?? today) : today;
          const newDue = computeNextDue(doneDate, schedule);
          const newDueStr = formatDate(newDue);

          const existingDueStr = getInlineField(cloneText, "due");
          const oldDue = existingDueStr
            ? (parseDateStr(existingDueStr) ?? doneDate)
            : doneDate;
          const delta = differenceInCalendarDays(newDue, oldDue);

          cloneText = setInlineField(cloneText, "due", newDueStr);

          const startStr = getInlineField(cloneText, "start");
          if (startStr) {
            const startDate = parseDateStr(startStr);
            if (startDate) {
              cloneText = setInlineField(
                cloneText,
                "start",
                formatDate(addDays(startDate, delta)),
              );
            }
          }

          const snoozeStr = getInlineField(cloneText, "snooze");
          if (snoozeStr) {
            const snoozeDate = parseDateStr(snoozeStr);
            if (snoozeDate) {
              cloneText = setInlineField(
                cloneText,
                "snooze",
                formatDate(addDays(snoozeDate, delta)),
              );
            }
          }
        }
      }

      // Mark the original task as copied and return the clone text for insertion.
      return {
        text: setInlineField(taskText, "copied", "1"),
        insertDuplicateAfter: cloneText,
      };
    }
    case "custom":
      // Side-effect action — no text transformation. Fired separately per-file.
      return { text: taskText };
    case "task.remove":
      return { text: taskText, remove: true };
    case "link.ensureSiblingTranscript":
    case "link.requestTranscription":
      // Link actions are handled by applyLinkAction, not here.
      return { text: taskText };
  }
}

// ---------------------------------------------------------------------------
// Task branch
// ---------------------------------------------------------------------------

async function runTaskQuerySpec(
  spec: RuleSpec,
  filePaths: string[],
  ctx: RuleContext,
): Promise<{ changes: FileChange[]; summary: string }> {
  const { today } = ctx;
  const { query, actions } = spec;

  const changes: FileChange[] = [];
  let totalModified = 0;
  const allSelected: Task[] = [];

  for (const filePath of filePaths) {
    const loaded = await loadMarkdownSourceFile(filePath, ctx.readFile);
    if (!loaded) continue;
    const { raw, parts } = loaded;

    const tree = parseMarkdown(parts.body);
    const allTasks = extractTasks(tree, relative(ctx.vaultPath, filePath));

    const selected =
      query.type === "tasks" && query.predicate
        ? allTasks.filter((t) => evaluatePredicate(t, query.predicate!, today))
        : allTasks;

    let modified = 0;
    for (const task of selected) {
      let newText = task.text;
      let shouldUncheck = false;
      let insertDuplicateText: string | undefined;
      let shouldRemove = false;
      for (const action of actions) {
        const outcome = applyAction(newText, action, today);
        newText = outcome.text;
        if (outcome.uncheck) shouldUncheck = true;
        if (outcome.insertDuplicateAfter !== undefined)
          insertDuplicateText = outcome.insertDuplicateAfter;
        if (outcome.remove) shouldRemove = true;
      }
      if (shouldRemove) {
        removeTask(tree, task.text);
        modified++;
        continue;
      }
      const textChanged = newText !== task.text;
      if (textChanged) {
        updateTaskText(tree, task.text, newText);
      }
      if (shouldUncheck) {
        setTaskChecked(tree, newText, false);
      }
      if (insertDuplicateText !== undefined) {
        insertTaskAfter(tree, newText, insertDuplicateText, false);
      }
      if (textChanged || shouldUncheck || insertDuplicateText !== undefined) {
        modified++;
      }
    }

    if (modified > 0) {
      const newContent = joinFrontmatter(parts, stringifyMarkdown(tree));
      const change = buildMarkdownFileChange(filePath, raw, newContent);
      if (change) {
        changes.push(change);
        totalModified += modified;
      }
    }

    allSelected.push(...selected);
  }

  // Fire CustomAction side effects once with ALL matched tasks.
  if (allSelected.length > 0) {
    const logFn = ctx.log ?? console.log;
    for (const action of actions) {
      if (action.type === "custom") {
        await action.run({
          tasks: allSelected,
          dryRun: ctx.dryRun,
          config: ctx.config,
          readFile: ctx.readFile,
          log: logFn,
        });
      }
    }
  }

  return {
    changes,
    summary: `Modified ${totalModified} task(s) across ${changes.length} file(s).`,
  };
}

// ---------------------------------------------------------------------------
// Link branch
// ---------------------------------------------------------------------------

/**
 * Apply a single link action to a matched link and return the structured
 * result. Link actions return a `LinkActionResult` describing body mutations
 * and new files to create; the runner accumulates these results across all
 * matching links before committing changes.
 *
 * This dispatcher will grow as new link action types are added. Currently
 * recognises `link.ensureSiblingTranscript` and `link.requestTranscription`
 * (both are no-ops until the `ensureAudioTranscripts` rule is implemented in
 * plan 004 — they return empty results here so the framework compiles and the
 * existing tests stay green).
 */
function applyLinkAction(action: Action): LinkActionResult {
  switch (action.type) {
    case "link.ensureSiblingTranscript":
    case "link.requestTranscription":
      // Implementation lives in plan 004's rule module; stub returns empty
      // result so the engine can route LinkQuery specs without error.
      return {};
    default:
      // Task actions and custom actions are not applicable to the link branch.
      return {};
  }
}

async function runLinkQuerySpec(
  spec: RuleSpec,
  filePaths: string[],
  ctx: RuleContext,
): Promise<{
  changes: FileChange[];
  newFiles: Record<string, string>;
  summary: string;
}> {
  const { query, actions } = spec;

  if (query.type !== "link") {
    return { changes: [], newFiles: {}, summary: "0 link(s) matched." };
  }

  const changes: FileChange[] = [];
  const newFiles: Record<string, string> = {};
  let totalMatched = 0;

  for (const filePath of filePaths) {
    const loaded = await loadMarkdownSourceFile(filePath, ctx.readFile);
    if (!loaded) continue;
    const { raw, parts } = loaded;

    const links = extractMarkdownLinks(parts.body);
    const matchedLinks = links.filter((l) => matchesLinkQuery(l, query));
    if (matchedLinks.length === 0) continue;

    totalMatched += matchedLinks.length;

    // Accumulate body mutations and new files across all matching links and
    // all actions, so each action can see the body as updated by previous ones.
    let currentBody = parts.body;

    for (let i = 0; i < matchedLinks.length; i++) {
      for (const action of actions) {
        const result = applyLinkAction(action);
        if (result.updatedBody !== undefined) {
          currentBody = result.updatedBody;
        }
        if (result.newFiles) {
          Object.assign(newFiles, result.newFiles);
        }
      }
    }

    const newContent = joinFrontmatter(parts, currentBody);
    const change = buildMarkdownFileChange(filePath, raw, newContent);
    if (change) {
      changes.push(change);
    }
  }

  return {
    changes,
    newFiles,
    summary: `Processed ${totalMatched} link(s) across ${changes.length} file(s).`,
  };
}

// ---------------------------------------------------------------------------
// Public runner
// ---------------------------------------------------------------------------

export async function runRuleSpec(
  spec: RuleSpec,
  ctx: RuleContext,
): Promise<{ changes: FileChange[]; summary: string }> {
  const { vaultPath } = ctx;
  const { query } = spec;

  const filePaths = await resolveEffectiveSourcePaths(
    spec,
    vaultPath,
    ctx.onlyGlob,
  );

  if (query.type === "link") {
    const result = await runLinkQuerySpec(spec, filePaths, ctx);
    // Stage new files so they appear in dry-run diffs.
    const allChanges: FileChange[] = [
      ...result.changes,
      ...Object.entries(result.newFiles).map(([path, content]) => ({
        path,
        content,
      })),
    ];
    return { changes: allChanges, summary: result.summary };
  }

  // Default: task query
  return runTaskQuerySpec(spec, filePaths, ctx);
}
