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

// ---------------------------------------------------------------------------
// Inert-asterisk protection
// ---------------------------------------------------------------------------

/**
 * remark-stringify escapes every `*` in phrasing context, even ones that can
 * never form emphasis.  We protect "inert" asterisks — those that cannot be
 * part of a valid emphasis pair — by splitting their text nodes into
 * `text` / `rawAsterisk` nodes before stringification.  The `rawAsterisk`
 * handler emits `*` verbatim, preserving constructs such as Templater's
 * `<%* … %>` and angle-bracket tags like `<* … *>`.
 */
interface RawAsteriskNode {
  type: 'rawAsterisk';
}

// ASCII punctuation characters used by the CommonMark flanking-delimiter rules.
const ASCII_PUNCT_RE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

/**
 * Compute the left- and right-flanking status of a single `*` delimiter
 * given the characters immediately before and after it.
 * Pass an empty string for `prev`/`next` to represent start/end of value.
 */
function asteriskFlanking(
  prev: string,
  next: string,
): { left: boolean; right: boolean } {
  const prevIsWs = prev === '' || /\s/.test(prev);
  const nextIsWs = next === '' || /\s/.test(next);
  const prevIsPunct = prev !== '' && ASCII_PUNCT_RE.test(prev);
  const nextIsPunct = next !== '' && ASCII_PUNCT_RE.test(next);

  // CommonMark spec §6.2 (emphasis):
  //   Left-flanking:  not followed by whitespace  AND
  //                   (not followed by punctuation  OR  preceded by ws/punct)
  //   Right-flanking: not preceded by whitespace  AND
  //                   (not preceded by punctuation OR  followed by ws/punct)
  const left = !nextIsWs && (!nextIsPunct || prevIsWs || prevIsPunct);
  const right = !prevIsWs && (!prevIsPunct || nextIsWs || nextIsPunct);
  return { left, right };
}

/**
 * Returns the set of positions within `value` where `*` is "inert" — i.e. it
 * cannot be part of an emphasis pair and may be emitted verbatim.
 *
 * Start and end of the string are treated as whitespace for boundary analysis.
 * Asterisks at potential line-break positions (position 0 or after `\n`) that
 * are followed by a space/tab/newline/`*` are excluded: the `atBreak` unsafe
 * rule in remark-stringify must keep those escaped to prevent accidental list
 * items from being created.
 */
function inertAsteriskPositions(value: string): Set<number> {
  interface AsteriskInfo {
    pos: number;
    left: boolean;
    right: boolean;
  }
  const asts: AsteriskInfo[] = [];

  for (let i = 0; i < value.length; i++) {
    if (value[i] !== '*') continue;

    const prev = i > 0 ? value[i - 1] : '';
    const next = i < value.length - 1 ? value[i + 1] : '';

    // Exclude * at line-break boundaries that match the atBreak unsafe rule.
    if ((i === 0 || prev === '\n') && /[ \t\r\n*]/.test(next === '' ? ' ' : next)) {
      continue;
    }

    const { left, right } = asteriskFlanking(prev, next);
    asts.push({ pos: i, left, right });
  }

  // Greedily pair the first left-flanking opener with the nearest subsequent
  // right-flanking closer.  Unpaired * are inert.
  const paired = new Set<number>();
  for (let i = 0; i < asts.length; i++) {
    if (!asts[i].left || paired.has(asts[i].pos)) continue;
    for (let j = i + 1; j < asts.length; j++) {
      if (!asts[j].right || paired.has(asts[j].pos)) continue;
      paired.add(asts[i].pos);
      paired.add(asts[j].pos);
      break;
    }
  }

  const inert = new Set<number>();
  for (const a of asts) {
    if (!paired.has(a.pos)) inert.add(a.pos);
  }
  return inert;
}

/**
 * Walk the AST and split text nodes that contain inert `*` characters into
 * alternating `text` / `rawAsterisk` nodes so the stringify step emits the
 * asterisks verbatim without backslash-escaping.
 *
 * Mutates `tree` in place — call just before stringification.
 */
function protectInertAsterisks(tree: Root): void {
  visit(tree, 'text', (node: Text, index: number | undefined, parent: Parent | undefined) => {
    if (!parent || index === undefined) return;
    if (!node.value.includes('*')) return;

    const inert = inertAsteriskPositions(node.value);
    if (inert.size === 0) return;

    const parts: Array<Text | RawAsteriskNode> = [];
    let lastIdx = 0;
    for (let i = 0; i < node.value.length; i++) {
      if (inert.has(i)) {
        if (i > lastIdx) {
          parts.push({ type: 'text', value: node.value.slice(lastIdx, i) } as Text);
        }
        parts.push({ type: 'rawAsterisk' } as RawAsteriskNode);
        lastIdx = i + 1;
      }
    }
    if (lastIdx < node.value.length) {
      parts.push({ type: 'text', value: node.value.slice(lastIdx) } as Text);
    }
    if (parts.length <= 1) return;

    (parent.children as Array<Text | RawAsteriskNode>).splice(index, 1, ...parts);
    return [SKIP, index + parts.length];
  });
}

// ---------------------------------------------------------------------------
// mdast-util-to-markdown handlers
// ---------------------------------------------------------------------------

/** Emit custom nodes verbatim, without any escaping. */
const customHandlers = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wikilink: (node: any) => (node as WikilinkNode).value,
  rawAsterisk: () => '*',
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
  protectInertAsterisks(tree);
  const processor = unified().use(remarkGfm).use(remarkStringify, {
    bullet: '*',
    listItemIndent: 'one',
    handlers: customHandlers,
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
