import { rules, ruleSpecs } from '../rules/index.js';
import { FileWriteManager } from './io.js';
import { runRuleSpec } from './ruleSpecRunner.js';
import type { RuleContext } from '../rules/types.js';

export async function runAllRules(ctx: RuleContext): Promise<void> {
  const summaries: string[] = [];
  const allWritten: string[] = [];

  // Phase 1: Run declarative RuleSpecs (e.g. normalization) and commit their
  // changes immediately so that subsequent rules read the updated files.
  if (ruleSpecs.length > 0) {
    const normManager = new FileWriteManager();
    for (const spec of ruleSpecs) {
      console.log(`Running rule spec: ${spec.name}`);
      try {
        const result = await runRuleSpec(spec, ctx);
        for (const change of result.changes) {
          normManager.stage(change.path, change.content);
        }
        summaries.push(`  [${spec.name}] ${result.summary}`);
      } catch (err) {
        summaries.push(`  [${spec.name}] ERROR: ${(err as Error).message}`);
      }
    }
    const normWritten = await normManager.commit(ctx.dryRun);
    allWritten.push(...normWritten);
  }

  // Phase 2: Run imperative rules after normalization is on disk.
  const manager = new FileWriteManager();
  for (const rule of rules) {
    console.log(`Running rule: ${rule.name}`);
    try {
      const result = await rule.run(ctx);
      for (const change of result.changes) {
        manager.stage(change.path, change.content);
      }
      summaries.push(`  [${rule.name}] ${result.summary}`);
    } catch (err) {
      summaries.push(`  [${rule.name}] ERROR: ${(err as Error).message}`);
    }
  }
  const written = await manager.commit(ctx.dryRun);
  allWritten.push(...written);

  console.log('\n=== Run Summary ===');
  for (const s of summaries) {
    console.log(s);
  }
  if (allWritten.length > 0) {
    console.log('\nFiles written:');
    for (const f of allWritten) {
      console.log(`  ${f}`);
    }
  } else {
    console.log('\nNo files written.');
  }
}
