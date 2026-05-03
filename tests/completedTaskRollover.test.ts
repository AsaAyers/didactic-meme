import { describe, it, expect, vi, beforeEach } from 'vitest';
import { completedTaskRolloverRule } from '../src/rules/completedTaskRollover.js';

// Mock the io module so we don't need real files.
vi.mock('../src/engine/io.js', () => ({
  readFile: vi.fn(),
}));

import { readFile } from '../src/engine/io.js';
const mockReadFile = readFile as ReturnType<typeof vi.fn>;

// 2026-05-03 is a Sunday.
const TODAY = new Date(2026, 4, 3);
const TODAY_STR = '2026-05-03';

const baseCtx = {
  vaultPath: '/vault',
  today: TODAY,
  dryRun: false,
  env: {},
};

beforeEach(() => {
  vi.clearAllMocks();
});

// Helper: given changes, find the content for a path suffix.
function getContent(changes: Array<{ path: string; content: string }>, suffix: string): string {
  const change = changes.find((c) => c.path.endsWith(suffix));
  if (!change) throw new Error(`No change found for path suffix: ${suffix}`);
  return change.content;
}

describe('completedTaskRollover — basic rollover (no repeat)', () => {
  it('removes a non-repeating completed task from TODO and logs it to daily note', async () => {
    const todoMd = `- [x] Deploy to production\n- [ ] Write tests\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes('TODO')) return Promise.resolve(todoMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);

    const todoContent = getContent(result.changes, 'TODO.md');
    const dailyContent = getContent(result.changes, `${TODAY_STR}.md`);

    // Task should be removed from TODO
    expect(todoContent).not.toContain('Deploy to production');
    // Incomplete task stays
    expect(todoContent).toContain('Write tests');
    // Daily note gets the completed task
    expect(dailyContent).toContain('- [x] Deploy to production');
  });

  it('does NOT treat a #recurring tag as special — removes the task', async () => {
    // Previously #recurring caused uncheck; now it should behave like any non-repeat task.
    const todoMd = `- [x] Weekly standup #recurring\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes('TODO')) return Promise.resolve(todoMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);

    const todoContent = getContent(result.changes, 'TODO.md');
    // Task must be removed (no special #recurring handling)
    expect(todoContent).not.toContain('Weekly standup');
  });
});

describe('completedTaskRollover — repeat scheduling', () => {
  it('unchecks and advances due: for a task with repeat: (no existing due)', async () => {
    // Sunday, repeat:s (weekly on Sunday).
    // completionDate = today = 2026-05-03 (Sunday)
    // minDate = 2026-05-03 + 0*7 + 1 = 2026-05-04 (Monday)
    // next Sunday = 2026-05-10
    const todoMd = `- [x] Water plants repeat:s completionDate:${TODAY_STR}\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes('TODO')) return Promise.resolve(todoMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);
    const todoContent = getContent(result.changes, 'TODO.md');

    // Task should remain but be unchecked
    expect(todoContent).toContain('Water plants');
    expect(todoContent).toContain('- [ ]');
    // due: should be set to next Sunday
    expect(todoContent).toContain('due:2026-05-10');
  });

  it('uses today as fallback when completionDate field is missing', async () => {
    // No completionDate field — rule falls back to ctx.today = 2026-05-03 (Sunday)
    // repeat:s (weekly on Sunday) → next due = 2026-05-10
    const todoMd = `- [x] Water plants repeat:s\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes('TODO')) return Promise.resolve(todoMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);
    const todoContent = getContent(result.changes, 'TODO.md');

    expect(todoContent).toContain('due:2026-05-10');
    expect(todoContent).toContain('- [ ]');
  });

  it('skipWeeks=1 on Sunday: next due is +14 days (2026-05-17)', async () => {
    const todoMd = `- [x] Task repeat:1s completionDate:${TODAY_STR}\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes('TODO')) return Promise.resolve(todoMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);
    const todoContent = getContent(result.changes, 'TODO.md');

    expect(todoContent).toContain('due:2026-05-17');
  });

  it('overwrites an existing due: when task repeats', async () => {
    // Task already has due:2026-05-03 (today, Sunday). repeat:s.
    // oldDue = 2026-05-03, newDue = 2026-05-10, delta = +7
    const todoMd = `- [x] Task due:${TODAY_STR} repeat:s completionDate:${TODAY_STR}\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes('TODO')) return Promise.resolve(todoMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);
    const todoContent = getContent(result.changes, 'TODO.md');

    expect(todoContent).toContain('due:2026-05-10');
    expect(todoContent).not.toContain(`due:${TODAY_STR}`);
  });
});

