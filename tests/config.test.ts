/**
 * Tests for the vault-level config module (src/config.ts).
 *
 * These tests exercise behaviour that the E2E vault run does not cover:
 *   - Creating a missing config file with all defaults.
 *   - Merging defaults for new rules into an existing (outdated) config.
 *   - Rejecting invalid config (bad types caught by zod).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadConfig,
  getDefaultConfig,
  CONFIG_FILENAME,
} from "../src/config.js";
import type { RuleSpec } from "../src/rules/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SPEC_A: RuleSpec = {
  name: "specA",
  sources: [{ type: "glob", pattern: "**/*.md" }],
  query: { type: "tasks" },
  actions: [],
};

const SPEC_B: RuleSpec = {
  name: "specB",
  sources: [
    { type: "glob", pattern: "notes/**/*.md", exclude: ["archive/**"] },
  ],
  query: { type: "tasks" },
  actions: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempVault: string;

beforeEach(async () => {
  tempVault = await fs.mkdtemp(join(tmpdir(), "didatic-meme-config-test-"));
});

afterEach(async () => {
  await fs.rm(tempVault, { recursive: true, force: true });
});

function configPath(): string {
  return join(tempVault, CONFIG_FILENAME);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadConfig", () => {
  it("creates the config file with all defaults when it does not exist", async () => {
    const config = await loadConfig(tempVault, [SPEC_A, SPEC_B]);

    // Returned value equals the defaults.
    expect(config).toEqual({ rules: getDefaultConfig([SPEC_A, SPEC_B]) });

    // File was written to disk.
    const written = JSON.parse(await fs.readFile(configPath(), "utf-8"));
    expect(written).toEqual({
      rules: {
        specA: { sources: [{ type: "glob", pattern: "**/*.md" }] },
        specB: {
          sources: [
            { type: "glob", pattern: "notes/**/*.md", exclude: ["archive/**"] },
          ],
        },
      },
    });
  });

  it("returns the stored config when it already contains all known rules", async () => {
    const customSources = [
      { type: "glob" as const, pattern: "custom/**/*.md" },
    ];
    const initial = {
      rules: {
        specA: { sources: customSources },
        specB: { sources: [{ type: "glob", pattern: "notes/**/*.md" }] },
      },
    };
    await fs.writeFile(configPath(), JSON.stringify(initial), "utf-8");

    const config = await loadConfig(tempVault, [SPEC_A, SPEC_B]);

    // Custom sources are preserved.
    expect(config.rules.specA.sources).toEqual(customSources);
  });

  it("merges default sources for rules missing from an outdated config", async () => {
    // Config only has specA — specB is a "new rule" not yet in the file.
    const initial = {
      rules: {
        specA: { sources: [{ type: "glob", pattern: "**/*.md" }] },
      },
    };
    await fs.writeFile(configPath(), JSON.stringify(initial), "utf-8");

    const config = await loadConfig(tempVault, [SPEC_A, SPEC_B]);

    // specB now has its default sources.
    expect(config.rules.specB).toEqual({ sources: SPEC_B.sources });

    // The merged result was written back to disk.
    const written = JSON.parse(await fs.readFile(configPath(), "utf-8"));
    expect(written.rules).toHaveProperty("specB");
  });

  it("throws a descriptive error when the config contains invalid JSON", async () => {
    await fs.writeFile(configPath(), "{ this is not json }", "utf-8");

    await expect(loadConfig(tempVault, [SPEC_A])).rejects.toThrow(
      CONFIG_FILENAME,
    );
  });

  it("throws a descriptive error when the config fails zod validation", async () => {
    // "sources" must be an array of Source objects — a string is invalid.
    const bad = { rules: { specA: { sources: "not-an-array" } } };
    await fs.writeFile(configPath(), JSON.stringify(bad), "utf-8");

    await expect(loadConfig(tempVault, [SPEC_A])).rejects.toThrow(
      CONFIG_FILENAME,
    );
  });

  it("throws a descriptive error when a source has an unknown type", async () => {
    const bad = {
      rules: { specA: { sources: [{ type: "unknown", pattern: "**" }] } },
    };
    await fs.writeFile(configPath(), JSON.stringify(bad), "utf-8");

    await expect(loadConfig(tempVault, [SPEC_A])).rejects.toThrow(
      CONFIG_FILENAME,
    );
  });

  it("validates and returns the 'watch' key as part of the config", async () => {
    // A config with a "watch" section plus a rule config should parse without
    // error — zConfig knows about `watch` via its explicit schema.
    const initial = {
      watch: { debounce: 5000 },
      rules: {
        specA: { sources: [{ type: "glob", pattern: "**/*.md" }] },
      },
    };
    await fs.writeFile(configPath(), JSON.stringify(initial), "utf-8");

    const config = await loadConfig(tempVault, [SPEC_A, SPEC_B]);

    // Rule config is returned correctly.
    expect(config.rules.specA.sources).toEqual([
      { type: "glob", pattern: "**/*.md" },
    ]);
    // Watch config is returned as part of the config.
    expect(config.watch).toEqual({ debounce: 5000 });
  });

  it("accepts and returns alertSchedule in the watch config", async () => {
    const initial = {
      watch: { debounce: 5000, alertSchedule: ["08:00", "18:00"] },
      rules: {
        specA: { sources: [{ type: "glob", pattern: "**/*.md" }] },
      },
    };
    await fs.writeFile(configPath(), JSON.stringify(initial), "utf-8");

    const config = await loadConfig(tempVault, [SPEC_A]);

    expect(config.watch).toEqual({
      debounce: 5000,
      alertSchedule: ["08:00", "18:00"],
    });
  });

  it("rejects an invalid 'watch' value via zod validation", async () => {
    // debounce must be a positive integer — a string is invalid.
    const bad = {
      watch: { debounce: "not-a-number" },
      rules: {
        specA: { sources: [{ type: "glob", pattern: "**/*.md" }] },
      },
    };
    await fs.writeFile(configPath(), JSON.stringify(bad), "utf-8");

    await expect(loadConfig(tempVault, [SPEC_A])).rejects.toThrow(
      CONFIG_FILENAME,
    );
  });

  it("preserves the 'watch' key when writing back new defaults", async () => {
    // Config has watch section but is missing specB — loadConfig will add specB
    // and write the merged result.  The watch key must survive the write-back.
    const initial = {
      watch: { debounce: 3000 },
      rules: {
        specA: { sources: [{ type: "glob", pattern: "**/*.md" }] },
      },
    };
    await fs.writeFile(configPath(), JSON.stringify(initial), "utf-8");

    const config = await loadConfig(tempVault, [SPEC_A, SPEC_B]);

    expect(config.watch).toEqual({ debounce: 3000 });

    const written = JSON.parse(await fs.readFile(configPath(), "utf-8"));
    expect(written.watch).toEqual({ debounce: 3000 });
    expect(written.rules).toHaveProperty("specB");
  });

  it("migrates legacy top-level rule keys into the new rules object", async () => {
    const initial = {
      watch: { debounce: 3000 },
      specA: { sources: [{ type: "glob", pattern: "legacy/**/*.md" }] },
    };
    await fs.writeFile(configPath(), JSON.stringify(initial), "utf-8");

    const config = await loadConfig(tempVault, [SPEC_A, SPEC_B]);

    expect(config.rules.specA.sources).toEqual([
      { type: "glob", pattern: "legacy/**/*.md" },
    ]);
    expect(config.rules.specB).toEqual({ sources: SPEC_B.sources });

    const written = JSON.parse(await fs.readFile(configPath(), "utf-8"));
    expect(written).toEqual({
      watch: { debounce: 3000 },
      rules: {
        specA: { sources: [{ type: "glob", pattern: "legacy/**/*.md" }] },
        specB: { sources: SPEC_B.sources },
      },
    });
  });
});

describe("getDefaultConfig", () => {
  it("maps each spec to its default sources", () => {
    const config = getDefaultConfig([SPEC_A, SPEC_B]);
    expect(config).toEqual({
      specA: { sources: SPEC_A.sources },
      specB: { sources: SPEC_B.sources },
    });
  });

  it("returns an empty object for an empty spec list", () => {
    expect(getDefaultConfig([])).toEqual({});
  });
});
