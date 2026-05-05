/**
 * Vault-level configuration for didactic-meme.
 *
 * The config file `.didatic-meme.json` lives at the vault root and lets users
 * customise which files each rule operates on by overriding its `sources`.
 *
 * Shape:
 *   {
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

export const zConfig = z.record(z.string(), zRuleConfig);

const zWatchConfig = z.object({
  /** Debounce duration in milliseconds. Defaults to 60000 (60 s). */
  debounce: z.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-rule configuration stored in `.didatic-meme.json`. */
export type RuleConfig = z.infer<typeof zRuleConfig>;

/** The full vault-level config: one entry per rule name. */
export type Config = z.infer<typeof zConfig>;

/** Watch-mode configuration stored under the `"watch"` key in `.didatic-meme.json`. */
export type WatchConfig = z.infer<typeof zWatchConfig>;

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
  return Object.fromEntries(specs.map((s) => [s.name, { sources: s.sources }]));
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
 * The reserved `"watch"` key is stripped before rule-config validation and
 * preserved verbatim on write-back so that watch settings are not lost.
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

  // Strip the reserved "watch" key before rule-config validation so that watch
  // settings do not cause a zod validation failure.
  const rawObj = parsed as Record<string, unknown>;
  const { watch: watchEntry, ...rulesOnlyParsed } = rawObj;

  // Validate with zod.
  const result = zConfig.safeParse(rulesOnlyParsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid ${CONFIG_FILENAME}:\n${issues}\nPlease fix or delete the file and re-run.`,
    );
  }

  const stored = result.data;

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
    // Preserve the "watch" entry verbatim when writing back.
    const toWrite =
      watchEntry !== undefined ? { watch: watchEntry, ...merged } : merged;
    await fs.writeFile(
      configPath,
      JSON.stringify(toWrite, null, 2) + "\n",
      "utf-8",
    );
  }

  return merged;
}

/**
 * Load just the `watch` section from the vault-level config file.
 *
 * Returns an empty object when the file does not exist or has no `watch` key.
 * Never throws — malformed `watch` values are silently ignored so that a
 * broken watch config does not prevent the CLI from starting.
 */
export async function loadWatchConfig(vaultPath: string): Promise<WatchConfig> {
  const configPath = join(vaultPath, CONFIG_FILENAME);
  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf-8");
  } catch {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result = zWatchConfig.safeParse(parsed["watch"]);
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}

/**
 * Apply a loaded Config to a set of RuleSpecs by replacing each spec's
 * `sources` array with the value from the config (when present).
 * Returns new spec objects; the originals are not mutated.
 */
export function applyConfig(specs: RuleSpec[], config: Config): RuleSpec[] {
  return specs.map((spec) => {
    const entry = config[spec.name];
    if (!entry) return spec;
    return { ...spec, sources: entry.sources };
  });
}
