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
 * This means dry-run produces exactly the same logical pipeline as a normal
 * run; the only difference is that files are not written to disk.
 *
 * @param baseCtx  All RuleContext fields except `readFile` — the runner
 *                 creates the queue and wires readFile internally.
 * @returns        The full list of staged changes (path + final content).
 */
export async function runAllRules(
  baseCtx: Omit<RuleContext, 'readFile'>,
): Promise<Array<{ path: string; content: string }>> {
  const queue = new FileWriteManager();
  const ctx: RuleContext = { ...baseCtx, readFile: (p: string) => queue.read(p) };

  const summaries: string[] = [];

  // Declarative RuleSpecs (e.g. normalization) run first.
  for (const spec of ruleSpecs) {
    console.log(`Running rule spec: ${spec.name}`);
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
    console.log(`Running rule: ${rule.name}`);
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

  console.log('\n=== Run Summary ===');
  for (const s of summaries) {
    console.log(s);
  }
  if (written.length > 0) {
    console.log('\nFiles written:');
    for (const { path: f } of written) {
      console.log(`  ${f}`);
    }
  } else {
    console.log('\nNo files written.');
  }

  return written;
}
