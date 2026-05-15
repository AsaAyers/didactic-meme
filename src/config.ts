/**
 * Vault-level configuration for onyx-vellum.
 *
 * The config file `onyx-vellum.config.md` lives at the vault root and lets users
 * customise which files each rule operates on by overriding its `sources`.
 *
 * Shape:
 *   {
 *     "sources": [ ...Source objects... ],  // optional top-level sources (default for all rules)
 *     "watch": { "debounce": 60000 },        // optional watch-mode settings
 *     "rules": {
 *       "<ruleName>": { "sources": [ ...Source objects... ] }  // optional per-rule override
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
import matter from "gray-matter";
import { z } from "zod";
import { splitFrontmatter } from "./markdown/frontmatter.js";
import type { SplitFrontmatterResult } from "./markdown/frontmatter.js";
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
  sources: z.array(zSource).optional(),
  alertUrl: z.string().optional(),
  alertToken: z.string().optional(),
  dailyNotesFolder: z.string().optional(),
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
 *   - optional top-level sources (default for all rules that don't specify their own)
 *   - optional watch config
 *   - required "rules" object keyed by rule name
 */
export const zConfig = z
  .object({
    sources: z.array(zSource).optional(),
    watch: zWatchConfig.optional(),
    rules: z.record(z.string(), zRuleConfig),
  })
  .strict();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-rule configuration stored in `onyx-vellum.config.md` frontmatter. */
export type RuleConfig = z.infer<typeof zRuleConfig>;

/** Watch-mode configuration stored under the `"watch"` key in frontmatter. */
export type WatchConfig = z.infer<typeof zWatchConfig>;

/** Full vault-level config parsed from frontmatter. */
export type Config = z.infer<typeof zConfig>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The file name of the vault-level config, relative to the vault root. */
export const CONFIG_FILENAME = "onyx-vellum.config.md";

/** The default top-level sources used when creating a new config file. */
export const DEFAULT_SOURCES: Array<z.infer<typeof zSource>> = [
  { type: "glob", pattern: "**/*.md" },
];

/**
 * Build the default rule configs from an array of RuleSpecs.
 * Each entry is an empty config object — sources are supplied by the top-level
 * `sources` array in the config so they don't need to be repeated per rule.
 * Returns a plain record (no `watch` key) so callers can iterate values as
 * `RuleConfig` without needing to handle the `WatchConfig` union member.
 */
export function getDefaultConfig(specs: RuleSpec[]): Config["rules"] {
  return Object.fromEntries(specs.map((s) => [s.name, {}]));
}

/**
 * Load (and if necessary create or augment) the vault-level config file.
 *
 * Behaviour:
 *   - If the file does not exist: write the full default config and return it.
 *   - If the file exists but is valid: merge in defaults for any rule that is
 *     absent from the stored config, persist the merged result, and return it.
 *   - If the file exists but is invalid (bad frontmatter or fails zod validation):
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
  const defaultConfig: Config = { sources: DEFAULT_SOURCES, rules: defaults };

  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    // File does not exist — create it with all defaults.
    await fs.writeFile(configPath, serializeConfig(defaultConfig), "utf-8");
    return defaultConfig;
  }

  // Parse YAML frontmatter.
  let parsed: unknown;
  let parsedFrontmatter: SplitFrontmatterResult;
  try {
    parsedFrontmatter = splitFrontmatter(raw);
    parsed = parsedFrontmatter.data;
  } catch (err) {
    throw new Error(
      `Failed to parse frontmatter in ${CONFIG_FILENAME}: ${(err as Error).message}. ` +
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
  for (const [name] of Object.entries(defaults)) {
    if (!(name in merged.rules)) {
      merged.rules[name] = {};
      needsWrite = true;
    }
  }

  if (needsWrite) {
    await fs.writeFile(
      configPath,
      serializeConfig(
        merged,
        parsedFrontmatter.bodyPrefix,
        parsedFrontmatter.body,
      ),
      "utf-8",
    );
  }

  return merged;
}

/**
 * Apply a loaded Config to a set of RuleSpecs by resolving each spec's
 * effective `sources` array using the following priority:
 *   1. Per-rule `sources` from the config (highest priority).
 *   2. Top-level `sources` from the config (shared default for all rules).
 *   3. The spec's own built-in `sources` (fallback when neither is set).
 * Returns new spec objects; the originals are not mutated.
 */
export function applyConfig(specs: RuleSpec[], config: Config): RuleSpec[] {
  return specs.map((spec) => {
    const entry = config.rules[spec.name];
    if (entry?.sources !== undefined) {
      return { ...spec, sources: entry.sources };
    }
    if (config.sources !== undefined) {
      return { ...spec, sources: config.sources };
    }
    return spec;
  });
}

function serializeConfig(
  config: Config,
  bodyPrefix = "",
  body = "",
): string {
  const serialized = matter.stringify("", config as Record<string, unknown>);
  const serializedParts = splitFrontmatter(serialized);
  const trimmedLength =
    serializedParts.bodyPrefix.length + serializedParts.body.length;
  const frontmatterBlock =
    trimmedLength > 0 ? serialized.slice(0, -trimmedLength) : serialized;
  if (body.length === 0) return frontmatterBlock;
  return `${frontmatterBlock}${bodyPrefix}${body}`;
}
