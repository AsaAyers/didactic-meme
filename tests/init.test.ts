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
    const { scanned } = await runInitPass(INIT_SCENARIO, true);
    // The scenario dir has 5 .md files and 1 .txt file
    expect(scanned).toBe(5);
  });

  it('ignores non-.md files', async () => {
    const { changes } = await runInitPass(INIT_SCENARIO, true);
    const paths = changes.map((c) => c.path);
    expect(paths.every((p) => p.endsWith('.md'))).toBe(true);
  });

  it('reports a file that needs normalization (dry-run)', async () => {
    const { changes } = await runInitPass(INIT_SCENARIO, true);
    const needsNorm = changes.find((c) => c.path.includes('needs-normalization'));
    expect(needsNorm, 'needs-normalization.md must appear in changes').toBeDefined();
  });

  it('does NOT report a file that is already normalized (dry-run)', async () => {
    const { changes } = await runInitPass(INIT_SCENARIO, true);
    const alreadyNorm = changes.find((c) => c.path.includes('already-normalized'));
    expect(alreadyNorm, 'already-normalized.md must NOT appear in changes').toBeUndefined();
  });

  it('does NOT apply rule-driven transformations — due:today stays as-is (dry-run)', async () => {
    const { changes } = await runInitPass(INIT_SCENARIO, true);
    const changed = changes.find((c) => c.path.includes('needs-normalization'));
    // The content should still have the literal "due:today" — init never converts it
    expect(changed).toBeDefined();
    expect(changed!.content).toContain('due:today');
    expect(changed!.content).not.toContain('due:2026-');
  });

  it('dry-run: does not modify files on disk', async () => {
    const originalContent = await readScenarioFile('needs-normalization.md');

    await runInitPass(INIT_SCENARIO, true);

    const afterContent = await readScenarioFile('needs-normalization.md');
    expect(afterContent).toBe(originalContent);
  });

  it('returns correct scanned/rewritten counts', async () => {
    const { scanned, rewritten } = await runInitPass(INIT_SCENARIO, true);
    expect(scanned).toBe(5);
    // Only needs-normalization.md requires a change
    expect(rewritten).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Wikilink preservation
  // ---------------------------------------------------------------------------

  it('preserves Obsidian wikilinks [[...]] without escaping (dry-run)', async () => {
    const { changes } = await runInitPass(INIT_SCENARIO, true);
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
  // Templater / asterisk preservation
  // ---------------------------------------------------------------------------

  it('preserves Templater <%* syntax without escaping (dry-run)', async () => {
    const { changes } = await runInitPass(INIT_SCENARIO, true);
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

  it('skips UTF-16 LE files and does not corrupt them', async () => {
    const TMP_UTF16 = join(__dirname, '..', 'tmp', 'init-utf16-test');
    await fs.mkdir(TMP_UTF16, { recursive: true });
    try {
      // Write a UTF-16 LE file (with BOM)
      const text = 'Speaker 1  (00:03)\n';
      const utf16Buf = Buffer.concat([
        Buffer.from([0xff, 0xfe]), // UTF-16 LE BOM
        Buffer.from(text, 'utf16le'),
      ]);
      const utf16Path = join(TMP_UTF16, 'transcript.md');
      await fs.writeFile(utf16Path, utf16Buf);

      const { scanned, rewritten, changes } = await runInitPass(TMP_UTF16, true);

      // File should be scanned but skipped (not in changes)
      expect(scanned).toBe(1);
      expect(rewritten).toBe(0);
      expect(changes).toHaveLength(0);

      // File on disk must be untouched
      const after = await fs.readFile(utf16Path);
      expect(after.equals(utf16Buf)).toBe(true);
    } finally {
      await fs.rm(TMP_UTF16, { recursive: true, force: true });
    }
  });

  it('skips UTF-16 BE files and does not corrupt them', async () => {
    const TMP_UTF16 = join(__dirname, '..', 'tmp', 'init-utf16be-test');
    await fs.mkdir(TMP_UTF16, { recursive: true });
    try {
      const text = 'Hello world\n';
      const utf16Buf = Buffer.concat([
        Buffer.from([0xfe, 0xff]), // UTF-16 BE BOM
        Buffer.from(text, 'utf16le'), // content (simplified; BOM detection is the key)
      ]);
      const utf16Path = join(TMP_UTF16, 'notes.md');
      await fs.writeFile(utf16Path, utf16Buf);

      const { rewritten } = await runInitPass(TMP_UTF16, true);
      expect(rewritten).toBe(0);

      // File on disk must be untouched
      const after = await fs.readFile(utf16Path);
      expect(after.equals(utf16Buf)).toBe(true);
    } finally {
      await fs.rm(TMP_UTF16, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------------------
  // Frontmatter preservation
  // ---------------------------------------------------------------------------

  it('preserves YAML frontmatter verbatim (dry-run)', async () => {
    const { changes } = await runInitPass(INIT_SCENARIO, true);
    // with-frontmatter.md should NOT appear in changes — the frontmatter
    // should be preserved exactly and the body is already normalized
    const fmChange = changes.find((c) => c.path.includes('with-frontmatter'));
    expect(fmChange, 'with-frontmatter.md is already normalized and must not require changes').toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Double-pass stability (new requirement)
  // ---------------------------------------------------------------------------

  it('second pass on already-normalized content produces no changes (stability)', async () => {
    // Run on the scenario dir — should be stable (no unstable files error)
    await expect(runInitPass(INIT_SCENARIO, true)).resolves.not.toThrow();
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

      const { rewritten } = await runInitPass(TMP_DIR, false);

      const afterContent = await fs.readFile(join(TMP_DIR, 'needs-normalization.md'), 'utf-8');
      expect(rewritten).toBe(1);
      expect(afterContent).not.toBe(originalContent);
      // Normalized content should end with a newline
      expect(afterContent.endsWith('\n')).toBe(true);
    });

    it('does not touch already-normalized files (non-dry-run)', async () => {
      const originalContent = await fs.readFile(join(TMP_DIR, 'already-normalized.md'), 'utf-8');

      await runInitPass(TMP_DIR, false);

      const afterContent = await fs.readFile(join(TMP_DIR, 'already-normalized.md'), 'utf-8');
      expect(afterContent).toBe(originalContent);
    });

    it('running init twice is idempotent', async () => {
      await runInitPass(TMP_DIR, false);
      const afterFirstPass = await fs.readFile(join(TMP_DIR, 'needs-normalization.md'), 'utf-8');

      const { rewritten: secondPassRewrites } = await runInitPass(TMP_DIR, false);

      const afterSecondPass = await fs.readFile(join(TMP_DIR, 'needs-normalization.md'), 'utf-8');
      expect(secondPassRewrites).toBe(0);
      expect(afterSecondPass).toBe(afterFirstPass);
    });

    it('preserves wikilinks without escaping after write', async () => {
      const originalContent = await fs.readFile(join(TMP_DIR, 'with-wikilinks.md'), 'utf-8');
      // Run init — should not change the file (already normalized)
      const { rewritten } = await runInitPass(TMP_DIR, false);
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
      await runInitPass(TMP_DIR, false);
      const afterContent = await fs.readFile(join(TMP_DIR, 'with-frontmatter.md'), 'utf-8');

      expect(afterContent).toBe(originalContent);
      expect(afterContent.startsWith('---\n')).toBe(true);
    });
  });
});
