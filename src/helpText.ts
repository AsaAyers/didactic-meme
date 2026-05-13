export const HELP_TEXT = `\
Usage:
  VAULT_PATH=<path> didactic-meme [--dry-run] [--verbose] [--only <glob>] (all | <rule> [<rule>...])
  VAULT_PATH=<path> didactic-meme --watch [--dry-run] [--verbose] (all | <rule> [<rule>...])
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
  ensureAudioTranscripts   For embedded .m4a links, ensure sibling transcript
                           embeds/files and enqueue transcription jobs.
  incompleteTaskAlert      Write overdue/incomplete tasks and optionally POST
                           using rules.incompleteTaskAlert.alertUrl in config.

Options:
  --dry-run                Print unified diffs to stdout; do not write any files.
  --verbose                Show rule-progress logs and the run summary (normally
                           suppressed in --dry-run mode).
  --only <glob>            Restrict all rules (including dependencies) to files
                           matching <glob> (relative to VAULT_PATH).  Rules still
                           run in full dependency order; only the set of files each
                           rule processes is narrowed to the overlap with <glob>.
  --watch                  Watch vault markdown files for changes and automatically
                           run the selected rules on each changed file after a
                           debounce period (default 60 s).  Uses a native filesystem
                           watcher (no polling).  Not compatible with --init.
                           The debounce duration is configurable via the vault config:
                             { "watch": { "debounce": 5000 } }
  --init                   Normalize vault formatting and stamp done:unknown
                           on checked tasks that lack one.
                           Mutually exclusive with rule selection and --watch.
  --help, -h               Show this help message and exit.

Environment variables:
  VAULT_PATH               (required) Absolute path to the vault root.

Config:
  .didactic-meme.json      Configure rule sources under "rules".
                           For alerts, set:
                           {
                             "rules": {
                               "incompleteTaskAlert": {
                                 "alertUrl": "http://localhost:8080/alert",
                                 "alertToken": "<optional bearer token>"
                               }
                             }
                           }

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

  # Watch vault for changes and run all rules on each changed file
  VAULT_PATH=/my/vault didactic-meme --watch all

  # Watch with dry-run (show diffs on each change, write nothing)
  VAULT_PATH=/my/vault didactic-meme --watch --dry-run all

  # Normalize formatting and stamp done on checked tasks
  VAULT_PATH=/my/vault didactic-meme --init --dry-run
`;
