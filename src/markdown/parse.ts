import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import matter from 'gray-matter';
import { visit, SKIP } from 'unist-util-visit';
import type { Root, Parent, Text } from 'mdast';
import type { Handlers } from 'mdast-util-to-markdown';

// ---------------------------------------------------------------------------
// Wikilink support
// ---------------------------------------------------------------------------

/**
 * Obsidian wikilink syntax: [[Page Name]] and ![[image.png]].
 * Remark treats these as plain text nodes but its default stringifier
 * escapes the `[` characters and `_` in filenames.  We protect wikilinks by
 * splitting text nodes that contain them into alternating `text` / `wikilink`
 * nodes before stringification so the raw value is emitted verbatim.
 */
interface WikilinkNode {
  type: 'wikilink';
  value: string;
}

const WIKILINK_RE = /(!?\[\[(?:[^\][]|\][^\]])*\]\])/g;

function splitWikilinkText(value: string): Array<Text | WikilinkNode> {
  const parts: Array<Text | WikilinkNode> = [];
  let lastIndex = 0;
  WIKILINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_RE.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: value.slice(lastIndex, match.index) } as Text);
    }
    parts.push({ type: 'wikilink', value: match[1] } as WikilinkNode);
    lastIndex = match.index + match[1].length;
  }
  if (lastIndex < value.length) {
    parts.push({ type: 'text', value: value.slice(lastIndex) } as Text);
  }
  return parts;
}

/**
 * Walk the AST and replace text nodes containing wikilinks with a mix of
 * `text` and `wikilink` nodes so the stringify step emits them verbatim.
 *
 * Mutates `tree` in place — call just before stringification.
 */
function protectWikilinks(tree: Root): void {
  visit(tree, 'text', (node: Text, index: number | undefined, parent: Parent | undefined) => {
    if (!parent || index === undefined) return;
    if (!node.value.includes('[[')) return;
    const parts = splitWikilinkText(node.value);
    if (parts.length === 1 && parts[0].type === 'text') return;
    (parent.children as Array<Text | WikilinkNode>).splice(index, 1, ...parts);
    return [SKIP, index + parts.length];
  });
}

/** mdast-util-to-markdown handlers: emit wikilink nodes as raw text. */
const wikilinkHandlers = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wikilink: (node: any) => (node as WikilinkNode).value,
} as Partial<Handlers>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseMarkdown(content: string): Root {
  const processor = unified().use(remarkParse).use(remarkGfm);
  return processor.parse(content) as Root;
}

export function stringifyMarkdown(tree: Root): string {
  protectWikilinks(tree);
  const processor = unified().use(remarkGfm).use(remarkStringify, {
    bullet: '-',
    listItemIndent: 'one',
    handlers: wikilinkHandlers,
  });
  return processor.stringify(tree);
}

export function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  const parsed = matter(raw);
  return { data: parsed.data as Record<string, unknown>, content: parsed.content };
}

export function stringifyFrontmatter(data: Record<string, unknown>, content: string): string {
  return matter.stringify(content, data);
}
