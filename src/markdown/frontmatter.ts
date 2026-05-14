import matter from "gray-matter";

/**
 * Matches a YAML frontmatter block at the start of a file, including
 * intentionally empty blocks like:
 * ---
 * ---
 */
const FRONTMATTER_RE = /^---\r?\n(?:[\s\S]*?\r?\n)?---(?:\r?\n|$)/;

export type SplitFrontmatterResult = {
  data: Record<string, unknown>;
  bodyPrefix: string;
  body: string;
};

/**
 * Parse raw markdown into mutable frontmatter data + markdown body.
 * Files without frontmatter always return an empty object for `data`.
 */
export function splitFrontmatter(raw: string): SplitFrontmatterResult {
  const fmMatch = FRONTMATTER_RE.exec(raw);
  if (!fmMatch) {
    return { data: {}, bodyPrefix: "", body: raw };
  }
  const parsed = matter(raw);
  const frontmatter = fmMatch[0];
  const rest = raw.slice(frontmatter.length);
  if (rest.startsWith("\r\n")) {
    return {
      data: parsed.data as Record<string, unknown>,
      bodyPrefix: "\r\n",
      body: rest.slice(2),
    };
  }
  if (rest.startsWith("\n")) {
    return {
      data: parsed.data as Record<string, unknown>,
      bodyPrefix: "\n",
      body: rest.slice(1),
    };
  }
  return {
    data: parsed.data as Record<string, unknown>,
    bodyPrefix: "",
    body: rest,
  };
}

export function joinFrontmatter(
  parts: SplitFrontmatterResult,
  body: string,
): string {
  if (Object.keys(parts.data).length === 0) return body;
  // gray-matter emits `---\n...\n---\n\n` when stringifying with empty content.
  // Keep exactly one trailing newline for frontmatter-only files so we emit
  // `---\n...\n---\n` rather than `---\n...\n---\n\n`.
  const serialized = matter.stringify("", parts.data);
  const frontmatterBlock = serialized.endsWith("\n\n")
    ? serialized.slice(0, -1)
    : serialized;
  if (body.length === 0) return frontmatterBlock;
  return `${frontmatterBlock}${parts.bodyPrefix}${body}`;
}
