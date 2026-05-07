import { getInlineField } from "../markdown/inlineFields.js";
import type { Task } from "../markdown/tasks.js";
import type { CustomAction, RuleSpec } from "./types.js";

function taskSorter(a: Task, b: Task): number {
  const dueA = getInlineField(a.text, "due");
  const dueB = getInlineField(b.text, "due");
  if (!dueA && !dueB) return 0;
  if (!dueA) return 1;
  if (!dueB) return -1;

  return dueA.localeCompare(dueB);
}
const httpAlert: CustomAction = {
  type: "custom",
  run: async ({ tasks, dryRun, config, log }) => {
    const alertRuleConfig = config?.rules["incompleteTaskAlert"];
    const alertUrl = alertRuleConfig?.alertUrl;

    // Group tasks by sourcePath (vault-relative), preserving per-file order.
    const byFile = new Map<string, Task[]>();
    for (const task of [...tasks].sort(taskSorter)) {
      const fileTasks = byFile.get(task.sourcePath) ?? [];
      fileTasks.push(task);
      byFile.set(task.sourcePath, fileTasks);
    }

    // Sort files by path for deterministic output.
    const sortedPaths = [...byFile.keys()].sort();

    const sections = sortedPaths.map((filePath) => {
      const fileTasks = byFile.get(filePath)!;
      const taskLines = fileTasks
        .map((t) => `- [${t.checked ? "x" : " "}] ${t.text}`)
        .join("\n");
      return `## ${filePath}\n\n${taskLines}`;
    });
    const content = sections.join("\n\n") + "\n";

    if (dryRun) {
      const destination = alertUrl
        ? `to ${alertUrl}`
        : "(no alertUrl configured)";
      log(
        `[dry-run] incompleteTaskAlert: would send alert ${destination} (Title: Incomplete Tasks):\n${content}`,
      );
      return;
    }
    if (!alertUrl) return;
    const alertToken = alertRuleConfig?.alertToken;
    // ntfy.sh requires Content-Type: text/plain for inline message bodies.
    // Markdown rendering is enabled via the Markdown header, and the Title
    // header sets the notification title shown in the app.
    const headers: Record<string, string> = {
      "Content-Type": "text/plain",
      Markdown: "yes",
      Title: "Incomplete Tasks",
    };
    if (alertToken) headers["Authorization"] = `Bearer ${alertToken}`;
    await fetch(alertUrl, { method: "POST", headers, body: content });
  },
};

export const incompleteTaskAlertSpec: RuleSpec = {
  name: "incompleteTaskAlert",
  dependencies: ["stampDone"],
  sources: [
    {
      type: "glob",
      pattern: "**/*.md",
      exclude: ["archive/**", "templates/**"],
    },
  ],
  query: {
    type: "tasks",
    predicate: {
      type: "and",
      predicates: [
        { type: "unchecked" },
        {
          type: "not",
          predicate: { type: "fieldDateAfter", key: "snooze", date: "today" },
        },
      ],
    },
  },
  actions: [httpAlert],
};
