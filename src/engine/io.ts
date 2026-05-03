import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Recursively collect every file under `dir`, sorted lexicographically so
 * results are deterministic across OS/filesystem implementations.
 */
async function walkDirectory(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const name = entry.name as string;
      const fullPath = join(dir, name);
      if (entry.isDirectory() && !name.startsWith('.')) {
        results.push(...(await walkDirectory(fullPath)));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or is not accessible — skip silently.
  }
  return results;
}

/** Return all `.md` files under `dir`, sorted lexicographically. */
export async function walkMarkdownFiles(dir: string): Promise<string[]> {
  const all = await walkDirectory(dir);
  return all.filter((f) => f.endsWith('.md'));
}

export async function readFile(path: string): Promise<string> {
  try {
    return await fs.readFile(path, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw err;
  }
}

export class FileWriteManager {
  private pending: Map<string, string> = new Map();

  /**
   * Read a file through the transform queue: if the file has been staged by an
   * earlier rule in this run, return the staged content so the current rule sees
   * the accumulated in-memory state rather than the (potentially stale) disk copy.
   * Falls back to the real file on disk when no staged version exists.
   */
  async read(path: string): Promise<string> {
    const staged = this.pending.get(path);
    if (staged !== undefined) return staged;
    return readFile(path);
  }

  stage(path: string, content: string): void {
    this.pending.set(path, content);
  }

  /**
   * Flush all staged changes.
   * In dry-run mode, calls `log` for each file instead of writing to disk.
   * Returns the full list of staged changes (path + final content).
   *
   * @param log  Line-emitting function; defaults to console.log.  Pass a
   *             collecting function to capture output for testing.
   */
  async commit(
    dryRun: boolean,
    log: (msg: string) => void = console.log,
  ): Promise<Array<{ path: string; content: string }>> {
    const changes: Array<{ path: string; content: string }> = [];
    for (const [filePath, content] of this.pending) {
      if (dryRun) {
        log(`[dry-run] Would write: ${filePath}`);
      } else {
        await fs.mkdir(dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, 'utf-8');
      }
      changes.push({ path: filePath, content });
    }
    this.pending.clear();
    return changes;
  }
}
