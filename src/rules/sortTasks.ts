import { joinFrontmatter, splitFrontmatter } from "../markdown/frontmatter.js";
import { getInlineField } from "../markdown/inlineFields.js";
import { parseMarkdown, stringifyMarkdown } from "../markdown/parse.js";
import { parseDateStr } from "./scheduleUtils.js";
import type { CustomAction, RuleSpec } from "./types.js";

type Root = ReturnType<typeof parseMarkdown>;
type List = Extract<Root["children"][number], { type: "list" }>;
type ListItem = List["children"][number];
type ParentNode = { children: unknown[] };
type WikiLinkLike = {
  type: "wikiLink";
  value: string;
  data?: { alias?: string };
};

function isParentNode(node: unknown): node is ParentNode {
  return (
    typeof node === "object" &&
    node !== null &&
    "children" in node &&
    Array.isArray((node as ParentNode).children)
  );
}

function isList(node: unknown): node is List {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    "children" in node &&
    (node as { type?: string }).type === "list" &&
    Array.isArray((node as ParentNode).children)
  );
}

function isTaskItem(node: List["children"][number]): boolean {
  return node.checked !== null && node.checked !== undefined;
}

function isTaskOnlyList(list: List): boolean {
  return list.children.length > 0 && list.children.every(isTaskItem);
}

function isWikiLinkLike(node: unknown): node is WikiLinkLike {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    "value" in node &&
    (node as { type?: string }).type === "wikiLink" &&
    typeof (node as { value?: unknown }).value === "string"
  );
}

function taskText(item: ListItem): string {
  const parts: string[] = [];
  for (const child of item.children) {
    if (child.type !== "paragraph") continue;
    for (const inline of child.children) {
      if (inline.type === "text") {
        parts.push(inline.value);
        continue;
      }
      if (isWikiLinkLike(inline)) {
        const alias = inline.data?.alias;
        parts.push(
          alias && alias !== inline.value
            ? `[[${inline.value}|${alias}]]`
            : `[[${inline.value}]]`,
        );
      }
    }
  }
  return parts.join("").trim();
}

function completionTime(item: ListItem): number {
  const done = getInlineField(taskText(item), "done");
  if (!done) return Number.NEGATIVE_INFINITY;
  const parsed = parseDateStr(done);
  if (!parsed) return Number.NEGATIVE_INFINITY;
  return parsed.getTime();
}

function sortTaskItems(items: ListItem[]): ListItem[] {
  return items
    .map((item, index) => ({ item, index, doneTime: completionTime(item) }))
    .sort((a, b) => {
      const aDone = a.item.checked === true;
      const bDone = b.item.checked === true;
      if (aDone !== bDone) return Number(aDone) - Number(bDone);
      if (!aDone) return a.index - b.index;
      if (a.doneTime !== b.doneTime) return b.doneTime - a.doneTime;
      return a.index - b.index;
    })
    .map(({ item }) => ({
      ...item,
      spread: false,
    }));
}

function areMergeCompatible(a: List, b: List): boolean {
  if ((a.ordered ?? false) !== (b.ordered ?? false)) return false;
  if (a.ordered) return (a.start ?? 1) === (b.start ?? 1);
  return true;
}

function processParent(node: ParentNode): boolean {
  let changed = false;

  for (const child of node.children) {
    if (isParentNode(child)) {
      changed = processParent(child) || changed;
    }
  }

  let i = 0;
  while (i < node.children.length) {
    const child = node.children[i];
    if (!isList(child) || !isTaskOnlyList(child)) {
      i++;
      continue;
    }

    const lists: List[] = [child];
    let j = i + 1;
    while (j < node.children.length) {
      const next = node.children[j];
      if (!isList(next) || !isTaskOnlyList(next) || !areMergeCompatible(child, next))
        break;
      lists.push(next);
      j++;
    }

    const originalItems = lists.flatMap((list) => list.children);
    const sortedItems = sortTaskItems(originalItems);
    const sameOrder =
      originalItems.length === sortedItems.length &&
      originalItems.every((item, idx) => item === sortedItems[idx]);
    const hadSpread =
      lists.some((list) => list.spread === true) ||
      originalItems.some((item) => item.spread === true);
    const mergedLists = lists.length > 1;

    if (!sameOrder || hadSpread || mergedLists) {
      const replacement: List = {
        ...child,
        spread: false,
        children: sortedItems,
      };
      node.children.splice(i, lists.length, replacement);
      changed = true;
      i++;
      continue;
    }

    i = j;
  }

  return changed;
}

const sortTasksAction: CustomAction = {
  type: "custom",
  run: async ({ files, readFile, stageChange }) => {
    const filePaths = [...new Set(files.map((file) => file.path))];
    for (const filePath of filePaths) {
      const raw = await readFile(filePath);
      if (!raw) continue;

      const parts = splitFrontmatter(raw);
      const tree = parseMarkdown(parts.body);
      const changed = processParent(tree);
      if (!changed) continue;

      const nextBody = stringifyMarkdown(tree);
      const nextContent = joinFrontmatter(parts, nextBody);
      if (nextContent !== raw) {
        stageChange({ path: filePath, content: nextContent });
      }
    }
  },
};

export const sortTasksSpec: RuleSpec = {
  name: "sortTasks",
  sources: [{ type: "glob", pattern: "**/*.md" }],
  query: { type: "tasks" },
  actions: [sortTasksAction],
};
