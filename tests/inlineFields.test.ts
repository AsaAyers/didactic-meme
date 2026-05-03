import { describe, it, expect } from 'vitest';
import { getInlineField, setInlineField } from '../src/markdown/inlineFields.js';

describe('getInlineField', () => {
  it('returns the value of an existing field', () => {
    expect(getInlineField('Buy milk due:2026-05-03', 'due')).toBe('2026-05-03');
  });

  it('returns undefined when field is absent', () => {
    expect(getInlineField('Buy milk', 'due')).toBeUndefined();
  });

  it('handles field at start of text', () => {
    expect(getInlineField('due:2026-05-03 Buy milk', 'due')).toBe('2026-05-03');
  });

  it('does not match a field that is a prefix of another key', () => {
    expect(getInlineField('duedate:2026-05-03', 'due')).toBeUndefined();
  });

  it('extracts completionDate field', () => {
    expect(getInlineField('Task completionDate:2026-05-01', 'completionDate')).toBe('2026-05-01');
  });

  it('extracts repeat field', () => {
    expect(getInlineField('Task repeat:2s', 'repeat')).toBe('2s');
  });
});

describe('setInlineField', () => {
  it('appends a new field when absent', () => {
    expect(setInlineField('Buy milk', 'due', '2026-05-03')).toBe('Buy milk due:2026-05-03');
  });

  it('replaces an existing field value in-place', () => {
    expect(setInlineField('Buy milk due:2026-05-01', 'due', '2026-05-10')).toBe(
      'Buy milk due:2026-05-10',
    );
  });

  it('replaces a field at start of text', () => {
    expect(setInlineField('due:2026-05-01 Buy milk', 'due', '2026-05-10')).toBe(
      'due:2026-05-10 Buy milk',
    );
  });

  it('only replaces the matching key, not others', () => {
    const text = 'Task due:2026-05-01 snooze:2026-05-03';
    expect(setInlineField(text, 'snooze', '2026-05-07')).toBe(
      'Task due:2026-05-01 snooze:2026-05-07',
    );
  });

  it('appends completionDate when absent', () => {
    expect(setInlineField('Buy milk', 'completionDate', '2026-05-03')).toBe(
      'Buy milk completionDate:2026-05-03',
    );
  });
});
