import { visit } from "unist-util-visit";
import type { parseMarkdown } from "./parse.js";

type Root = ReturnType<typeof parseMarkdown>;
type List = Extract<Root["children"][number], { type: "list" }>;
type ListItem = List["children"][number];
type Paragraph = Extract<ListItem["children"][number], { type: "paragraph" }>;
type Text = Extract<Paragraph["children"][number], { type: "text" }>;

export type Task = {
  text: string;
  checked: boolean;
  tags: string[];
  /** Vault-relative path of the file this task was extracted from. */
  sourcePath: string;
};

function getListItemText(item: ListItem): string {
  const parts: string[] = [];
  for (const child of item.children) {
    if (child.type === "paragraph") {
      for (const inline of (child as Paragraph).children) {
        if (inline.type === "text") {
          parts.push((inline as Text).value);
        }
      }
    }
  }
  return parts.join("").trim();
}

function extractTags(text: string): string[] {
  const matches = text.match(/#(\w+)/g);
  if (!matches) return [];
  return matches.map((t) => t.slice(1));
}

export function extractTasks(tree: Root, sourcePath: string): Task[] {
  const tasks: Task[] = [];
  visit(tree, "listItem", (node: ListItem) => {
    if (node.checked !== null && node.checked !== undefined) {
      const text = getListItemText(node);
      tasks.push({
        text,
        checked: node.checked,
        tags: extractTags(text),
        sourcePath,
      });
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
