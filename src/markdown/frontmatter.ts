import matter from "gray-matter";

export type SplitFrontmatterResult = {
  data: Record<string, unknown>;
  body: string;
};

/**
 * Parse raw markdown into mutable frontmatter data + markdown body.
 * Files without frontmatter always return an empty object for `data`.
 */
export function splitFrontmatter(raw: string): SplitFrontmatterResult {
  const parsed = matter(raw);
  return {
    data: parsed.data as Record<string, unknown>,
    body: parsed.content,
  };
}

export function joinFrontmatter(
  parts: SplitFrontmatterResult,
  body: string,
): string {
  if (Object.keys(parts.data).length === 0) return body;
  return matter.stringify(body, parts.data);
}
