import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import matter from 'gray-matter';
import type { Root } from 'mdast';

export function parseMarkdown(content: string): Root {
  const processor = unified().use(remarkParse).use(remarkGfm);
  return processor.parse(content) as Root;
}

export function stringifyMarkdown(tree: Root): string {
  const processor = unified().use(remarkStringify, { bullet: '-', listItemIndent: 'one' }).use(remarkGfm);
  return processor.stringify(tree);
}

export function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  const parsed = matter(raw);
  return { data: parsed.data as Record<string, unknown>, content: parsed.content };
}

export function stringifyFrontmatter(data: Record<string, unknown>, content: string): string {
  return matter.stringify(content, data);
}
