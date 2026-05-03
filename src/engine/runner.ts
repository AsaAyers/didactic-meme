import { createPatch } from 'diff';
import { promises as fs } from 'node:fs';
import { relative } from 'node:path';
import { parseMarkdown, stringifyMarkdown } from '../markdown/parse.js';
import { ruleSpecs } from '../rules/index.js';
import { walkMarkdownFiles } from './io.js';
import { FileWriteManager } from './io.js';
import { runRuleSpec } from './ruleSpecRunner.js';
import type { RuleContext, RuleSpec } from '../rules/types.js';

/**
 * Sort `specs` so that every spec's dependencies appear before it in the
 * returned array.  Throws if a dependency name is unknown or if there is a
 * circular dependency.
 */
export function sortRuleSpecs(specs: RuleSpec[]): RuleSpec[] {
  const specMap = new Map(specs.map((s) => [s.name, s]));

  // Validate that every declared dependency actually exists in the set.
  for (const spec of specs) {
    for (const dep of spec.dependencies ?? []) {
      if (!specMap.has(dep)) {
        throw new Error(`RuleSpec "${spec.name}" depends on unknown spec "${dep}"`);
      }
    }
  }

  // Kahn's algorithm: build an adjacency list (dep → dependents) and an
  // in-degree counter, then process nodes with no remaining dependencies.
  const inDegree = new Map(specs.map((s) => [s.name, 0]));
  const adjList = new Map<string, string[]>(specs.map((s) => [s.name, []]));

  for (const spec of specs) {
    for (const dep of spec.dependencies ?? []) {
      adjList.get(dep)!.push(spec.name);
      inDegree.set(spec.name, (inDegree.get(spec.name) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name);
  }

  const sorted: RuleSpec[] = [];
  while (queue.length > 0) {
    // shift() (FIFO) keeps the original registration order for independent
    // specs, which is a useful stability property.  Spec lists are small, so
    // the O(n) cost is negligible.
    const name = queue.shift()!;
    sorted.push(specMap.get(name)!);
    for (const neighbor of adjList.get(name) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (sorted.length !== specs.length) {
    throw new Error('Circular dependency detected among RuleSpecs');
  }

  return sorted;
}

/**
 * Run all registered rules against the vault.
 *
 * A single FileWriteManager (transform queue) is shared across every rule:
 *   - Reads go through the queue so staged changes from earlier rules are
 *     immediately visible to later ones, even in dry-run mode.
 *   - Writes are queued throughout the run and flushed once at the end.
 *
 * Dry-run mode: no files are written; a unified diff is printed to stdout for
 * each file that would change, sorted by path.  Rule-progress logs and the run
 * summary are suppressed unless `verbose` is also true.
 *
 * @param baseCtx  All RuleContext fields except `readFile` (wired internally).
 * @returns        `changes` — staged file writes (path + content), sorted by path.
 *                 `report`  — everything printed to console during the run.
 */
export async function runAllRules(baseCtx: Omit<RuleContext, 'readFile'>): Promise<{
  changes: Array<{ path: string; content: string }>;
  report: string;
}> {
  const queue = new FileWriteManager();
  const ctx: RuleContext = { ...baseCtx, readFile: (p: string) => queue.read(p) };

  const verbose = ctx.verbose ?? false;

  const lines: string[] = [];

  /** Always emits: used for diff output and non-dry-run progress. */
  const log = (msg: string): void => {
    console.log(msg);
    lines.push(msg);
  };

  /**
   * Detail log: emitted only when verbose=true OR when not in dry-run mode.
   * Keeps "Running rule …" and summary noise out of plain dry-run output.
   */
  const logDetail = (msg: string): void => {
    if (verbose || !ctx.dryRun) log(msg);
  };

  const summaries: string[] = [];

  // Declarative RuleSpecs (e.g. normalization) run first, ordered by deps.
  for (const spec of sortRuleSpecs(ruleSpecs)) {
    logDetail(`Running rule spec: ${spec.name}`);
    try {
      const result = await runRuleSpec(spec, ctx);
      for (const change of result.changes) {
        queue.stage(change.path, change.content);
      }
      summaries.push(`  [${spec.name}] ${result.summary}`);
    } catch (err) {
      summaries.push(`  [${spec.name}] ERROR: ${(err as Error).message}`);
    }
  }

  // Flush everything once at the end.
  const written = await queue.commit(ctx.dryRun);

  // Sort by path for deterministic output.
  written.sort((a, b) => a.path.localeCompare(b.path));

  if (ctx.dryRun) {
    if (written.length > 0) {
      for (const change of written) {
        const relPath = relative(ctx.vaultPath, change.path);
        let original = '';
        try {
          original = await fs.readFile(change.path, 'utf-8');
        } catch {
          // new file — treat original as empty
        }
        log(createPatch(relPath, original, change.content));
      }
    } else {
      log('No changes.');
    }
    logDetail('\n=== Run Summary ===');
    for (const s of summaries) {
      logDetail(s);
    }
  } else {
    logDetail('\n=== Run Summary ===');
    for (const s of summaries) {
      logDetail(s);
    }
    if (written.length > 0) {
      logDetail('\nFiles written:');
      for (const { path: f } of written) {
        logDetail(`  ${f}`);
      }
    } else {
      logDetail('\nNo files written.');
    }
  }

  return { changes: written, report: lines.join('\n') };
}

/**
 * Normalization-only pass: read every `.md` file in the vault, round-trip it
 * through the parse → stringify pipeline, and write it back if the output
 * differs from the original.  No rule-driven transformations occur.
 *
 * This is intended to normalize formatting before starting rule-driven changes
 * so that subsequent diffs reflect only intentional semantic edits.
 *
 * Dry-run mode: no files are written; a unified diff is printed to stdout for
 * each file that would change.
 *
 * @returns `scanned` — total `.md` files found.
 *          `rewritten` — files whose content changed after the round-trip.
 *          `changes` — the (path, normalized content) pairs, sorted by path.
 *          `report` — everything printed to console during the pass.
 */
export async function runInitPass(
  vaultPath: string,
  dryRun: boolean,
): Promise<{
  scanned: number;
  rewritten: number;
  changes: Array<{ path: string; content: string }>;
  report: string;
}> {
  const lines: string[] = [];
  const log = (msg: string): void => {
    console.log(msg);
    lines.push(msg);
  };

  const allFiles = await walkMarkdownFiles(vaultPath);

  const changes: Array<{ path: string; content: string }> = [];

  for (const filePath of allFiles) {
    let original: string;
    try {
      original = await fs.readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    const normalized = stringifyMarkdown(parseMarkdown(original));
    if (normalized !== original) {
      changes.push({ path: filePath, content: normalized });
    }
  }

  // Sort by path for deterministic output.
  changes.sort((a, b) => a.path.localeCompare(b.path));

  if (dryRun) {
    if (changes.length > 0) {
      for (const change of changes) {
        const relPath = relative(vaultPath, change.path);
        let original = '';
        try {
          original = await fs.readFile(change.path, 'utf-8');
        } catch {
          // new file — treat original as empty
        }
        log(createPatch(relPath, original, change.content));
      }
    } else {
      log('No changes.');
    }
  } else {
    for (const change of changes) {
      await fs.writeFile(change.path, change.content, 'utf-8');
    }
  }

  log(`Init: scanned ${allFiles.length} file(s), ${dryRun ? 'would rewrite' : 'rewrote'} ${changes.length}.`);

  return {
    scanned: allFiles.length,
    rewritten: changes.length,
    changes,
    report: lines.join('\n'),
  };
}
