import { z } from "zod";
import { visit } from "unist-util-visit";
import type { WikiLinkNode, parseMarkdown } from "./parse.js";

type Root = ReturnType<typeof parseMarkdown>;
type List = Extract<Root["children"][number], { type: "list" }>;
type ListItem = List["children"][number];
type Paragraph = Extract<ListItem["children"][number], { type: "paragraph" }>;
type Text = Extract<Paragraph["children"][number], { type: "text" }>;

export const TaskInputSchema = z.object({
  text: z
    .string()
    .describe(
      "Task text; include inline fields like due:2026-05-03, sleep:2026-05-10, repeat:mwf when relevant.",
    ),
  checked: z.boolean().describe("Whether the task is complete."),
  tags: z
    .array(z.string())
    .default([])
    .describe("Task tags/field keys such as urgent, due, sleep, repeat, done."),
  sourcePath: z
    .string()
    .default("")
    .describe(
      "Vault-relative source path for extracted tasks. Leave empty when unknown.",
    ),
});

export class Task {
  text: string;
  checked: boolean;
  tags: string[];
  /** Vault-relative path of the file this task was extracted from. */
  sourcePath: string;

  constructor({ text, checked, tags, sourcePath }: z.input<typeof TaskInputSchema>) {
    this.text = text;
    this.checked = checked;
    this.tags = tags;
    this.sourcePath = sourcePath;
  }

  toString(): string {
    return `* [${this.checked ? "x" : " "}] ${this.text}`;
  }
}

export const TaskSchema = TaskInputSchema.transform((task) => new Task(task));

function isWikiLinkNode(node: unknown): node is WikiLinkNode {
  if (typeof node !== "object" || node === null) return false;
  if (!("type" in node) || !("value" in node)) return false;
  return node.type === "wikiLink" && typeof node.value === "string";
}

function getListItemText(item: ListItem): string {
  const parts: string[] = [];
  for (const child of item.children) {
    if (child.type === "paragraph") {
      for (const inline of (child as Paragraph).children) {
        if (inline.type === "text") {
          parts.push((inline as Text).value);
          continue;
        }
        const inlineNode: unknown = inline;
        if (isWikiLinkNode(inlineNode)) {
          const alias = inlineNode.data?.alias;
          if (alias && alias !== inlineNode.value) {
            parts.push(`[[${inlineNode.value}|${alias}]]`);
          } else {
            parts.push(`[[${inlineNode.value}]]`);
          }
        }
      }
    }
  }
  return parts.join("").trim();
}

function extractTags(text: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();

  const hashTagMatches = text.matchAll(/#(\w+)/g);
  for (const match of hashTagMatches) {
    const tag = match[1];
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }

  const inlineFieldMatches = text.matchAll(/\b([a-zA-Z][\w-]*):\S+/g);
  for (const match of inlineFieldMatches) {
    const tag = match[1];
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }

  return tags;
}

export function extractTasks(tree: Root, sourcePath: string): Task[] {
  const tasks: Task[] = [];
  visit(tree, "listItem", (node: ListItem) => {
    if (node.checked !== null && node.checked !== undefined) {
      const text = getListItemText(node);
      tasks.push(
        new Task({
          text,
          checked: node.checked,
          tags: extractTags(text),
          sourcePath,
        }),
      );
    }
  });
  return tasks;
}

export function removeTask(tree: Root, taskText: string): boolean {
  let found = false;
  visit(tree, "list", (listNode) => {
    const list = listNode as List;
    const idx = list.children.findIndex((item) => {
      if (item.checked === null || item.checked === undefined) return false;
      return getListItemText(item) === taskText;
    });
    if (idx !== -1) {
      list.children.splice(idx, 1);
      found = true;
    }
  });
  return found;
}

export function setTaskChecked(
  tree: Root,
  taskText: string,
  checked: boolean,
): boolean {
  let found = false;
  visit(tree, "listItem", (node: ListItem) => {
    if (node.checked !== null && node.checked !== undefined) {
      if (getListItemText(node) === taskText) {
        node.checked = checked;
        found = true;
      }
    }
  });
  return found;
}

/**
 * Insert a new task list item immediately after the item whose text equals
 * `afterText`.  The new item's checked state is set to `checked` and its text
 * content to `newTaskText`.
 * Returns true if the anchor item was found and the new item was inserted.
 */
export function insertTaskAfter(
  tree: Root,
  afterText: string,
  newTaskText: string,
  checked: boolean,
): boolean {
  let inserted = false;
  visit(tree, "list", (listNode) => {
    const list = listNode as List;
    const idx = list.children.findIndex((item) => {
      if (item.checked === null || item.checked === undefined) return false;
      return getListItemText(item) === afterText;
    });
    if (idx !== -1 && !inserted) {
      const newItem: ListItem = {
        type: "listItem",
        checked,
        spread: false,
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", value: newTaskText } as Text],
          } as Paragraph,
        ],
      };
      list.children.splice(idx + 1, 0, newItem);
      inserted = true;
    }
  });
  return inserted;
}

/**
 * Replace the text content of a task list item in the AST.
 * Finds the item whose displayed text equals `oldText` and rewrites the
 * paragraph's inline children to a single Text node with `newText`.
 * Returns true if the item was found and updated.
 */
export function updateTaskText(
  tree: Root,
  oldText: string,
  newText: string,
): boolean {
  let found = false;
  visit(tree, "listItem", (node: ListItem) => {
    if (node.checked !== null && node.checked !== undefined) {
      if (getListItemText(node) === oldText) {
        for (const child of node.children) {
          if (child.type === "paragraph") {
            (child as Paragraph).children = [
              { type: "text", value: newText } as Text,
            ];
            found = true;
          }
        }
      }
    }
  });
  return found;
}
