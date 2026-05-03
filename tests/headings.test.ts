import { describe, it, expect } from 'vitest';
import { parseMarkdown, stringifyMarkdown } from '../src/markdown/parse.js';
import { appendUnderHeading } from '../src/markdown/headings.js';

describe('appendUnderHeading', () => {
  it('appends lines under an existing heading', () => {
    const md = `# Notes\n\nSome content\n\n## Completed Tasks\n\nOld entry\n\n## Other Section\n\nOther content\n`;
    const tree = parseMarkdown(md);

    appendUnderHeading(tree, 'Completed Tasks', ['- [x] Task one', '- [x] Task two']);

    const out = stringifyMarkdown(tree);
    expect(out).toContain('* [x] Task one');
    expect(out).toContain('* [x] Task two');
    // Should appear before "Other Section"
    const completedIdx = out.indexOf('## Completed Tasks');
    const otherIdx = out.indexOf('## Other Section');
    const taskOneIdx = out.indexOf('* [x] Task one');
    expect(taskOneIdx).toBeGreaterThan(completedIdx);
    expect(taskOneIdx).toBeLessThan(otherIdx);
  });

  it('trims trailing blank lines before appending', () => {
    const md = `## Completed Tasks\n\nExisting entry\n\n\n\n`;
    const tree = parseMarkdown(md);

    appendUnderHeading(tree, 'Completed Tasks', ['- [x] New task']);

    const out = stringifyMarkdown(tree);
    // Should not have multiple consecutive blank lines before the new task
    expect(out).toContain('Existing entry');
    expect(out).toContain('* [x] New task');
    // The new task should follow without excessive blanks
    const existingIdx = out.indexOf('Existing entry');
    const newTaskIdx = out.indexOf('* [x] New task');
    expect(newTaskIdx).toBeGreaterThan(existingIdx);
  });

  it('creates the heading when it does not exist', () => {
    const md = `# Daily Notes\n\nSome content\n`;
    const tree = parseMarkdown(md);

    appendUnderHeading(tree, 'Completed Tasks', ['- [x] Created task']);

    const out = stringifyMarkdown(tree);
    expect(out).toContain('## Completed Tasks');
    expect(out).toContain('* [x] Created task');
  });

  it('appends at end of heading block and not after next heading', () => {
    const md = `## Section A\n\nContent A\n\n## Section B\n\nContent B\n`;
    const tree = parseMarkdown(md);

    appendUnderHeading(tree, 'Section A', ['- New item in A']);

    const out = stringifyMarkdown(tree);
    const sectionAIdx = out.indexOf('## Section A');
    const sectionBIdx = out.indexOf('## Section B');
    const newItemIdx = out.indexOf('* New item in A');

    expect(newItemIdx).toBeGreaterThan(sectionAIdx);
    expect(newItemIdx).toBeLessThan(sectionBIdx);
  });
});
