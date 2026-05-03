import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stampCompletionDateRule } from '../src/rules/stampCompletionDate.js';

const TODAY = new Date(2026, 4, 3); // 2026-05-03 (Sunday)
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
});

describe('stampCompletionDate rule', () => {
  it('returns early when TODO.md is missing', async () => {
    mockReadFile.mockResolvedValue('');
    const result = await stampCompletionDateRule.run(baseCtx);
    expect(result.changes).toHaveLength(0);
    expect(result.summary).toContain('TODO.md not found');
  });

  it('stamps completionDate on completed tasks that lack it', async () => {
    const md = `- [x] Buy milk\n- [ ] Write tests\n- [x] Deploy\n`;
    mockReadFile.mockResolvedValue(md);

    const result = await stampCompletionDateRule.run(baseCtx);

    expect(result.changes).toHaveLength(1);
    const content = result.changes[0].content;
    expect(content).toContain(`Buy milk completionDate:${TODAY_STR}`);
    expect(content).toContain(`Deploy completionDate:${TODAY_STR}`);
    expect(content).toContain('Write tests');
    expect(content).not.toMatch(/Write tests.*completionDate/);
    expect(result.summary).toContain('2');
  });

  it('does NOT overwrite an existing completionDate', async () => {
    const md = `- [x] Buy milk completionDate:2026-04-01\n- [x] Deploy\n`;
    mockReadFile.mockResolvedValue(md);

    const result = await stampCompletionDateRule.run(baseCtx);

    expect(result.changes).toHaveLength(1);
    const content = result.changes[0].content;
    expect(content).toContain('completionDate:2026-04-01');
    expect(content).toContain(`Deploy completionDate:${TODAY_STR}`);
    expect(result.summary).toContain('1');
  });

  it('returns no changes when all completed tasks already have completionDate', async () => {
    const md = `- [x] Buy milk completionDate:${TODAY_STR}\n`;
    mockReadFile.mockResolvedValue(md);

    const result = await stampCompletionDateRule.run(baseCtx);

    expect(result.changes).toHaveLength(0);
    expect(result.summary).toContain('No tasks needed');
  });

  it('returns no changes when there are no completed tasks', async () => {
    const md = `- [ ] Write tests\n- [ ] Review PR\n`;
    mockReadFile.mockResolvedValue(md);

    const result = await stampCompletionDateRule.run(baseCtx);

    expect(result.changes).toHaveLength(0);
    expect(result.summary).toContain('No tasks needed');
  });
});
