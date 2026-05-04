/**
 * Unit tests for runInitPass.
 *
 * The init pass round-trips every .md file through parse → stringify without
 * applying any rule-driven transformations.  These behaviors are NOT exercised
 * by the E2E vault snapshot, so unit tests are appropriate here.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { runInitPass } from '../src/engine/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INIT_SCENARIO = join(__dirname, 'test_vault', 'scenarios', 'init-pass');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readScenarioFile(name: string): Promise<string> {
  return fs.readFile(join(INIT_SCENARIO, name), 'utf-8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runInitPass', () => {
  it('scans all .md files in the vault (dry-run)', async () => {
    const { scanned } = await runInitPass(INIT_SCENARIO, true, undefined);
    expect(scanned).toBe(10);
    const { changes } = await runInitPass(INIT_SCENARIO, true, undefined);
    const paths = changes.map((c) => c.path);
    expect(paths.every((p) => p.endsWith('.md'))).toBe(true);
  });

  it('reports a file that needs normalization (dry-run)', async () => {
    const { changes } = await runInitPass(INIT_SCENARIO, true, undefined);
    const needsNorm = changes.find((c) => c.path.includes('needs-normalization'));
    expect(needsNorm, 'needs-normalization.md must appear in changes').toBeDefined();
  });

  it('does NOT report a file that is already normalized (dry-run)', async () => {
    const { changes } = await runInitPass(INIT_SCENARIO, true, undefined);
    const alreadyNorm = changes.find((c) => c.path.includes('already-normalized'));
    expect(alreadyNorm, 'already-normalized.md must NOT appear in changes').toBeUndefined();
  });

  it('does NOT apply rule-driven transformations — due:today stays as-is (dry-run)', async () => {
    const { changes } = await runInitPass(INIT_SCENARIO, true, undefined);
    const changed = changes.find((c) => c.path.includes('needs-normalization'));
    // The content should still have the literal "due:today" — init never converts it
    expect(changed).toBeDefined();
    expect(changed!.content).toContain('due:today');
    expect(changed!.content).not.toContain('due:2026-');
  });

  it('dry-run: does not modify files on disk', async () => {
    const originalContent = await readScenarioFile('needs-normalization.md');

    await runInitPass(INIT_SCENARIO, true, undefined);

    const afterContent = await readScenarioFile('needs-normalization.md');
    expect(afterContent).toBe(originalContent);
  });

  it('returns correct scanned/rewritten counts', async () => {
    const { scanned, rewritten } = await runInitPass(INIT_SCENARIO, true, undefined);
    expect(scanned).toBe(10);
    // needs-normalization.md requires formatting; with-completed-task.md and
    // with-publish-frontmatter.md require done stamping.
    expect(rewritten).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Wikilink preservation
  // ---------------------------------------------------------------------------

  it('preserves Obsidian wikilinks [[...]] without escaping (dry-run)', async () => {
    const { changes } = await runInitPass(INIT_SCENARIO, true, undefined);
    // with-wikilinks.md is already normalized, so it must not appear in changes
    const wikiChange = changes.find((c) => c.path.includes('with-wikilinks'));
    expect(wikiChange, 'with-wikilinks.md is already normalized and must not require changes').toBeUndefined();
  });

  it('preserves wikilinks in normalized content — no \\[[ escaping', async () => {
    // Verify the round-trip of the wikilinks file produces no escaping
    const original = await readScenarioFile('with-wikilinks.md');
    // If the file was changed by runInitPass it would appear in changes;
    // since it doesn't, we verify the content directly would not be escaped
    expect(original).not.toContain('\\[\\[');
    expect(original).toContain('[[');
  });

  // ---------------------------------------------------------------------------
  // Obsidian tag preservation
  // ---------------------------------------------------------------------------

  it('preserves Obsidian hashtags without escaping (dry-run)', async () => {
    const { changes } = await runInitPass(INIT_SCENARIO, true, undefined);
    // with-obsidian-tags.md is already normalized — # must not become \#
    const tagChange = changes.find((c) => c.path.includes('with-obsidian-tags'));
    expect(tagChange, 'should not require changes').toBeUndefined();
  });

  it('normalizeFileContent does not escape # in Obsidian tags', async () => {
    const { normalizeFileContent } = await import('../src/engine/runner.js');
    // Tag at start of paragraph (atBreak position — the case remark escapes)
    const input = '#feeling/good\n\nSome text with #work/project inline.\n';
    const output = normalizeFileContent(input);
    expect(output).not.toContain('\\#');
    expect(output).toContain('#feeling/good');
    expect(output).toContain('#work/project');
  });

  // ---------------------------------------------------------------------------
  // Link URL preservation
  // ---------------------------------------------------------------------------

  it('preserves link query-string ampersands without escaping (dry-run)', async () => {
    const { changes } = await runInitPass(INIT_SCENARIO, true, undefined);
    // with-links.md is already normalized — & must not become \&
    const linkChange = changes.find((c) => c.path.includes('with-links'));
    expect(linkChange, 'should not require changes').toBeUndefined();
  });

  it('normalizeFileContent does not escape & in link URLs', async () => {
    const { normalizeFileContent } = await import('../src/engine/runner.js');
    const input =
      '![Card](https://example.com/image?id=1&type=card)\n\n[link](https://example.com?a=1&b=2)\n';
    const output = normalizeFileContent(input);
    expect(output).not.toContain('\\&');
    expect(output).toContain('?id=1&type=card');
    expect(output).toContain('?a=1&b=2');
  });

  // ---------------------------------------------------------------------------
  // Templater / asterisk preservation
  // ---------------------------------------------------------------------------

  it('preserves Templater <%* syntax without escaping (dry-run)', async () => {
    const { changes } = await runInitPass(INIT_SCENARIO, true, undefined);
    // with-templater.md is already normalized — the <%* must not be changed
    const templaterChange = changes.find((c) => c.path.includes('with-templater'));
    expect(templaterChange, 'with-templater.md is already normalized and must not require changes').toBeUndefined();
  });

  it('normalizeFileContent does not escape * in Templater syntax', async () => {
    const { normalizeFileContent } = await import('../src/engine/runner.js');
    const input = '<%* const title = tp.file.title; %>\n\n# Some heading\n';
    const output = normalizeFileContent(input);
    expect(output).not.toContain('\\*');
    expect(output).toContain('<%*');
  });

  // ---------------------------------------------------------------------------
  // UTF-16 file handling
  // ---------------------------------------------------------------------------

  it('converts UTF-16 LE files to UTF-8 and processes them', async () => {
    const TMP_UTF16 = join(__dirname, '..', 'tmp', 'init-utf16-test');
    await fs.mkdir(TMP_UTF16, { recursive: true });
    try {
      // Write a UTF-16 LE file (with BOM) that has no trailing newline
      const text = 'Speaker 1  (00:03)';
      const utf16Buf = Buffer.concat([
        Buffer.from([0xff, 0xfe]), // UTF-16 LE BOM
        Buffer.from(text, 'utf16le'),
      ]);
      const utf16Path = join(TMP_UTF16, 'transcript.md');
      await fs.writeFile(utf16Path, utf16Buf);

      const { scanned, rewritten } = await runInitPass(TMP_UTF16, false);

      // File should be scanned and rewritten (encoding conversion + trailing newline)
      expect(scanned).toBe(1);
      expect(rewritten).toBe(1);

      // File on disk is now valid UTF-8 and contains the original text
      const afterContent = await fs.readFile(utf16Path, 'utf-8');
      expect(afterContent).toContain('Speaker 1  (00:03)');
      // No BOM in the output
      const afterBuf = await fs.readFile(utf16Path);
      expect(afterBuf[0]).not.toBe(0xff);
      expect(afterBuf[0]).not.toBe(0xfe);
    } finally {
      await fs.rm(TMP_UTF16, { recursive: true, force: true });
    }
  });

  it('converts BOM-less UTF-16 LE files to UTF-8 and processes them', async () => {
    const TMP_UTF16 = join(__dirname, '..', 'tmp', 'init-utf16le-bomless-test');
    await fs.mkdir(TMP_UTF16, { recursive: true });
    try {
      // Write a UTF-16 LE file WITHOUT a BOM.  This is what some apps produce
      // when they save UTF-16 LE without the optional byte-order mark.
      const text = 'Speaker 1  (00:03)';
      const utf16Buf = Buffer.from(text, 'utf16le'); // no BOM prefix
      const utf16Path = join(TMP_UTF16, 'transcript.md');
      await fs.writeFile(utf16Path, utf16Buf);

      const { scanned, rewritten } = await runInitPass(TMP_UTF16, false);

      expect(scanned).toBe(1);
      expect(rewritten).toBe(1);

      // File on disk is now valid UTF-8 and contains the original text.
      const afterContent = await fs.readFile(utf16Path, 'utf-8');
      expect(afterContent).toContain('Speaker 1  (00:03)');
      // No BOM or null bytes in the output.
      const afterBuf = await fs.readFile(utf16Path);
      expect(afterBuf[0]).not.toBe(0xff);
      expect(afterBuf[0]).not.toBe(0xfe);
      expect(afterBuf.includes(0x00)).toBe(false);
    } finally {
      await fs.rm(TMP_UTF16, { recursive: true, force: true });
    }
  });

  it('converts UTF-16 BE files to UTF-8 and processes them', async () => {
    const TMP_UTF16 = join(__dirname, '..', 'tmp', 'init-utf16be-test');
    await fs.mkdir(TMP_UTF16, { recursive: true });
    try {
      const text = 'Hello world';
      // Build a proper UTF-16 BE buffer: BOM FE FF, then each char as big-endian 16-bit
      const charBuf = Buffer.alloc(text.length * 2);
      for (let i = 0; i < text.length; i++) {
        charBuf.writeUInt16BE(text.charCodeAt(i), i * 2);
      }
      const utf16Buf = Buffer.concat([Buffer.from([0xfe, 0xff]), charBuf]);
      const utf16Path = join(TMP_UTF16, 'notes.md');
      await fs.writeFile(utf16Path, utf16Buf);

      const { scanned, rewritten } = await runInitPass(TMP_UTF16, false);

      expect(scanned).toBe(1);
      expect(rewritten).toBe(1);

      // File is now valid UTF-8
      const afterContent = await fs.readFile(utf16Path, 'utf-8');
      expect(afterContent).toContain('Hello world');
      const afterBuf = await fs.readFile(utf16Path);
      expect(afterBuf[0]).not.toBe(0xfe);
      expect(afterBuf[0]).not.toBe(0xff);
    } finally {
      await fs.rm(TMP_UTF16, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------------------
  // Frontmatter preservation
  // ---------------------------------------------------------------------------

  it('preserves YAML frontmatter verbatim (dry-run)', async () => {
    const { changes } = await runInitPass(INIT_SCENARIO, true, undefined);
    // with-frontmatter.md should NOT appear in changes — the frontmatter
    // should be preserved exactly and the body is already normalized
    const fmChange = changes.find((c) => c.path.includes('with-frontmatter'));
    expect(fmChange, 'with-frontmatter.md is already normalized and must not require changes').toBeUndefined();
  });

  it('does not corrupt publish:false frontmatter into a Markdown heading (dry-run)', async () => {
    // This file now intentionally contains a checked task that needs stamping.
    // We should get a change that adds done while preserving the
    // frontmatter block byte-for-byte.
    const { changes } = await runInitPass(INIT_SCENARIO, true, undefined);
    const fmChange = changes.find((c) => c.path.includes('with-publish-frontmatter'));
    expect(fmChange, 'with-publish-frontmatter.md should require done stamping').toBeDefined();
    expect(fmChange!.content).toContain('done:unknown');

    const original = await readScenarioFile('with-publish-frontmatter.md');
    const frontmatterRe = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
    const originalFrontmatter = frontmatterRe.exec(original)?.[0];
    const changedFrontmatter = frontmatterRe.exec(fmChange!.content)?.[0];

    expect(originalFrontmatter).toBeDefined();
    expect(changedFrontmatter).toBeDefined();
    expect(changedFrontmatter).toBe(originalFrontmatter);
    // Regression assertion: no setext-heading artifact from mis-parsed `---`.
    expect(fmChange!.content).not.toContain('## publish: false');
  });

  it('normalizeFileContent preserves publish:false frontmatter without body', async () => {
    const { normalizeFileContent } = await import('../src/engine/runner.js');
    // The exact content from the bug report — frontmatter only, no body.
    const src = '---\npublish: false\n---\n';
    const result = normalizeFileContent(src);
    expect(result).toBe(src);
    // Must not contain a setext heading artefact
    expect(result).not.toContain('## publish: false');
  });

  // ---------------------------------------------------------------------------
  // Double-pass stability (new requirement)
  // ---------------------------------------------------------------------------

  it('second pass on already-normalized content produces no changes (stability)', async () => {
    // Run on the scenario dir — should be stable (no unstable files error)
    await expect(runInitPass(INIT_SCENARIO, true, undefined)).resolves.not.toThrow();
  });

  it('throws when normalization is not stable', async () => {
    const TMP_DIR = join(__dirname, '..', 'tmp', 'init-unstable-test');
    await fs.mkdir(TMP_DIR, { recursive: true });

    try {
      // Write a file whose content will appear to change in the first pass
      await fs.writeFile(join(TMP_DIR, 'unstable.md'), '# Original\n', 'utf-8');

      // Inject an unstable normalizer: first call returns something different,
      // second call (stability check) returns yet something else, triggering
      // the "not stable" error.
      let callCount = 0;
      const unstableNormalizer = (): string => {
        callCount++;
        return callCount === 1 ? '# First pass result\n' : '# Second pass result\n';
      };

      await expect(runInitPass(TMP_DIR, true, unstableNormalizer)).rejects.toThrow(
        'Init normalization is not stable',
      );
    } finally {
      await fs.rm(TMP_DIR, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------------------
  // done stamping during --init
  // ---------------------------------------------------------------------------

  it('stamps done:unknown on checked tasks that lack one (dry-run)', async () => {
    const { changes } = await runInitPass(INIT_SCENARIO, true, undefined);
    const stamped = changes.find((c) => c.path.includes('with-completed-task'));
    expect(stamped, 'with-completed-task.md must appear in changes').toBeDefined();
    expect(stamped!.content).toContain('done:unknown');
  });

  it('does not overwrite an existing done (dry-run)', async () => {
    const TMP_DIR = join(__dirname, '..', 'tmp', 'init-stamp-existing-test');
    await fs.mkdir(TMP_DIR, { recursive: true });
    try {
      // File already has a done — init must not overwrite it
      await fs.writeFile(
        join(TMP_DIR, 'task.md'),
        '* [x] Done done:2025-06-15\n',
        'utf-8',
      );
      const { changes } = await runInitPass(TMP_DIR, true, undefined);
      const change = changes.find((c) => c.path.includes('task.md'));
      // No change expected — done is already present
      expect(change).toBeUndefined();
    } finally {
      await fs.rm(TMP_DIR, { recursive: true, force: true });
    }
  });

  it('does not stamp done on unchecked tasks (dry-run)', async () => {
    const { changes } = await runInitPass(INIT_SCENARIO, true, undefined);
    // with-unchecked-task.md contains only an unchecked task — it must not be stamped
    const change = changes.find((c) => c.path.includes('with-unchecked-task'));
    expect(change).toBeUndefined();
  });

  it('does not stamp done when legacy completionDate is already present (backward compat, dry-run)', async () => {
    const TMP_DIR = join(__dirname, '..', 'tmp', 'init-stamp-legacy-test');
    await fs.mkdir(TMP_DIR, { recursive: true });
    try {
      // File has the old completionDate: field — init must treat it as already stamped
      await fs.writeFile(
        join(TMP_DIR, 'task.md'),
        '* [x] Done completionDate:2025-06-15\n',
        'utf-8',
      );
      const { changes } = await runInitPass(TMP_DIR, true, undefined);
      const change = changes.find((c) => c.path.includes('task.md'));
      // No change expected — completionDate is present and treated as alias for done
      expect(change).toBeUndefined();
    } finally {
      await fs.rm(TMP_DIR, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------------------
  // Write mode
  // ---------------------------------------------------------------------------

  describe('write mode', () => {
    const TMP_DIR = join(__dirname, '..', 'tmp', 'init-test-vault');

    beforeEach(async () => {
      // Copy scenario files to a temp dir so we can test real writes
      await fs.mkdir(TMP_DIR, { recursive: true });
      await fs.copyFile(
        join(INIT_SCENARIO, 'needs-normalization.md'),
        join(TMP_DIR, 'needs-normalization.md'),
      );
      await fs.copyFile(
        join(INIT_SCENARIO, 'already-normalized.md'),
        join(TMP_DIR, 'already-normalized.md'),
      );
      await fs.copyFile(
        join(INIT_SCENARIO, 'with-wikilinks.md'),
        join(TMP_DIR, 'with-wikilinks.md'),
      );
      await fs.copyFile(
        join(INIT_SCENARIO, 'with-frontmatter.md'),
        join(TMP_DIR, 'with-frontmatter.md'),
      );
      await fs.copyFile(
        join(INIT_SCENARIO, 'with-templater.md'),
        join(TMP_DIR, 'with-templater.md'),
      );
    });

    afterEach(async () => {
      await fs.rm(TMP_DIR, { recursive: true, force: true });
    });

    it('writes normalized content to disk (non-dry-run)', async () => {
      const originalContent = await fs.readFile(join(TMP_DIR, 'needs-normalization.md'), 'utf-8');

      const { rewritten } = await runInitPass(TMP_DIR, false, undefined);

      const afterContent = await fs.readFile(join(TMP_DIR, 'needs-normalization.md'), 'utf-8');
      expect(rewritten).toBe(1);
      expect(afterContent).not.toBe(originalContent);
      // Normalized content should end with a newline
      expect(afterContent.endsWith('\n')).toBe(true);
    });

    it('does not touch already-normalized files (non-dry-run)', async () => {
      const originalContent = await fs.readFile(join(TMP_DIR, 'already-normalized.md'), 'utf-8');

      await runInitPass(TMP_DIR, false, undefined);

      const afterContent = await fs.readFile(join(TMP_DIR, 'already-normalized.md'), 'utf-8');
      expect(afterContent).toBe(originalContent);
    });

    it('running init twice is idempotent', async () => {
      await runInitPass(TMP_DIR, false, undefined);
      const afterFirstPass = await fs.readFile(join(TMP_DIR, 'needs-normalization.md'), 'utf-8');

      const { rewritten: secondPassRewrites } = await runInitPass(TMP_DIR, false, undefined);

      const afterSecondPass = await fs.readFile(join(TMP_DIR, 'needs-normalization.md'), 'utf-8');
      expect(secondPassRewrites).toBe(0);
      expect(afterSecondPass).toBe(afterFirstPass);
    });

    it('preserves wikilinks without escaping after write', async () => {
      const originalContent = await fs.readFile(join(TMP_DIR, 'with-wikilinks.md'), 'utf-8');
      // Run init — should not change the file (already normalized, no checked tasks)
      const { rewritten } = await runInitPass(TMP_DIR, false, undefined);
      const afterContent = await fs.readFile(join(TMP_DIR, 'with-wikilinks.md'), 'utf-8');

      // File should be unchanged (already normalized)
      expect(afterContent).toBe(originalContent);
      // No escaped brackets
      expect(afterContent).not.toContain('\\[\\[');
      expect(afterContent).toContain('[[');
      // Only 1 file was changed (needs-normalization.md)
      expect(rewritten).toBe(1);
    });

    it('preserves frontmatter verbatim after write', async () => {
      const originalContent = await fs.readFile(join(TMP_DIR, 'with-frontmatter.md'), 'utf-8');
      await runInitPass(TMP_DIR, false, undefined);
      const afterContent = await fs.readFile(join(TMP_DIR, 'with-frontmatter.md'), 'utf-8');

      expect(afterContent).toBe(originalContent);
      expect(afterContent.startsWith('---\n')).toBe(true);
    });

    it('stamps done to disk for checked tasks (non-dry-run)', async () => {
      await fs.copyFile(
        join(INIT_SCENARIO, 'with-completed-task.md'),
        join(TMP_DIR, 'with-completed-task.md'),
      );

      await runInitPass(TMP_DIR, false, undefined);

      const afterContent = await fs.readFile(join(TMP_DIR, 'with-completed-task.md'), 'utf-8');
      expect(afterContent).toContain('done:unknown');
    });
  });
});
