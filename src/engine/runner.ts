import { createPatch } from 'diff';
import { promises as fs } from 'node:fs';
import { relative } from 'node:path';
import { rules, ruleSpecs } from '../rules/index.js';
import { FileWriteManager } from './io.js';
import { runRuleSpec } from './ruleSpecRunner.js';
import type { RuleContext } from '../rules/types.js';

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

  // Declarative RuleSpecs (e.g. normalization) run first.
  for (const spec of ruleSpecs) {
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

  // Imperative rules run after; they read through the queue so they see
  // any normalization applied by the specs above.
  for (const rule of rules) {
    logDetail(`Running rule: ${rule.name}`);
    try {
      const result = await rule.run(ctx);
      for (const change of result.changes) {
        queue.stage(change.path, change.content);
      }
      summaries.push(`  [${rule.name}] ${result.summary}`);
    } catch (err) {
      summaries.push(`  [${rule.name}] ERROR: ${(err as Error).message}`);
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
