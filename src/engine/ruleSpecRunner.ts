import { join, relative } from 'node:path';
import { addDays, format } from 'date-fns';
import {
  parseMarkdown,
  stringifyMarkdown,
  extractTasks,
  updateTaskText,
  getInlineField,
  setInlineField,
} from '../markdown/index.js';
import { parseDateStr } from '../rules/scheduleUtils.js';
import { walkMarkdownFiles } from './io.js';
import type {
  Action,
  FileChange,
  GlobSource,
  PathSource,
  RuleContext,
  RuleSpec,
  Source,
  TaskPredicate,
} from '../rules/types.js';
import type { Task } from '../markdown/index.js';

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

/**
 * Minimal glob matcher that supports the patterns the engine needs:
 *   **\/*.ext  — any file with the given extension, anywhere in the tree
 *   *.ext      — files with the given extension in the root dir only
 *
 * Processes the pattern character-by-character to avoid ordering issues that
 * arise when chained string replacements modify tokens injected by earlier
 * replacement passes.
 */
function matchesGlob(relPath: string, pattern: string): boolean {
  // Normalize path separators so the function works on Windows too.
  const p = relPath.replace(/\\/g, '/');
  const pat = pattern.replace(/\\/g, '/');

  let regexStr = '';
  let i = 0;
  while (i < pat.length) {
    const ch = pat[i];
    if (ch === '*' && pat[i + 1] === '*' && pat[i + 2] === '/') {
      // **/ → any directory prefix (zero or more path segments)
      regexStr += '(?:.+/)?';
      i += 3;
    } else if (ch === '*') {
      regexStr += '[^/]*';
      i++;
    } else if (ch === '?') {
      regexStr += '[^/]';
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

async function resolveSource(vaultPath: string, source: GlobSource | PathSource): Promise<string[]> {
  if (source.type === 'path') {
    return [join(vaultPath, source.value)];
  }
  // glob
  const allFiles = await walkMarkdownFiles(vaultPath);
  return allFiles.filter((f) => matchesGlob(relative(vaultPath, f), source.pattern));
}

async function resolveSources(vaultPath: string, sources: Source[]): Promise<string[]> {
  const pathSets = await Promise.all(sources.map((s) => resolveSource(vaultPath, s)));
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
// Date helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Resolve date-relative literals to ISO date strings.
 * Handles "today", "yesterday" (today - 1 day), and "tomorrow" (today + 1 day).
 * Other values are passed through unchanged.
 */
function resolveToValue(value: string, today: Date): string {
  if (value === 'today') return formatDate(today);
  if (value === 'yesterday') return formatDate(addDays(today, -1));
  if (value === 'tomorrow') return formatDate(addDays(today, 1));
  return value;
}

// ---------------------------------------------------------------------------
// Predicate evaluation
// ---------------------------------------------------------------------------

function evaluatePredicate(task: Task, predicate: TaskPredicate, today: Date): boolean {
  switch (predicate.type) {
    case 'checked':
      return task.checked;
    case 'unchecked':
      return !task.checked;
    case 'fieldExists':
      return getInlineField(task.text, predicate.key) !== undefined;
    case 'fieldEquals':
      return getInlineField(task.text, predicate.key) === predicate.value;
    case 'fieldDateBefore': {
      const raw = getInlineField(task.text, predicate.key);
      if (!raw) return false;
      const fieldDate = parseDateStr(raw);
      const targetDate = parseDateStr(resolveToValue(predicate.date, today));
      if (!fieldDate || !targetDate) return false;
      return fieldDate < targetDate;
    }
    case 'fieldDateAfter': {
      const raw = getInlineField(task.text, predicate.key);
      if (!raw) return false;
      const fieldDate = parseDateStr(raw);
      const targetDate = parseDateStr(resolveToValue(predicate.date, today));
      if (!fieldDate || !targetDate) return false;
      return fieldDate > targetDate;
    }
    case 'and':
      return predicate.predicates.every((p) => evaluatePredicate(task, p, today));
    case 'or':
      return predicate.predicates.some((p) => evaluatePredicate(task, p, today));
    case 'not':
      return !evaluatePredicate(task, predicate.predicate, today);
  }
}

// ---------------------------------------------------------------------------
// Action application
// ---------------------------------------------------------------------------

function applyAction(taskText: string, action: Action, today: Date): string {
  switch (action.type) {
    case 'task.setFieldDateIfMissing': {
      if (getInlineField(taskText, action.key) !== undefined) return taskText;
      return setInlineField(taskText, action.key, resolveToValue(action.value, today));
    }
    case 'task.replaceFieldDateValue': {
      const existing = getInlineField(taskText, action.key);
      // `from` is compared as a raw literal (not resolved).
      if (existing === undefined || existing !== action.from) return taskText;
      return setInlineField(taskText, action.key, resolveToValue(action.to, today));
    }
  }
}

// ---------------------------------------------------------------------------
// Public runner
// ---------------------------------------------------------------------------

export async function runRuleSpec(
  spec: RuleSpec,
  ctx: RuleContext,
): Promise<{ changes: FileChange[]; summary: string }> {
  const { vaultPath, today } = ctx;
  const { query, actions } = spec;

  const filePaths = await resolveSources(vaultPath, spec.sources);

  for (const p of filePaths) {
    if (!p.endsWith('.md')) {
      throw new Error(`Engine only processes .md files; refusing to process: ${p}`);
    }
  }

  const changes: FileChange[] = [];
  let totalModified = 0;

  for (const filePath of filePaths) {
    let raw: string;
    try {
      raw = await ctx.readFile(filePath);
    } catch {
      continue;
    }
    if (!raw) continue;

    const tree = parseMarkdown(raw);
    const allTasks = extractTasks(tree);

    const selected =
      query.predicate
        ? allTasks.filter((t) => evaluatePredicate(t, query.predicate!, today))
        : allTasks;

    let modified = 0;
    for (const task of selected) {
      let newText = task.text;
      for (const action of actions) {
        newText = applyAction(newText, action, today);
      }
      if (newText !== task.text) {
        updateTaskText(tree, task.text, newText);
        modified++;
      }
    }

    if (modified > 0) {
      changes.push({ path: filePath, content: stringifyMarkdown(tree) });
      totalModified += modified;
    }
  }

  return {
    changes,
    summary: `Modified ${totalModified} task(s) across ${changes.length} file(s).`,
  };
}
