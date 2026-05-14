import { Ollama } from "ollama";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const TranscriptTask = z.object({
  title: z.string().describe("Short imperative title for the task."),
  dueDate: z
    .string()
    .nullable()
    .describe(
      "Due date in YYYY-MM-DD format if explicitly mentioned, otherwise null.",
    ),
  details: z
    .string()
    .nullable()
    .describe("Relevant context from the transcript."),
});

const TranscriptResult = z.object({
  filename: z
    .string()
    .regex(/^[a-z0-9][a-z0-9._-]*\.md$/)
    .describe("Filesystem-safe kebab-case markdown filename ending in .md."),

  summary: z.string().describe("Concise summary of what was discussed."),

  cleanedTranscript: z
    .string()
    .describe(
      "Grammatically cleaned transcript. Preserve meaning, speaker labels, decisions, and uncertainty. Do not invent content.",
    ),

  tasks: z
    .array(TranscriptTask)
    .describe(
      "Tasks explicitly mentioned or clearly implied by the transcript. Empty array if none.",
    ),
});

export type TranscriptResult = z.infer<typeof TranscriptResult>;

const ollama = new Ollama({
  host: process.env.OLLAMA_HOST ?? "http://ollama-api:11434",
});

export async function processTranscript(
  rawTranscript: string,
): Promise<TranscriptResult> {
  const model = process.env.OLLAMA_MODEL ?? "gemma3";

  const schema = zodToJsonSchema(TranscriptResult, {
    name: "TranscriptResult",
  });

  const response = await ollama.chat({
    model,
    stream: false,
    format: schema,

    options: {
      temperature: 0,
    },

    messages: [
      {
        role: "system",
        content: [
          "You process transcripts of voice recordings.",
          "Return only JSON matching the provided schema.",
          "Do not wrap the result in Markdown.",
          "Do not invent tasks, dates, or decisions.",
          "If there are no tasks, return an empty tasks array.",
          "Do not invent tasks from context. Only include tasks explicitly mentioned or clearly implied by the transcript.",
          "Clean grammar and punctuation, but preserve the original meaning.",
          "For filenames, use lowercase kebab-case and end with .md.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "Process this transcript.",
          "",
          "Required output:",
          "- filename",
          "- summary",
          "- cleanedTranscript",
          "- tasks",
          "",
          "JSON schema:",
          JSON.stringify(schema, null, 2),
          "",
          "Transcript:",
          rawTranscript,
        ].join("\n"),
      },
    ],
  });

  const content = response.message.content;

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Ollama returned invalid JSON:\n${content}`);
  }

  return TranscriptResult.parse(parsed);
}
