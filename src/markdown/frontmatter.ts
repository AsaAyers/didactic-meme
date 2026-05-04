/** Matches a YAML frontmatter block at the start of a file. */
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

export type SplitFrontmatterResult = {
  frontmatter: string;
  bodyPrefix: string;
  body: string;
};

/**
 * Split file content into:
 * - `frontmatter`: YAML block including its closing delimiter line
 * - `bodyPrefix`: one extra leading newline (if present) between frontmatter and body
 * - `body`: markdown content to pass through the markdown pipeline
 *
 * The `frontmatter + bodyPrefix` fragment can be re-attached verbatim after
 * markdown processing, ensuring no rule can target frontmatter.
 */
export function splitFrontmatter(raw: string): SplitFrontmatterResult {
  const fmMatch = FRONTMATTER_RE.exec(raw);
  if (!fmMatch) {
    return { frontmatter: '', bodyPrefix: '', body: raw };
  }

  const frontmatter = fmMatch[0];
  const rest = raw.slice(frontmatter.length);

  if (rest.startsWith('\r\n')) {
    return { frontmatter, bodyPrefix: '\r\n', body: rest.slice(2) };
  }
  if (rest.startsWith('\n')) {
    return { frontmatter, bodyPrefix: '\n', body: rest.slice(1) };
  }

  return { frontmatter, bodyPrefix: '', body: rest };
}

export function joinFrontmatter(parts: SplitFrontmatterResult, body: string): string {
  if (!parts.frontmatter) return body;
  return `${parts.frontmatter}${parts.bodyPrefix}${body}`;
}
