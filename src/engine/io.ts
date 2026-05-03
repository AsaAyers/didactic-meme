import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

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
   * In dry-run mode, logs what would be written without touching the filesystem.
   * Returns the full list of staged changes (path + final content) so callers
   * can inspect the output — useful for integration tests.
   */
  async commit(dryRun: boolean): Promise<Array<{ path: string; content: string }>> {
    const changes: Array<{ path: string; content: string }> = [];
    for (const [filePath, content] of this.pending) {
      if (dryRun) {
        console.log(`[dry-run] Would write: ${filePath}`);
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
