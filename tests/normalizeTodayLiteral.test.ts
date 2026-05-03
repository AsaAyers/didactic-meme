import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runRuleSpec } from '../src/engine/ruleSpecRunner.js';
import { normalizeTodayLiteralSpec } from '../src/rules/normalizeTodayLiteral.js';
import type { RuleContext } from '../src/rules/types.js';

// ---------------------------------------------------------------------------
// Filesystem mock (same pattern as ruleSpecRunner.test.ts)
// ---------------------------------------------------------------------------

vi.mock('node:fs', () => {
  const readdirMock = vi.fn(async (_dir: string, _opts?: unknown) => []);
  const readFileMock = vi.fn(async (_path: string, _enc?: string) => '');
  return {
    promises: {
      readdir: readdirMock,
      readFile: readFileMock,
    },
  };
});

import { promises as fs } from 'node:fs';
const mockReaddir = fs.readdir as ReturnType<typeof vi.fn>;
const mockReadFile = fs.readFile as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TODAY = new Date(2026, 4, 3); // 2026-05-03
const TODAY_STR = '2026-05-03';

const baseCtx: RuleContext = {
  vaultPath: '/vault',
  today: TODAY,
  dryRun: false,
  env: {},
};

function makeEntry(name: string, kind: 'file' | 'dir') {
  return {
    name,
    isFile: () => kind === 'file',
    isDirectory: () => kind === 'dir',
  };
}

function setupVault(files: Record<string, string>): void {
  mockReaddir.mockImplementation(async (dir: string) => {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    return Object.keys(files)
      .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .map((p) => makeEntry(p.slice(prefix.length), 'file'));
  });
  mockReadFile.mockImplementation(async (path: string) => files[path] ?? '');
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// normalizeTodayLiteral spec
// ---------------------------------------------------------------------------

describe('normalizeTodayLiteral — spec metadata', () => {
  it('is named normalizeTodayLiteral', () => {
    expect(normalizeTodayLiteralSpec.name).toBe('normalizeTodayLiteral');
  });

  it('sources the whole vault via **/*.md glob', () => {
    expect(normalizeTodayLiteralSpec.sources).toEqual([
      { type: 'glob', pattern: '**/*.md' },
    ]);
  });

  it('covers due, start, snooze, and completionDate fields', () => {
    const keys = normalizeTodayLiteralSpec.actions.map((a) => a.key);
    expect(keys).toContain('due');
    expect(keys).toContain('start');
    expect(keys).toContain('snooze');
    expect(keys).toContain('completionDate');
  });
});

describe('normalizeTodayLiteral — today replacement', () => {
  it('replaces due:today with the current date', async () => {
    setupVault({ '/vault/TODO.md': '- [ ] Pay rent due:today\n' });

    const result = await runRuleSpec(normalizeTodayLiteralSpec, baseCtx);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.content).toContain(`due:${TODAY_STR}`);
    expect(result.changes[0]?.content).not.toContain('due:today');
  });

  it('replaces start:today with the current date', async () => {
    setupVault({ '/vault/TODO.md': '- [ ] Task start:today\n' });

    const result = await runRuleSpec(normalizeTodayLiteralSpec, baseCtx);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.content).toContain(`start:${TODAY_STR}`);
  });

  it('replaces snooze:today with the current date', async () => {
    setupVault({ '/vault/TODO.md': '- [ ] Task snooze:today\n' });

    const result = await runRuleSpec(normalizeTodayLiteralSpec, baseCtx);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.content).toContain(`snooze:${TODAY_STR}`);
  });

  it('replaces completionDate:today with the current date', async () => {
    setupVault({ '/vault/TODO.md': '- [x] Done completionDate:today\n' });

    const result = await runRuleSpec(normalizeTodayLiteralSpec, baseCtx);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.content).toContain(`completionDate:${TODAY_STR}`);
  });

  it('replaces today in multiple fields within one task', async () => {
    setupVault({
      '/vault/TODO.md': '- [ ] Task due:today start:today snooze:today\n',
    });

    const result = await runRuleSpec(normalizeTodayLiteralSpec, baseCtx);

    expect(result.changes).toHaveLength(1);
    const content = result.changes[0]?.content ?? '';
    expect(content).toContain(`due:${TODAY_STR}`);
    expect(content).toContain(`start:${TODAY_STR}`);
    expect(content).toContain(`snooze:${TODAY_STR}`);
  });

  it('leaves already-resolved dates untouched', async () => {
    setupVault({
      '/vault/TODO.md': `- [ ] Task due:${TODAY_STR}\n`,
    });

    const result = await runRuleSpec(normalizeTodayLiteralSpec, baseCtx);
    // No changes: the date is already a real ISO string.
    expect(result.changes).toHaveLength(0);
  });

  it('processes multiple files in the vault', async () => {
    setupVault({
      '/vault/A.md': '- [ ] Task A due:today\n',
      '/vault/B.md': '- [ ] Task B due:today\n',
    });

    const result = await runRuleSpec(normalizeTodayLiteralSpec, baseCtx);

    expect(result.changes).toHaveLength(2);
    for (const change of result.changes) {
      expect(change.content).toContain(`due:${TODAY_STR}`);
    }
  });

  it('skips non-markdown files (resolves only *.md)', async () => {
    setupVault({
      '/vault/TODO.md': '- [ ] Task due:today\n',
      '/vault/notes.txt': 'due:today should not be touched',
    });

    const result = await runRuleSpec(normalizeTodayLiteralSpec, baseCtx);

    // Only the markdown file should appear in changes.
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.path).toContain('.md');
  });
});
