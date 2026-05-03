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
    // The scenario dir has 2 .md files and 1 .txt file
    expect(scanned).toBe(2);
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
    expect(scanned).toBe(2);
    // Only needs-normalization.md requires a change
    expect(rewritten).toBe(1);
  });

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
  });
});
