import { constants as fsConstants, promises as fs } from "node:fs";
import { join } from "node:path";
import { joinFrontmatter, splitFrontmatter } from "../markdown/frontmatter.js";
import { getInlineField } from "../markdown/inlineFields.js";
import { parseMarkdown, stringifyMarkdown } from "../markdown/parse.js";
import { removeTask } from "../markdown/tasks.js";
import type { CustomAction, RuleSpec } from "./types.js";

function ensureCheckedTaskLine(taskText: string): string {
  return /^\[[xX ]\]\s/.test(taskText) ? `* ${taskText}` : `* [x] ${taskText}`;
}

const moveDoneTranscriptTasksToDailyNoteAction: CustomAction = {
  type: "custom",
  run: async ({ tasks, vaultPath, config, readFile, stageChange }) => {
    const dailyNotesFolder =
      config?.rules["moveDoneTranscriptTasksToDailyNote"]?.dailyNotesFolder;
    if (!dailyNotesFolder) return;

    const tasksByTranscript = new Map<string, string[]>();
    const tasksByDailyNote = new Map<string, string[]>();

    for (const task of tasks) {
      const done = getInlineField(task.text, "done");
      if (!done || !/^\d{4}-\d{2}-\d{2}$/.test(done)) continue;

      const dailyNotePath = join(
        vaultPath,
        dailyNotesFolder,
        `${done}.md`,
      );
      try {
        await fs.access(dailyNotePath, fsConstants.F_OK);
      } catch {
        continue;
      }

      const transcriptPath = join(vaultPath, task.sourcePath);
      const existingTranscriptTasks = tasksByTranscript.get(transcriptPath) ?? [];
      existingTranscriptTasks.push(task.text);
      tasksByTranscript.set(transcriptPath, existingTranscriptTasks);

      const existingDailyNoteTasks = tasksByDailyNote.get(dailyNotePath) ?? [];
      existingDailyNoteTasks.push(task.text);
      tasksByDailyNote.set(dailyNotePath, existingDailyNoteTasks);
    }

    for (const [dailyNotePath, movedTasks] of tasksByDailyNote) {
      const rawDailyNote = await readFile(dailyNotePath);
      const parts = splitFrontmatter(rawDailyNote);
      const movedTaskLines = movedTasks.map(ensureCheckedTaskLine);
      const needsLeadingNewline =
        parts.body.length > 0 && !parts.body.endsWith("\n");
      const nextBody =
        parts.body +
        (needsLeadingNewline ? "\n" : "") +
        movedTaskLines.join("\n") +
        "\n";
      const nextContent = joinFrontmatter(parts, nextBody);
      if (nextContent !== rawDailyNote) {
        stageChange({ path: dailyNotePath, content: nextContent });
      }
    }

    for (const [transcriptPath, taskTexts] of tasksByTranscript) {
      const rawTranscript = await readFile(transcriptPath);
      const parts = splitFrontmatter(rawTranscript);
      const tree = parseMarkdown(parts.body);
      for (const taskText of taskTexts) {
        removeTask(tree, taskText);
      }
      const nextBody = stringifyMarkdown(tree);
      const nextContent = joinFrontmatter(parts, nextBody);
      if (nextContent !== rawTranscript) {
        stageChange({ path: transcriptPath, content: nextContent });
      }
    }
  },
};

export const moveDoneTranscriptTasksToDailyNoteSpec: RuleSpec = {
  name: "moveDoneTranscriptTasksToDailyNote",
  dependencies: ["stampDone"],
  sources: [{ type: "glob", pattern: "**/*.transcript.md" }],
  query: {
    type: "tasks",
    predicate: {
      type: "and",
      predicates: [{ type: "checked" }, { type: "fieldExists", key: "done" }],
    },
  },
  actions: [moveDoneTranscriptTasksToDailyNoteAction],
};
