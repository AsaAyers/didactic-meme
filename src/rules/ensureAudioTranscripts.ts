import type { RuleSpec } from "./types.js";

export const ensureAudioTranscriptsSpec: RuleSpec = {
  name: "ensureAudioTranscripts",
  query: { type: "link", embed: true, extension: ".m4a" },
  sources: [{ type: "glob", pattern: "**/*.md" }],
  actions: [
    { type: "link.ensureSiblingTranscript" },
    { type: "link.requestTranscription" },
  ],
};
