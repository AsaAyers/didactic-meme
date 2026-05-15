import { describe, it, expect } from "vitest";
import { parseMarkdown } from "../src/markdown/parse.js";
import {
  Task,
  TaskSchema,
  extractTasks,
  removeTask,
  setTaskChecked,
  updateTaskText,
} from "../src/markdown/tasks.js";

const SAMPLE_MARKDOWN = `
# Tasks

- [x] Buy milk due:2026-05-03 repeat:m
- [ ] Write tests
- [x] Deploy to production done:2026-05-01
- [ ] Review PR #urgent sleep:2026-05-08 due:2026-05-10
`.trim();

describe("extractTasks", () => {
  it("extracts checked and unchecked tasks with known inline fields", () => {
    const tree = parseMarkdown(SAMPLE_MARKDOWN);
    const tasks = extractTasks(tree, "test.md");
    expect(tasks).toHaveLength(4);

    expect(tasks[0]).toMatchObject({
      text: "Buy milk due:2026-05-03 repeat:m",
      title: "Buy milk",
      checked: true,
      fields: { due: "2026-05-03", repeat: "m" },
    });
    expect(tasks[1]).toMatchObject({
      text: "Write tests",
      title: "Write tests",
      checked: false,
      fields: {},
    });
    expect(tasks[2]).toMatchObject({
      text: "Deploy to production done:2026-05-01",
      title: "Deploy to production",
      checked: true,
      fields: { done: "2026-05-01" },
    });
    expect(tasks[3]).toMatchObject({
      text: "Review PR #urgent sleep:2026-05-08 due:2026-05-10",
      title: "Review PR #urgent",
      checked: false,
      fields: { due: "2026-05-10", sleep: "2026-05-08" },
    });
  });

  it("attaches the vault-relative sourcePath to every extracted task", () => {
    const tree = parseMarkdown(SAMPLE_MARKDOWN);
    const tasks = extractTasks(tree, "notes/work.md");
    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) {
      expect(task.sourcePath).toBe("notes/work.md");
    }
  });

  it("extracts known fields and strips them from title", () => {
    const tree = parseMarkdown(
      "- [ ] Schedule follow-up due:2026-05-03 SLEEP:2026-05-10",
    );
    const tasks = extractTasks(tree, "test.md");

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe("Schedule follow-up");
    expect(tasks[0]?.fields).toEqual({
      due: "2026-05-03",
      sleep: "2026-05-10",
    });
  });

  it("only strips known inline fields", () => {
    const tree = parseMarkdown(
      "- [ ] Review docs priority:high due:2026-05-03",
    );
    const tasks = extractTasks(tree, "test.md");

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe("Review docs priority:high");
    expect(tasks[0]?.fields).toEqual({ due: "2026-05-03" });
  });
});

describe("Task model", () => {
  it("renders markdown task lines via toString()", () => {
    const task = new Task({
      text: "Review PR due:2026-05-10 sleep:2026-05-08",
      checked: false,
      sourcePath: "notes/work.md",
    });
    expect(task.toString()).toBe(
      "* [ ] Review PR due:2026-05-10 sleep:2026-05-08",
    );
  });

  it("serializes known fields in deterministic order", () => {
    const task = new Task({
      text: "Review PR snooze:2026-05-09 due:2026-05-10",
      checked: false,
      sourcePath: "notes/work.md",
    });
    expect(task.toString()).toBe(
      "* [ ] Review PR due:2026-05-10 snooze:2026-05-09",
    );
  });

  it("merges explicit fields with extracted fields", () => {
    const task = new Task({
      text: "Review PR due:2026-05-10",
      checked: false,
      fields: { start: "2026-05-09" },
      sourcePath: "notes/work.md",
    });
    expect(task.fields).toEqual({
      due: "2026-05-10",
      start: "2026-05-09",
    });
    expect(task.toString()).toBe(
      "* [ ] Review PR due:2026-05-10 start:2026-05-09",
    );
  });

  it("TaskSchema transforms parsed input into Task instances", () => {
    const parsed = TaskSchema.parse({
      text: "Write tests sleep:2026-05-11",
      checked: true,
      fields: {},
    });
    expect(parsed).toBeInstanceOf(Task);
    expect(parsed.title).toBe("Write tests");
    expect(parsed.fields).toEqual({ sleep: "2026-05-11" });
    expect(parsed.sourcePath).toBe("");
  });

  it("TaskSchema merges explicit fields with extracted known fields", () => {
    const parsed = TaskSchema.parse({
      text: "Write tests due:2026-05-11 start:2026-05-01",
      checked: true,
      fields: { start: "2026-05-10" },
    });
    expect(parsed.fields).toEqual({
      due: "2026-05-11",
      start: "2026-05-10",
    });
    expect(parsed.toString()).toBe(
      "* [x] Write tests due:2026-05-11 start:2026-05-10",
    );
  });
});

