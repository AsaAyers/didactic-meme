import { Ollama } from "ollama";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { TaskSchema } from "../markdown/tasks.js";

const TranscriptTask = TaskSchema;

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
          "You are a highly accurate task extraction and summarization engine.",
          "Your primary function is to analyze transcripts of voice recordings and identify all actionable tasks mentioned within the transcript.",
          "Return ONLY JSON data conforming to the provided schema.  No introductory or concluding text, no Markdown formatting, and no extraneous information.",
          "You MUST accurately identify all tasks, even if they are implied.  Do not invent tasks. Focus on extracting explicit mentions and clear implications from the text.",
          "If no tasks are found, return an empty `tasks` array.",
          "Maintain original grammar and punctuation, correcting only errors.  Do not rephrase or rewrite the transcript’s meaning.",
          "File names should be lowercase kebab-case and end with .md.",
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
