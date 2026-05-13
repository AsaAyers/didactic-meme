import { dirname, join, resolve } from "node:path";

const DEFAULT_STATE_DIRNAME = ".didactic-meme-state";

export function resolveStateDir(
  env: NodeJS.ProcessEnv,
  vaultPath: string,
): string {
  const configured = env["STATE_DIR"];
  return configured
    ? resolve(configured)
    : join(dirname(vaultPath), DEFAULT_STATE_DIRNAME);
}
