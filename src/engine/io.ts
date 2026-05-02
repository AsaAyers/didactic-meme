import { promises as fs } from 'node:fs';

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

  stage(path: string, content: string): void {
    this.pending.set(path, content);
  }

  async commit(dryRun: boolean): Promise<string[]> {
    const written: string[] = [];
    for (const [filePath, content] of this.pending) {
      if (dryRun) {
        console.log(`[dry-run] Would write: ${filePath}`);
      } else {
        await fs.mkdir(filePath.substring(0, filePath.lastIndexOf('/')), { recursive: true });
        await fs.writeFile(filePath, content, 'utf-8');
      }
      written.push(filePath);
    }
    this.pending.clear();
    return written;
  }
}
