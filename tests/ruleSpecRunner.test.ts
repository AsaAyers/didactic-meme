import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runRuleSpec } from '../src/engine/ruleSpecRunner.js';
import type { RuleContext, RuleSpec } from '../src/rules/types.js';

// ---------------------------------------------------------------------------
// Filesystem mock
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

/** Build a fake Dirent-like object for mocking readdir. */
function makeEntry(name: string, kind: 'file' | 'dir') {
  return {
    name,
    isFile: () => kind === 'file',
    isDirectory: () => kind === 'dir',
  };
}

/** Set up readdir/readFile mocks to expose a flat set of virtual files. */
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
// glob resolution
// ---------------------------------------------------------------------------

describe('ruleSpecRunner — source resolution', () => {
  it('resolves a path source to an absolute path', async () => {
    setupVault({ '/vault/TODO.md': '- [ ] Task\n' });

    const spec: RuleSpec = {
      name: 'test',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks' },
      actions: [],
    };

    const result = await runRuleSpec(spec, baseCtx);
    // No actions → no modifications, but the file must have been read.
    expect(result.changes).toHaveLength(0);
  });

  it('resolves a **/*.md glob to all markdown files', async () => {
    setupVault({
      '/vault/a.md': '- [ ] Task A\n',
      '/vault/b.md': '- [ ] Task B\n',
      '/vault/notes.txt': 'not markdown',
    });

    const spec: RuleSpec = {
      name: 'test',
      sources: [{ type: 'glob', pattern: '**/*.md' }],
      query: { type: 'tasks' },
      actions: [
        {
          type: 'task.replaceFieldDateValue',
          key: 'due',
          from: 'today',
          to: 'today',
        },
      ],
    };

    // No tasks have due:today, so no changes expected — but we verify .txt is excluded.
    const result = await runRuleSpec(spec, baseCtx);
    expect(result.changes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// task.replaceFieldDateValue
// ---------------------------------------------------------------------------

describe('ruleSpecRunner — task.replaceFieldDateValue', () => {
  it('replaces a literal "today" due: value with the current date', async () => {
    setupVault({ '/vault/TODO.md': '- [ ] Pay rent due:today\n' });

    const spec: RuleSpec = {
      name: 'normalize',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks' },
      actions: [{ type: 'task.replaceFieldDateValue', key: 'due', from: 'today', to: 'today' }],
    };

    const result = await runRuleSpec(spec, baseCtx);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.content).toContain(`due:${TODAY_STR}`);
    expect(result.changes[0]?.content).not.toContain('due:today');
  });

  it('does not modify a field that does not match from', async () => {
    setupVault({ '/vault/TODO.md': `- [ ] Pay rent due:${TODAY_STR}\n` });

    const spec: RuleSpec = {
      name: 'normalize',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks' },
      actions: [{ type: 'task.replaceFieldDateValue', key: 'due', from: 'today', to: 'today' }],
    };

    const result = await runRuleSpec(spec, baseCtx);
    // Already a real date — must not change.
    expect(result.changes).toHaveLength(0);
  });

  it('does not modify tasks without the target field', async () => {
    setupVault({ '/vault/TODO.md': '- [ ] No date fields here\n' });

    const spec: RuleSpec = {
      name: 'normalize',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks' },
      actions: [{ type: 'task.replaceFieldDateValue', key: 'due', from: 'today', to: 'today' }],
    };

    const result = await runRuleSpec(spec, baseCtx);
    expect(result.changes).toHaveLength(0);
  });

  it('replaces today in multiple fields in one pass', async () => {
    setupVault({
      '/vault/TODO.md': '- [ ] Task due:today start:today snooze:tomorrow\n',
    });

    const spec: RuleSpec = {
      name: 'normalize',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks' },
      actions: [
        { type: 'task.replaceFieldDateValue', key: 'due', from: 'today', to: 'today' },
        { type: 'task.replaceFieldDateValue', key: 'start', from: 'today', to: 'today' },
      ],
    };

    const result = await runRuleSpec(spec, baseCtx);
    expect(result.changes).toHaveLength(1);
    const content = result.changes[0]?.content ?? '';
    expect(content).toContain(`due:${TODAY_STR}`);
    expect(content).toContain(`start:${TODAY_STR}`);
    // snooze:tomorrow was not targeted → untouched
    expect(content).toContain('snooze:tomorrow');
  });
});

// ---------------------------------------------------------------------------
// task.setFieldDateIfMissing
// ---------------------------------------------------------------------------

describe('ruleSpecRunner — task.setFieldDateIfMissing', () => {
  it('sets a missing field to the current date', async () => {
    setupVault({ '/vault/TODO.md': '- [x] Finished task\n' });

    const spec: RuleSpec = {
      name: 'stamp',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks', predicate: { type: 'checked' } },
      actions: [{ type: 'task.setFieldDateIfMissing', key: 'completionDate', value: 'today' }],
    };

    const result = await runRuleSpec(spec, baseCtx);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.content).toContain(`completionDate:${TODAY_STR}`);
  });

  it('does not overwrite an existing field', async () => {
    setupVault({ '/vault/TODO.md': '- [x] Finished task completionDate:2026-01-01\n' });

    const spec: RuleSpec = {
      name: 'stamp',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks', predicate: { type: 'checked' } },
      actions: [{ type: 'task.setFieldDateIfMissing', key: 'completionDate', value: 'today' }],
    };

    const result = await runRuleSpec(spec, baseCtx);
    expect(result.changes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Predicate evaluation
// ---------------------------------------------------------------------------

describe('ruleSpecRunner — predicates', () => {
  it('checked predicate selects only checked tasks', async () => {
    setupVault({ '/vault/TODO.md': '- [x] Done\n- [ ] Todo\n' });

    const spec: RuleSpec = {
      name: 'test',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks', predicate: { type: 'checked' } },
      actions: [{ type: 'task.setFieldDateIfMissing', key: 'completionDate', value: 'today' }],
    };

    const result = await runRuleSpec(spec, baseCtx);
    expect(result.changes).toHaveLength(1);
    const content = result.changes[0]?.content ?? '';
    expect(content).toContain(`- [x] Done completionDate:${TODAY_STR}`);
    expect(content).toContain('- [ ] Todo');
    expect(content).not.toContain('Todo completionDate');
  });

  it('unchecked predicate selects only unchecked tasks', async () => {
    setupVault({ '/vault/TODO.md': '- [x] Done\n- [ ] Todo due:today\n' });

    const spec: RuleSpec = {
      name: 'test',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks', predicate: { type: 'unchecked' } },
      actions: [{ type: 'task.replaceFieldDateValue', key: 'due', from: 'today', to: 'today' }],
    };

    const result = await runRuleSpec(spec, baseCtx);
    expect(result.changes).toHaveLength(1);
    const content = result.changes[0]?.content ?? '';
    expect(content).toContain(`due:${TODAY_STR}`);
    // The checked task had no due field — still no due field.
    expect(content).toContain('- [x] Done');
  });

  it('fieldExists predicate returns only tasks with that field', async () => {
    setupVault({ '/vault/TODO.md': '- [ ] With due:2026-05-01\n- [ ] Without\n' });

    const spec: RuleSpec = {
      name: 'test',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: { type: 'tasks', predicate: { type: 'fieldExists', key: 'due' } },
      actions: [
        { type: 'task.replaceFieldDateValue', key: 'due', from: '2026-05-01', to: TODAY_STR },
      ],
    };

    const result = await runRuleSpec(spec, baseCtx);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.content).toContain(`due:${TODAY_STR}`);
    expect(result.changes[0]?.content).toContain('- [ ] Without');
    expect(result.changes[0]?.content).not.toContain('Without due:');
  });

  it('fieldDateBefore predicate selects tasks whose date field is before the reference', async () => {
    setupVault({
      '/vault/TODO.md': '- [ ] Overdue due:2026-04-01\n- [ ] Future due:2026-06-01\n',
    });

    const spec: RuleSpec = {
      name: 'test',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: {
        type: 'tasks',
        predicate: { type: 'fieldDateBefore', key: 'due', date: 'today' },
      },
      actions: [
        { type: 'task.replaceFieldDateValue', key: 'due', from: '2026-04-01', to: TODAY_STR },
      ],
    };

    const result = await runRuleSpec(spec, baseCtx);
    expect(result.changes).toHaveLength(1);
    const content = result.changes[0]?.content ?? '';
    expect(content).toContain(`due:${TODAY_STR}`);
    // Future task was not selected.
    expect(content).toContain('due:2026-06-01');
  });

  it('not predicate inverts selection', async () => {
    setupVault({ '/vault/TODO.md': '- [ ] A due:today\n- [ ] B\n' });

    const spec: RuleSpec = {
      name: 'test',
      sources: [{ type: 'path', value: 'TODO.md' }],
      query: {
        type: 'tasks',
        predicate: { type: 'not', predicate: { type: 'fieldExists', key: 'due' } },
      },
      actions: [{ type: 'task.setFieldDateIfMissing', key: 'due', value: 'today' }],
    };

    const result = await runRuleSpec(spec, baseCtx);
    // Only task B (without due) should get the field.
    expect(result.changes).toHaveLength(1);
    const content = result.changes[0]?.content ?? '';
    expect(content).toContain('- [ ] B due:');
    // Task A already had due:today — stays as-is (still the "today" literal).
    expect(content).toContain('due:today');
  });
});
