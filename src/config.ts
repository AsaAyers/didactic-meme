/**
 * Vault-level configuration for onyx-vellum.
 *
 * The config file `.onyx-vellum.json` lives at the vault root and lets users
 * customise which files each rule operates on by overriding its `sources`.
 *
 * Shape:
 *   {
 *     "watch": { "debounce": 60000 },        // optional watch-mode settings
 *     "rules": {
 *       "<ruleName>": { "sources": [ ...Source objects... ] }
 *     }
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
  alertUrl: z.string().optional(),
  alertToken: z.string().optional(),
});

const zWatchConfig = z.object({
  /** Debounce duration in milliseconds. Defaults to 60000 (60 s). */
  debounce: z.number().int().positive().optional(),
  /**
   * Times at which the incompleteTaskAlert rule fires in watch mode.
   * Each entry must be a local-time "HH:MM" string (24-hour clock).
   * When omitted or empty, the alert never fires automatically in watch mode.
   */
  alertSchedule: z.array(z.string()).optional(),
});

/**
 * Full config schema:
 *   - optional watch config
 *   - required "rules" object keyed by rule name
 */
export const zConfig = z
  .object({
    watch: zWatchConfig.optional(),
    rules: z.record(z.string(), zRuleConfig),
  })
  .strict();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-rule configuration stored in `.onyx-vellum.json`. */
export type RuleConfig = z.infer<typeof zRuleConfig>;

/** Watch-mode configuration stored under the `"watch"` key in `.onyx-vellum.json`. */
export type WatchConfig = z.infer<typeof zWatchConfig>;

/** Full vault-level config for `.onyx-vellum.json`. */
export type Config = z.infer<typeof zConfig>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The file name of the vault-level config, relative to the vault root. */
export const CONFIG_FILENAME = ".onyx-vellum.json";

/**
 * Build the default rule configs from an array of RuleSpecs.
 * Each entry uses the spec's own `sources` array as its default.
 * Returns a plain record (no `watch` key) so callers can iterate values as
 * `RuleConfig` without needing to handle the `WatchConfig` union member.
 */
export function getDefaultConfig(specs: RuleSpec[]): Config["rules"] {
  return Object.fromEntries(specs.map((s) => [s.name, { sources: s.sources }]));
}

/**
 * Load (and if necessary create or augment) the vault-level config file.
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
  const defaultConfig: Config = { rules: defaults };

  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    // File does not exist — create it with all defaults.
    await fs.writeFile(
      configPath,
      JSON.stringify(defaultConfig, null, 2) + "\n",
      "utf-8",
    );
    return defaultConfig;
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

  const result = zConfig.safeParse(parsed);
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
  const merged: Config = { ...stored, rules: { ...stored.rules } };
  for (const [name, defaultEntry] of Object.entries(defaults)) {
    if (!(name in merged.rules)) {
      merged.rules[name] = defaultEntry;
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
    const entry = config.rules[spec.name];
    if (!entry) return spec;
    return { ...spec, sources: entry.sources };
  });
}
