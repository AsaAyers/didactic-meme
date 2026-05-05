#!/usr/bin/env node
import { runAllRules, runInitPass } from "./engine/runner.js";
import { HELP_TEXT } from "./helpText.js";
import { ruleSpecs } from "./rules/index.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
const init = args.includes("--init");
const only = args.includes("--only");
const help = args.includes("--help") || args.includes("-h");

// Positional arguments: rule names or "all" (everything that doesn't start with '--')
const positional = args.filter((a) => !a.startsWith("-"));

if (help) {
  console.log(HELP_TEXT);
  process.exit(0);
}

const vaultPath = process.env["VAULT_PATH"];
if (!vaultPath) {
  console.error("Error: VAULT_PATH environment variable is required.");
  process.exit(1);
}

console.log(`Starting Markdown automation pipeline...`);
console.log(`Vault: ${vaultPath}`);

if (init) {
  console.log(`Mode: init${dryRun ? " (dry run)" : ""}`);
  console.log("");

  runInitPass(vaultPath, dryRun).catch((err: unknown) => {
    console.error("Fatal error:", (err as Error).message);
    process.exit(1);
  });
} else {
  // Rule selection is required: either "all" or one or more rule names.
  if (positional.length === 0) {
    console.error('Error: specify "all" or a list of rule names to run.');
    console.error("");
    console.error("Examples:");
    console.error("  didactic-meme all");
    console.error("  didactic-meme --dry-run stampDone");
    console.error("");
    console.error("Run with --help for full usage information.");
    process.exit(1);
  }

  const selectedRuleNames: string[] | "all" =
    positional.length === 1 && positional[0] === "all" ? "all" : positional;

  // Validate rule names upfront before starting the pipeline.
  if (selectedRuleNames !== "all") {
    const knownNames = new Set(ruleSpecs.map((s) => s.name));
    const unknown = selectedRuleNames.filter((n) => !knownNames.has(n));
    if (unknown.length > 0) {
      console.error(
        `Error: unknown rule name(s): ${unknown.map((n) => `"${n}"`).join(", ")}`,
      );
      console.error(
        `Available rules: ${ruleSpecs.map((s) => s.name).join(", ")}`,
      );
      process.exit(1);
    }
  }

  if (dryRun) {
    console.log(`Dry run: true${verbose ? " (verbose)" : ""}`);
  } else {
    console.log(`Dry run: false`);
  }
  console.log("");

  runAllRules({
    vaultPath,
    today: new Date(),
    dryRun,
    verbose,
    env: process.env,
    selectedRuleNames,
    skipDependencies: only,
  }).catch((err: unknown) => {
    console.error("Fatal error:", (err as Error).message);
    process.exit(1);
  });
}
