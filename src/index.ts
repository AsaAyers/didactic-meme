import { runAllRules, runInitPass } from './engine/runner.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const init = args.includes('--init');

const vaultPath = process.env['VAULT_PATH'];
if (!vaultPath) {
  console.error('Error: VAULT_PATH environment variable is required.');
  process.exit(1);
}

console.log(`Starting Markdown automation pipeline...`);
console.log(`Vault: ${vaultPath}`);

if (init) {
  console.log(`Mode: init${dryRun ? ' (dry run)' : ''}`);
  console.log('');

  runInitPass(vaultPath, dryRun).catch((err: unknown) => {
    console.error('Fatal error:', (err as Error).message);
    process.exit(1);
  });
} else {
  if (dryRun) {
    console.log(`Dry run: true${verbose ? ' (verbose)' : ''}`);
  } else {
    console.log(`Dry run: false`);
  }
  console.log('');

  runAllRules({
    vaultPath,
    today: new Date(),
    dryRun,
    verbose,
    env: process.env,
  }).catch((err: unknown) => {
    console.error('Fatal error:', (err as Error).message);
    process.exit(1);
  });
}