describe("removeTask", () => {
  it("removes a completed task by exact text", () => {
    const tree = parseMarkdown(SAMPLE_MARKDOWN);
    const result = removeTask(tree, "Deploy to production done:2026-05-01");
    expect(result).toBe(true);

    const tasks = extractTasks(tree, "test.md");
    expect(tasks.map((t) => t.text)).not.toContain("Deploy to production");
    expect(tasks).toHaveLength(3);
  });

  it("returns false when task not found", () => {
    const tree = parseMarkdown(SAMPLE_MARKDOWN);
    const result = removeTask(tree, "Nonexistent task");
    expect(result).toBe(false);
  });
});

describe("setTaskChecked", () => {
  it("sets a task to checked=true", () => {
    const tree = parseMarkdown(SAMPLE_MARKDOWN);
    const result = setTaskChecked(tree, "Write tests", true);
    expect(result).toBe(true);

    const tasks = extractTasks(tree, "test.md");
    const task = tasks.find((t) => t.text === "Write tests");
    expect(task?.checked).toBe(true);
  });

  it("unchecks a checked task", () => {
    const tree = parseMarkdown(SAMPLE_MARKDOWN);
    const result = setTaskChecked(tree, "Buy milk due:2026-05-03 repeat:m", false);
    expect(result).toBe(true);

    const tasks = extractTasks(tree, "test.md");
    const task = tasks.find((t) => t.text === "Buy milk due:2026-05-03 repeat:m");
    expect(task?.checked).toBe(false);
  });

  it("returns false when task not found", () => {
    const tree = parseMarkdown(SAMPLE_MARKDOWN);
    const result = setTaskChecked(tree, "Nonexistent task", true);
    expect(result).toBe(false);
  });
});

describe("updateTaskText", () => {
  it("replaces the text of a task in-place", () => {
    const tree = parseMarkdown(SAMPLE_MARKDOWN);
    const result = updateTaskText(
      tree,
      "Deploy to production done:2026-05-01",
      "Deploy to production due:2026-05-10",
    );
    expect(result).toBe(true);

    const tasks = extractTasks(tree, "test.md");
    expect(tasks.map((t) => t.text)).toContain(
      "Deploy to production due:2026-05-10",
    );
    expect(tasks.map((t) => t.text)).not.toContain("Deploy to production");
  });

  it("preserves checked state after text update", () => {
    const tree = parseMarkdown(SAMPLE_MARKDOWN);
    updateTaskText(
      tree,
      "Deploy to production done:2026-05-01",
      "Deploy to production due:2026-05-10",
    );

    const tasks = extractTasks(tree, "test.md");
    const updated = tasks.find(
      (t) => t.text === "Deploy to production due:2026-05-10",
    );
    expect(updated?.checked).toBe(true);
  });

  it("returns false when task not found", () => {
    const tree = parseMarkdown(SAMPLE_MARKDOWN);
    const result = updateTaskText(tree, "Nonexistent task", "New text");
    expect(result).toBe(false);
  });

  it("allows setTaskChecked to find the task by its new text", () => {
    const tree = parseMarkdown(SAMPLE_MARKDOWN);
    updateTaskText(
      tree,
      "Deploy to production done:2026-05-01",
      "Deploy to production due:2026-05-10",
    );
    const unchecked = setTaskChecked(
      tree,
      "Deploy to production due:2026-05-10",
      false,
    );
    expect(unchecked).toBe(true);

    const tasks = extractTasks(tree, "test.md");
    const task = tasks.find(
      (t) => t.text === "Deploy to production due:2026-05-10",
    );
    expect(task?.checked).toBe(false);
  });
});
