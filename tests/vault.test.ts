/**
 * End-to-end snapshot test for the test vault.
 *
 * Every `.md` file in `tests/test_vault/` must have a companion
 * `.md.expected` file that describes the exact content the full rule
 * pipeline should produce for that file.  Files whose content is unchanged
 * by the pipeline have a `.md.expected` that is identical to their source.
 *
 * This test:
 *   1. Runs `runAllRules` in dry-run mode against the entire vault.
 *   2. Walks every `.md` file and resolves the expected output (staged change
 *      when the pipeline modifies the file, or the on-disk content otherwise).
 *   3. Asserts that the resolved output matches the corresponding `.md.expected`.
 *   4. Fails if any `.md` file is missing its `.md.expected` counterpart.
 *
 * To update a snapshot after an intentional change, edit the relevant
 * `.md.expected` file.  The pair of files serves as readable documentation:
 * a reader can open any scenario directory and immediately see what the
 * pipeline does to it.
 */
import { describe, it, expect } from 'vitest';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { walkMarkdownFiles } from '../src/engine/io.js';
import { runAllRules } from '../src/engine/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_VAULT = join(__dirname, 'test_vault');

// Pin the date so the test produces the same output regardless of when it runs.
const TODAY = new Date(2026, 4, 3); // 2026-05-03

describe('test vault — .md.expected snapshots', () => {
  it('every .md file matches its .md.expected counterpart', async () => {
    const { changes } = await runAllRules({
      vaultPath: TEST_VAULT,
      today: TODAY,
      dryRun: true,
      env: {},
    });

    // Map from absolute file path → content produced by the pipeline.
    const staged = new Map(changes.map((c) => [c.path, c.content]));

    const mdFiles = await walkMarkdownFiles(TEST_VAULT);

    const failures: string[] = [];

    for (const mdPath of mdFiles) {
      const expectedPath = `${mdPath}.expected`;
      const relPath = relative(TEST_VAULT, mdPath);

      // Every .md file must have a .md.expected counterpart.
      let expectedContent: string;
      try {
        expectedContent = await fs.readFile(expectedPath, 'utf-8');
      } catch {
        failures.push(`${relPath}: missing .md.expected file`);
        continue;
      }

      // Resolve the actual output: use the staged version if the pipeline
      // modified the file, otherwise fall back to the on-disk content.
      const actualContent = staged.has(mdPath)
        ? staged.get(mdPath)!
        : await fs.readFile(mdPath, 'utf-8');

      if (actualContent !== expectedContent) {
        failures.push(`${relPath}: output does not match .md.expected`);
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('does not modify any file on disk (dry-run guard)', async () => {
    const mdFiles = await walkMarkdownFiles(TEST_VAULT);
    const before = new Map(
      await Promise.all(
        mdFiles.map(async (p) => [p, await fs.readFile(p, 'utf-8')] as const),
      ),
    );

    await runAllRules({
      vaultPath: TEST_VAULT,
      today: TODAY,
      dryRun: true,
      env: {},
    });

    for (const [p, content] of before) {
      const after = await fs.readFile(p, 'utf-8');
      expect(after, `${relative(TEST_VAULT, p)} was modified on disk in dry-run mode`).toBe(
        content,
      );
    }
  });
});
