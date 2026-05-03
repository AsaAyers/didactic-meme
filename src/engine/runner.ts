import { collectSpecs, ruleSpecs } from '../rules/index.js';
import { FileWriteManager } from './io.js';
import { runCollectSpec, runRuleSpec } from './ruleSpecRunner.js';
import type { RuleContext, RuleSpec } from '../rules/types.js';

function hasCustomAction(spec: RuleSpec): boolean {
  return spec.actions.some((a) => a.type === 'custom');
}

/**
 * Run all registered rules against the vault.
 *
 * A single FileWriteManager (transform queue) is shared across every rule:
 *   - Reads go through the queue so staged changes from earlier rules are
 *     immediately visible to later ones, even in dry-run mode.
 *   - Writes are queued throughout the run and flushed once at the end.
 *
 * @param baseCtx  All RuleContext fields except `readFile` (wired internally).
 * @returns        `changes` — the list of staged file writes (path + content).
 *                 `report`  — the full terminal output that was also printed to
 *                             console, suitable for snapshot testing.
 */
export async function runAllRules(baseCtx: Omit<RuleContext, 'readFile'>): Promise<{
  changes: Array<{ path: string; content: string }>;
  report: string;
}> {
  const queue = new FileWriteManager();
  const ctx: RuleContext = { ...baseCtx, readFile: (p: string) => queue.read(p) };

  const lines: string[] = [];
  /** Emit a line to both the console and the captured report. */
  const log = (msg: string): void => {
    console.log(msg);
    lines.push(msg);
  };

  const summaries: string[] = [];

  // Phase 1: RuleSpecs without CustomAction run first (task mutations + normalization).
  for (const spec of ruleSpecs.filter((s) => !hasCustomAction(s))) {
    log(`Running rule spec: ${spec.name}`);
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

  // Phase 2: CollectSpecs aggregate tasks into output files.
  for (const spec of collectSpecs) {
    log(`Running collect spec: ${spec.name}`);
    try {
      const result = await runCollectSpec(spec, ctx);
      for (const change of result.changes) {
        queue.stage(change.path, change.content);
      }
      summaries.push(`  [${spec.name}] ${result.summary}`);
    } catch (err) {
      summaries.push(`  [${spec.name}] ERROR: ${(err as Error).message}`);
    }
  }

  // Flush everything to disk before running CustomAction specs.
  const written = await queue.commit(ctx.dryRun, log);

  // Phase 3: RuleSpecs with CustomAction run after the flush so their
  // CustomAction.run(filePath) sees files already on disk. Skipped in dry-run
  // (runRuleSpec guards each CustomAction call with !ctx.dryRun).
  for (const spec of ruleSpecs.filter(hasCustomAction)) {
    log(`Running rule spec: ${spec.name}`);
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

  log('\n=== Run Summary ===');
  for (const s of summaries) {
    log(s);
  }
  if (written.length > 0) {
    log('\nFiles written:');
    for (const { path: f } of written) {
      log(`  ${f}`);
    }
  } else {
    log('\nNo files written.');
  }

  return { changes: written, report: lines.join('\n') };
}
