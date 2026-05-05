export const HELP_TEXT = `\
Usage:
  VAULT_PATH=<path> didactic-meme [--dry-run] [--verbose] [--only <glob>] (all | <rule> [<rule>...])
  VAULT_PATH=<path> didactic-meme --init [--dry-run]

Rules:
  all                      Run all registered rules in dependency order.
  <rule> [<rule>...]       Run only the named rule(s) and their transitive dependencies.

Available rules:
  normalizeTodayLiteral    Replace relative date literals (today/yesterday/tomorrow)
                           with resolved ISO dates in inline date fields.
  stampDone                Stamp done:<date> on checked tasks that lack one.
                           Depends on: normalizeTodayLiteral.
  completedTaskRollover    Advance due/start/snooze on repeating completed tasks and
                           uncheck them for the next cycle.
  incompleteTaskAlert      Write overdue/incomplete tasks to ALERT_FILE and optionally
                           POST to ALERT_URL.

Options:
  --dry-run                Print unified diffs to stdout; do not write any files.
  --verbose                Show rule-progress logs and the run summary (normally
                           suppressed in --dry-run mode).
  --only <glob>            Restrict all rules (including dependencies) to files
                           matching <glob> (relative to VAULT_PATH).  Rules still
                           run in full dependency order; only the set of files each
                           rule processes is narrowed to the overlap with <glob>.
  --init                   Normalize vault formatting and stamp done:unknown
                           on checked tasks that lack one.
                           Mutually exclusive with rule selection.
  --help, -h               Show this help message and exit.

Environment variables:
  VAULT_PATH               (required) Absolute path to the vault root.
  ALERT_URL                (optional) HTTP endpoint to POST alert content to.
  ALERT_TOKEN              (optional) Bearer token for ALERT_URL.

Examples:
  # Run every rule against the vault
  VAULT_PATH=/my/vault didactic-meme all

  # Dry-run every rule (shows diffs, writes nothing)
  VAULT_PATH=/my/vault didactic-meme --dry-run all

  # Run only stampDone (normalizeTodayLiteral runs first automatically
  # because it is a declared dependency of stampDone)
  VAULT_PATH=/my/vault didactic-meme --dry-run stampDone

  # Run all rules but only process files under notes/
  VAULT_PATH=/my/vault didactic-meme --dry-run --only "notes/**" all

  # Normalize formatting and stamp done on checked tasks
  VAULT_PATH=/my/vault didactic-meme --init --dry-run
`;
