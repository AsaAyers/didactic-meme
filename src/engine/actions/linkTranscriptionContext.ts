import { existsSync, realpathSync } from "node:fs";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
} from "node:path";
import {
  buildMirroredTranscriptEmbed,
  deriveTranscriptTarget,
  hasEmbedAnywhere,
  insertEmbedBelowLine,
  type MarkdownLink,
} from "../../markdown/links.js";
import type { LinkActionContext } from "./types.js";

export type ResolvedTranscriptContext = {
  audioPath: string;
  transcriptPath: string;
  transcriptEmbed: string;
  transcriptExists: boolean;
};

function isWithinVault(vaultPath: string, filePath: string): boolean {
  const vaultRealPath = realpathSync(vaultPath);
  const fileRealPath = realpathSync(filePath);
  const rel = relative(vaultRealPath, fileRealPath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function resolveTranscriptContext(
  link: MarkdownLink | undefined,
  ctx: LinkActionContext | undefined,
): ResolvedTranscriptContext | undefined {
  if (!link || !ctx) return undefined;

  const audioPath = resolve(dirname(ctx.sourceNotePath), link.target);
  if (!existsSync(audioPath)) return undefined;
  if (!isWithinVault(ctx.vaultPath, audioPath)) return undefined;

  const transcriptTarget = deriveTranscriptTarget(link.target);
  const transcriptEmbed = buildMirroredTranscriptEmbed(link, transcriptTarget);
  const transcriptPath = resolve(
    dirname(audioPath),
    `${basename(audioPath, extname(audioPath))}.transcript.md`,
  );

  return {
    audioPath,
    transcriptPath,
    transcriptEmbed,
    transcriptExists: existsSync(transcriptPath),
  };
}

export function maybeInsertTranscriptEmbed(
  body: string,
  link: MarkdownLink | undefined,
  transcriptEmbed: string,
): string | undefined {
  if (!link || hasEmbedAnywhere(body, transcriptEmbed)) return undefined;
  return insertEmbedBelowLine(body, link.lineIndex, transcriptEmbed);
}
