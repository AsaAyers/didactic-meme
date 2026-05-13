import { watch } from "node:fs";
import { resolve, relative } from "node:path";

export type WatcherOptions = {
  /** Debounce duration in milliseconds. Defaults to 60 000 (60 s). */
  debounce?: number;
  /**
   * Extra vault-relative file paths to watch in addition to `*.md` files.
   * A file-change event is forwarded to `onProcess` whenever the changed
   * file's relative path appears in this set.  Useful for watching
   * configuration files such as `.onyx-vellum.json`.
   */
  additionalFiles?: string[];
};

/**
 * Creates a per-file debouncer.
 *
 * Each call to `notify(relPath, eventType)` starts (or resets) a timer for
 * that file.  After `debounceMs` milliseconds of inactivity the `onProcess`
 * callback is invoked with the relative path.
 *
 * Exported separately from `startVaultWatcher` so that unit tests can drive
 * the debounce logic directly without needing a real filesystem or timers.
 */
export function createFileDebouncer(
  debounceMs: number,
  onProcess: (relPath: string) => Promise<void>,
): {
  /**
   * Record a file-change event.  Starts or resets the debounce timer for
   * `relPath` and logs the event to the console.
   */
  notify: (relPath: string, eventType: string) => void;
  /** Cancel all pending timers and release resources. */
  dispose: () => void;
} {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const notify = (relPath: string, eventType: string): void => {
    console.log(`[watch] ${eventType}: ${relPath}`);

    const existing = timers.get(relPath);
    if (existing !== undefined) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      timers.delete(relPath);
      console.log(`[watch] Processing after idle: ${relPath}`);
      onProcess(relPath).catch((err: unknown) => {
        console.error(
          `[watch] Error processing ${relPath}:`,
          (err as Error).message,
        );
      });
    }, debounceMs);

    timers.set(relPath, timer);
  };

  const dispose = (): void => {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();
  };

  return { notify, dispose };
}

/**
 * Start watching the vault directory for Markdown file changes.
 *
 * Uses Node.js's native `fs.watch()` with `recursive: true` — no polling.
 * Each changed `.md` file is debounced independently; only files that have
 * been idle for `debounce` milliseconds trigger a `onProcess` call.
 *
 * @param vaultPath  Absolute path to the vault root to watch.
 * @param onProcess  Async callback invoked with the relative path of a
 *                   changed file once its debounce timer expires.
 * @param opts       Optional configuration (`debounce` in ms, default 60 000).
 * @returns          A stop function — call it to close the watcher and cancel
 *                   any pending timers.
 */
export function startVaultWatcher(
  vaultPath: string,
  onProcess: (relPath: string) => Promise<void>,
  opts: WatcherOptions = {},
): () => void {
  const debounceMs = opts.debounce ?? 60_000;
  const extraFiles = new Set(opts.additionalFiles ?? []);
  const debouncer = createFileDebouncer(debounceMs, onProcess);

  const watcher = watch(
    vaultPath,
    { recursive: true },
    (eventType, filename) => {
      if (!filename) return;

      // resolve + relative normalises any platform path separators.
      const absPath = resolve(vaultPath, filename);
      const relPath = relative(vaultPath, absPath);

      if (!relPath.endsWith(".md") && !extraFiles.has(relPath)) return;

      debouncer.notify(relPath, eventType ?? "change");
    },
  );

  return (): void => {
    watcher.close();
    debouncer.dispose();
  };
}
