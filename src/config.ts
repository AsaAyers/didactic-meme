/**
 * Vault-level configuration for didactic-meme.
 *
 * The config file `.didatic-meme.json` lives at the vault root and lets users
 * customise which files each rule operates on by overriding its `sources`.
 *
 * Shape:
 *   {
 *     "watch": { "debounce": 60000 },        // optional watch-mode settings
 *     "<ruleName>": { "sources": [ ...Source objects... ] },
 *     ...
 *   }
 *
 * When the file does not exist it is created automatically with the default
 * sources for every registered rule.  When a rule is present in the registry
 * but missing from the on-disk file (e.g. after upgrading to a version that
 * ships a new rule) its defaults are merged in and the file is persisted.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { RuleSpec } from "./rules/types.js";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const zGlobSource = z.object({
  type: z.literal("glob"),
  pattern: z.string(),
  exclude: z.array(z.string()).optional(),
});

const zPathSource = z.object({
  type: z.literal("path"),
  value: z.string(),
});

export const zSource = z.discriminatedUnion("type", [zGlobSource, zPathSource]);

const zRuleConfig = z.object({
  sources: z.array(zSource),
});

const zWatchConfig = z.object({
  /** Debounce duration in milliseconds. Defaults to 60000 (60 s). */
  debounce: z.number().int().positive().optional(),
});

/**
 * Full config schema: explicitly knows about the `watch` key (validated as
 * WatchConfig) plus a catchall that validates every other key as a RuleConfig.
 * This means unknown keys and malformed watch values are caught by Zod rather
 * than being silently ignored.
 */
export const zConfig = z.object({ watch: zWatchConfig.optional() }).catchall(
  zRuleConfig,
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-rule configuration stored in `.didatic-meme.json`. */
export type RuleConfig = z.infer<typeof zRuleConfig>;

/** Watch-mode configuration stored under the `"watch"` key in `.didatic-meme.json`. */
export type WatchConfig = z.infer<typeof zWatchConfig>;

/**
 * The full vault-level config: an optional `watch` entry plus one entry per
 * rule name.  Defined manually rather than with `z.infer` to avoid TypeScript's
 * index-signature / known-key intersection conflict.
 */
export type Config = {
  watch?: WatchConfig;
  [key: string]: RuleConfig | WatchConfig | undefined;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The file name of the vault-level config, relative to the vault root. */
export const CONFIG_FILENAME = ".didatic-meme.json";

/**
 * Build the default config from an array of RuleSpecs.
 * Each entry uses the spec's own `sources` array as its default.
 */
export function getDefaultConfig(specs: RuleSpec[]): Config {
  return Object.fromEntries(
    specs.map((s) => [s.name, { sources: s.sources }]),
  ) as Config;
}

/**
 * Load (and if necessary create or migrate) the vault-level config file.
 *
 * Behaviour:
 *   - If the file does not exist: write the full default config and return it.
 *   - If the file exists but is valid: merge in defaults for any rule that is
 *     absent from the stored config, persist the merged result, and return it.
 *   - If the file exists but is invalid (bad JSON or fails zod validation):
 *     throw a descriptive error so the user knows they must fix the file.
 *
 * The `watch` key is validated as a WatchConfig by `zConfig` and is preserved
 * in the returned value so callers can read `config.watch` directly.
 *
 * @param vaultPath  Absolute path to the vault root.
 * @param specs      All registered RuleSpecs (used to derive defaults).
 * @returns          The validated (and possibly augmented) config.
 */
export async function loadConfig(
  vaultPath: string,
  specs: RuleSpec[],
): Promise<Config> {
  const configPath = join(vaultPath, CONFIG_FILENAME);
  const defaults = getDefaultConfig(specs);

  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    // File does not exist — create it with all defaults.
    await fs.writeFile(
      configPath,
      JSON.stringify(defaults, null, 2) + "\n",
      "utf-8",
    );
    return defaults;
  }

  // Parse JSON.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse ${CONFIG_FILENAME}: ${(err as Error).message}. ` +
        `Please fix or delete the file and re-run.`,
    );
  }

  // Validate the whole config — zConfig knows about `watch` (WatchConfig) and
  // validates all other keys as RuleConfig via catchall.
  const result = zConfig.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid ${CONFIG_FILENAME}:\n${issues}\nPlease fix or delete the file and re-run.`,
    );
  }

  // Cast: z.infer of catchall creates a TypeScript intersection that conflicts
  // with our manual Config type — the runtime shape is correct.
  const stored = result.data as unknown as Config;

  // Merge in defaults for any rule not yet present in the file.
  let needsWrite = false;
  const merged: Config = { ...stored };
  for (const [name, defaultEntry] of Object.entries(defaults)) {
    if (!(name in merged)) {
      merged[name] = defaultEntry;
      needsWrite = true;
    }
  }

  if (needsWrite) {
    await fs.writeFile(
      configPath,
      JSON.stringify(merged, null, 2) + "\n",
      "utf-8",
    );
  }

  return merged;
}

/**
 * Apply a loaded Config to a set of RuleSpecs by replacing each spec's
 * `sources` array with the value from the config (when present).
 * Returns new spec objects; the originals are not mutated.
 */
export function applyConfig(specs: RuleSpec[], config: Config): RuleSpec[] {
  return specs.map((spec) => {
    const entry = config[spec.name];
    // Skip entries that are missing or do not have a `sources` key (e.g. the
    // `watch` entry, which is never a spec name in practice).
    if (!entry || !("sources" in entry)) return spec;
    return { ...spec, sources: (entry as RuleConfig).sources };
  });
}
