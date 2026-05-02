import { rules } from '../rules/index.js';
import { FileWriteManager } from './io.js';
import type { RuleContext } from '../rules/types.js';

export async function runAllRules(ctx: RuleContext): Promise<void> {
  const manager = new FileWriteManager();
  const summaries: string[] = [];

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

  console.log('\n=== Run Summary ===');
  for (const s of summaries) {
    console.log(s);
  }
  if (written.length > 0) {
    console.log('\nFiles written:');
    for (const f of written) {
      console.log(`  ${f}`);
    }
  } else {
    console.log('\nNo files written.');
  }
}
