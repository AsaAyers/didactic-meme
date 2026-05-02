import { runAllRules } from './engine/runner.js';
import type { RuleContext } from './rules/types.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

const vaultPath = process.env['VAULT_PATH'];
if (!vaultPath) {
  console.error('Error: VAULT_PATH environment variable is required.');
  process.exit(1);
}

const ctx: RuleContext = {
  vaultPath,
  today: new Date(),
  dryRun,
  env: process.env,
};

console.log(`Starting Markdown automation pipeline...`);
console.log(`Vault: ${vaultPath}`);
console.log(`Dry run: ${dryRun}`);
console.log('');

runAllRules(ctx).catch((err: unknown) => {
  console.error('Fatal error:', (err as Error).message);
  process.exit(1);
});