describe('completedTaskRollover — start/snooze shifting', () => {
  it('shifts start: forward by the same delta as due moved', async () => {
    // repeat:a (Saturday). Today = Sunday 2026-05-03.
    // minDate = 2026-05-04, next Saturday = 2026-05-09
    // oldDue = completionDate = 2026-05-03, delta = diffDays(2026-05-09, 2026-05-03) = +6
    // start:2026-04-28 → +6 → 2026-05-04
    const todoMd = `- [x] Task start:2026-04-28 repeat:a completionDate:${TODAY_STR}\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes('TODO')) return Promise.resolve(todoMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);
    const todoContent = getContent(result.changes, 'TODO.md');

    expect(todoContent).toContain('due:2026-05-09');
    expect(todoContent).toContain('start:2026-05-04');
  });

  it('shifts snooze: forward by the same delta as due moved', async () => {
    // repeat:a (Saturday). Today = Sunday 2026-05-03. delta = +6.
    // snooze:2026-04-30 → +6 → 2026-05-06
    const todoMd = `- [x] Task snooze:2026-04-30 repeat:a completionDate:${TODAY_STR}\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes('TODO')) return Promise.resolve(todoMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);
    const todoContent = getContent(result.changes, 'TODO.md');

    expect(todoContent).toContain('due:2026-05-09');
    expect(todoContent).toContain('snooze:2026-05-06');
  });

  it('shifts both start: and snooze: together when due changes', async () => {
    // Task: start:Sunday snooze:Tuesday due:Saturday repeat:a
    // today = 2026-05-03 (Sunday), completionDate = 2026-05-03
    // existing due = 2026-05-02 (Saturday)
    // newDue = next Saturday after minDate (2026-05-04) = 2026-05-09
    // delta = 2026-05-09 - 2026-05-02 = +7
    // start:2026-04-27 (Sunday) → +7 → 2026-05-04
    // snooze:2026-04-29 (Tuesday) → +7 → 2026-05-06
    const todoMd =
      `- [x] Task start:2026-04-27 snooze:2026-04-29 ` +
      `due:2026-05-02 repeat:a completionDate:${TODAY_STR}\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes('TODO')) return Promise.resolve(todoMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);
    const todoContent = getContent(result.changes, 'TODO.md');

    expect(todoContent).toContain('due:2026-05-09');
    expect(todoContent).toContain('start:2026-05-04');
    expect(todoContent).toContain('snooze:2026-05-06');
  });

  it('uses completionDate as oldDue when no existing due: for start/snooze delta', async () => {
    // No due: field. repeat:a (Saturday). completionDate = 2026-05-03 (Sunday).
    // newDue = 2026-05-09 (Saturday). oldDue = completionDate = 2026-05-03.
    // delta = +6.
    // start:2026-05-01 → +6 → 2026-05-07
    const todoMd = `- [x] Task start:2026-05-01 repeat:a completionDate:${TODAY_STR}\n`;
    const dailyMd = ``;
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes('TODO')) return Promise.resolve(todoMd);
      return Promise.resolve(dailyMd);
    });

    const result = await completedTaskRolloverRule.run(baseCtx);
    const todoContent = getContent(result.changes, 'TODO.md');

    expect(todoContent).toContain('due:2026-05-09');
    expect(todoContent).toContain('start:2026-05-07');
  });
});
