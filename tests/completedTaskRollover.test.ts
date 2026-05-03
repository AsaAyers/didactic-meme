import { describe, it, expect, vi, beforeEach } from 'vitest';
import { completedTaskRolloverRule } from '../src/rules/completedTaskRollover.js';

vi.mock('../src/engine/io.js', () => ({
  walkMarkdownFiles: vi.fn(),
}));

import { walkMarkdownFiles } from '../src/engine/io.js';

// 2026-05-03 is a Sunday.
const TODAY = new Date(2026, 4, 3);
const TODAY_STR = '2026-05-03';

let mockReadFile = vi.fn<[string], Promise<string>>();

const baseCtx = {
  vaultPath: '/vault',
  today: TODAY,
  dryRun: false,
  env: {},
  readFile: (path: string) => mockReadFile(path),
};

beforeEach(() => {
  mockReadFile = vi.fn<[string], Promise<string>>();
  vi.mocked(walkMarkdownFiles).mockResolvedValue(['/vault/tasks.md']);
});

// Helper: given changes, find the content for a path suffix.
function getContent(changes: Array<{ path: string; content: string }>, suffix: string): string {
  const change = changes.find((c) => c.path.endsWith(suffix));
  if (!change) throw new Error(`No change found for path suffix: ${suffix}`);
  return change.content;
}

describe('completedTaskRollover — basic rollover (no repeat)', () => {
  it('removes a non-repeating completed task from the source file and logs it to daily note', async () => {
    const tasksMd = `- [x] Deploy to production\n- [ ] Write tests\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path === '/vault/tasks.md') return Promise.resolve(tasksMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);

    const tasksContent = getContent(result.changes, 'tasks.md');
    const dailyContent = getContent(result.changes, `${TODAY_STR}.md`);

    expect(tasksContent).not.toContain('Deploy to production');
    expect(tasksContent).toContain('Write tests');
    expect(dailyContent).toContain('- [x] Deploy to production');
  });

  it('does NOT treat a #recurring tag as special — removes the task', async () => {
    const tasksMd = `- [x] Weekly standup #recurring\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path === '/vault/tasks.md') return Promise.resolve(tasksMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);

    const tasksContent = getContent(result.changes, 'tasks.md');
    expect(tasksContent).not.toContain('Weekly standup');
  });
});

describe('completedTaskRollover — repeat scheduling', () => {
  it('unchecks and advances due: for a task with repeat: (no existing due)', async () => {
    const tasksMd = `- [x] Water plants repeat:s completionDate:${TODAY_STR}\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path === '/vault/tasks.md') return Promise.resolve(tasksMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);
    const tasksContent = getContent(result.changes, 'tasks.md');

    expect(tasksContent).toContain('Water plants');
    expect(tasksContent).toContain('- [ ]');
    expect(tasksContent).toContain('due:2026-05-10');
  });

  it('uses today as fallback when completionDate field is missing', async () => {
    const tasksMd = `- [x] Water plants repeat:s\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path === '/vault/tasks.md') return Promise.resolve(tasksMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);
    const tasksContent = getContent(result.changes, 'tasks.md');

    expect(tasksContent).toContain('due:2026-05-10');
    expect(tasksContent).toContain('- [ ]');
  });

  it('skipWeeks=1 on Sunday: next due is +14 days (2026-05-17)', async () => {
    const tasksMd = `- [x] Task repeat:1s completionDate:${TODAY_STR}\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path === '/vault/tasks.md') return Promise.resolve(tasksMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);
    const tasksContent = getContent(result.changes, 'tasks.md');

    expect(tasksContent).toContain('due:2026-05-17');
  });

  it('overwrites an existing due: when task repeats', async () => {
    const tasksMd = `- [x] Task due:${TODAY_STR} repeat:s completionDate:${TODAY_STR}\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path === '/vault/tasks.md') return Promise.resolve(tasksMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);
    const tasksContent = getContent(result.changes, 'tasks.md');

    expect(tasksContent).toContain('due:2026-05-10');
    expect(tasksContent).not.toContain(`due:${TODAY_STR}`);
  });
});

describe('completedTaskRollover — start/snooze shifting', () => {
  it('shifts start: forward by the same delta as due moved', async () => {
    const tasksMd = `- [x] Task start:2026-04-28 repeat:a completionDate:${TODAY_STR}\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path === '/vault/tasks.md') return Promise.resolve(tasksMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);
    const tasksContent = getContent(result.changes, 'tasks.md');

    expect(tasksContent).toContain('due:2026-05-09');
    expect(tasksContent).toContain('start:2026-05-04');
  });

  it('shifts snooze: forward by the same delta as due moved', async () => {
    const tasksMd = `- [x] Task snooze:2026-04-30 repeat:a completionDate:${TODAY_STR}\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path === '/vault/tasks.md') return Promise.resolve(tasksMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);
    const tasksContent = getContent(result.changes, 'tasks.md');

    expect(tasksContent).toContain('due:2026-05-09');
    expect(tasksContent).toContain('snooze:2026-05-06');
  });

  it('shifts both start: and snooze: together when due changes', async () => {
    const tasksMd =
      `- [x] Task start:2026-04-27 snooze:2026-04-29 ` +
      `due:2026-05-02 repeat:a completionDate:${TODAY_STR}\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path === '/vault/tasks.md') return Promise.resolve(tasksMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);
    const tasksContent = getContent(result.changes, 'tasks.md');

    expect(tasksContent).toContain('due:2026-05-09');
    expect(tasksContent).toContain('start:2026-05-04');
    expect(tasksContent).toContain('snooze:2026-05-06');
  });

  it('uses completionDate as oldDue when no existing due: for start/snooze delta', async () => {
    const tasksMd = `- [x] Task start:2026-05-01 repeat:a completionDate:${TODAY_STR}\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path === '/vault/tasks.md') return Promise.resolve(tasksMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);
    const tasksContent = getContent(result.changes, 'tasks.md');

    expect(tasksContent).toContain('due:2026-05-09');
    expect(tasksContent).toContain('start:2026-05-07');
  });
});
