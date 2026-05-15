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

- [x] Buy milk #recurring
- [ ] Write tests
- [x] Deploy to production
- [ ] Review PR #urgent
`.trim();

describe("extractTasks", () => {
  it("extracts checked and unchecked tasks with tags", () => {
    const tree = parseMarkdown(SAMPLE_MARKDOWN);
    const tasks = extractTasks(tree, "test.md");
    expect(tasks).toHaveLength(4);

    expect(tasks[0]).toMatchObject({
      text: "Buy milk #recurring",
      checked: true,
      tags: ["recurring"],
    });
    expect(tasks[1]).toMatchObject({
      text: "Write tests",
      checked: false,
      tags: [],
    });
    expect(tasks[2]).toMatchObject({
      text: "Deploy to production",
      checked: true,
      tags: [],
    });
    expect(tasks[3]).toMatchObject({
      text: "Review PR #urgent",
      checked: false,
      tags: ["urgent"],
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

  it("extracts inline-field keys as tags (due/sleep/etc.)", () => {
    const tree = parseMarkdown("- [ ] Schedule follow-up due:2026-05-03 sleep:2026-05-10");
    const tasks = extractTasks(tree, "test.md");

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.tags).toEqual(["due", "sleep"]);
  });

  it("does not treat URL schemes as inline-field tags", () => {
    const tree = parseMarkdown(
      "- [ ] Review docs https://example.com mailto:test@example.com due:2026-05-03",
    );
    const tasks = extractTasks(tree, "test.md");

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.tags).toEqual(["due"]);
  });
});

describe("Task model", () => {
  it("renders markdown task lines via toString()", () => {
    const task = new Task({
      text: "Review PR due:2026-05-10",
      checked: false,
      tags: ["due"],
      sourcePath: "notes/work.md",
    });
    expect(task.toString()).toBe("* [ ] Review PR due:2026-05-10");
  });

  it("TaskSchema transforms parsed input into Task instances", () => {
    const parsed = TaskSchema.parse({
      text: "Write tests sleep:2026-05-11",
      checked: true,
      tags: ["sleep"],
    });
    expect(parsed).toBeInstanceOf(Task);
    expect(parsed.sourcePath).toBe("");
  });
});

describe("removeTask", () => {
  it("removes a completed task by exact text", () => {
    const tree = parseMarkdown(SAMPLE_MARKDOWN);
    const result = removeTask(tree, "Deploy to production");
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
    const result = setTaskChecked(tree, "Buy milk #recurring", false);
    expect(result).toBe(true);

    const tasks = extractTasks(tree, "test.md");
    const task = tasks.find((t) => t.text === "Buy milk #recurring");
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
      "Deploy to production",
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
      "Deploy to production",
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
      "Deploy to production",
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
