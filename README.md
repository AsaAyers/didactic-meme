# didactic-meme

A TypeScript-based Markdown automation pipeline for processing task-based Markdown vaults.

## Features

- **Completed Task Rollover**: Moves completed tasks from `TODO.md` to a daily note. Recurring tasks (`#recurring`) are unchecked instead of removed.
- **Incomplete Task Alert**: Writes incomplete tasks to an alert file and optionally POSTs them to a webhook URL.

## Setup

```bash
npm install
npm run build
```

## Usage

```bash
VAULT_PATH=/path/to/vault node dist/index.js [--dry-run]
```

### Environment Variables

| Variable             | Default                      | Description                              |
|----------------------|------------------------------|------------------------------------------|
| `VAULT_PATH`         | *(required)*                 | Absolute path to the markdown vault      |
| `DAILY_NOTE_HEADING` | `Completed Tasks`            | Heading in daily note to append under    |
| `ALERT_FILE`         | `$VAULT_PATH/tmp_alert.md`   | Path for the incomplete task alert file  |
| `ALERT_URL`          | *(optional)*                 | HTTP endpoint to POST incomplete tasks   |
| `ALERT_TOKEN`        | *(optional)*                 | Bearer token for `ALERT_URL`             |

## Development

```bash
npm test          # run tests
npm run typecheck # type-check without building
npm run build     # compile TypeScript
```

## Project Structure

```
src/
├── index.ts           CLI entrypoint
├── markdown/          Markdown parse/stringify helpers
│   ├── parse.ts       unified+remark wrappers, gray-matter helpers
│   ├── tasks.ts       extract/toggle/remove task list items
│   └── headings.ts    append under heading blocks
├── engine/
│   ├── io.ts          file read/write helpers, FileWriteManager
│   └── runner.ts      rule runner with summary logging
└── rules/
    ├── types.ts       Rule/RuleContext/FileChange/RuleResult types
    ├── index.ts       central rule registry
    ├── completedTaskRollover.ts
    └── incompleteTaskAlert.ts
tests/
├── tasks.test.ts
└── headings.test.ts
```
