import { describe, it, expect } from 'vitest';
import { parseMarkdown, stringifyMarkdown } from '../src/markdown/parse.js';
import { extractTasks, removeTask, setTaskChecked } from '../src/markdown/tasks.js';

const SAMPLE_MARKDOWN = `
# Tasks

- [x] Buy milk #recurring
- [ ] Write tests
- [x] Deploy to production
- [ ] Review PR #urgent
`.trim();

describe('extractTasks', () => {
  it('extracts checked and unchecked tasks with tags', () => {
    const tree = parseMarkdown(SAMPLE_MARKDOWN);
    const tasks = extractTasks(tree);
    expect(tasks).toHaveLength(4);

    expect(tasks[0]).toMatchObject({ text: 'Buy milk #recurring', checked: true, tags: ['recurring'] });
    expect(tasks[1]).toMatchObject({ text: 'Write tests', checked: false, tags: [] });
    expect(tasks[2]).toMatchObject({ text: 'Deploy to production', checked: true, tags: [] });
    expect(tasks[3]).toMatchObject({ text: 'Review PR #urgent', checked: false, tags: ['urgent'] });
  });
});

describe('removeTask', () => {
  it('removes a completed task by exact text', () => {
    const tree = parseMarkdown(SAMPLE_MARKDOWN);
    const result = removeTask(tree, 'Deploy to production');
    expect(result).toBe(true);

    const tasks = extractTasks(tree);
    expect(tasks.map((t) => t.text)).not.toContain('Deploy to production');
    expect(tasks).toHaveLength(3);
  });

  it('returns false when task not found', () => {
    const tree = parseMarkdown(SAMPLE_MARKDOWN);
    const result = removeTask(tree, 'Nonexistent task');
    expect(result).toBe(false);
  });
});

describe('setTaskChecked', () => {
  it('sets a task to checked=true', () => {
    const tree = parseMarkdown(SAMPLE_MARKDOWN);
    const result = setTaskChecked(tree, 'Write tests', true);
    expect(result).toBe(true);

    const tasks = extractTasks(tree);
    const task = tasks.find((t) => t.text === 'Write tests');
    expect(task?.checked).toBe(true);
  });

  it('unchecks a checked task', () => {
    const tree = parseMarkdown(SAMPLE_MARKDOWN);
    const result = setTaskChecked(tree, 'Buy milk #recurring', false);
    expect(result).toBe(true);

    const tasks = extractTasks(tree);
    const task = tasks.find((t) => t.text === 'Buy milk #recurring');
    expect(task?.checked).toBe(false);
  });

  it('returns false when task not found', () => {
    const tree = parseMarkdown(SAMPLE_MARKDOWN);
    const result = setTaskChecked(tree, 'Nonexistent task', true);
    expect(result).toBe(false);
  });
});
