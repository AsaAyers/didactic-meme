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
    expect(config).toEqual(getDefaultConfig([SPEC_A, SPEC_B]));

    // File was written to disk.
    const written = JSON.parse(await fs.readFile(configPath(), "utf-8"));
    expect(written).toEqual({
      specA: { sources: [{ type: "glob", pattern: "**/*.md" }] },
      specB: {
        sources: [
          { type: "glob", pattern: "notes/**/*.md", exclude: ["archive/**"] },
        ],
      },
    });
  });

  it("returns the stored config when it already contains all known rules", async () => {
    const customSources = [
      { type: "glob" as const, pattern: "custom/**/*.md" },
    ];
    const initial = {
      specA: { sources: customSources },
      specB: { sources: [{ type: "glob", pattern: "notes/**/*.md" }] },
    };
    await fs.writeFile(configPath(), JSON.stringify(initial), "utf-8");

    const config = await loadConfig(tempVault, [SPEC_A, SPEC_B]);

    // Custom sources are preserved.
    expect(config.specA.sources).toEqual(customSources);
  });

  it("merges default sources for rules missing from an outdated config", async () => {
    // Config only has specA — specB is a "new rule" not yet in the file.
    const initial = {
      specA: { sources: [{ type: "glob", pattern: "**/*.md" }] },
    };
    await fs.writeFile(configPath(), JSON.stringify(initial), "utf-8");

    const config = await loadConfig(tempVault, [SPEC_A, SPEC_B]);

    // specB now has its default sources.
    expect(config.specB).toEqual({ sources: SPEC_B.sources });

    // The merged result was written back to disk.
    const written = JSON.parse(await fs.readFile(configPath(), "utf-8"));
    expect(written).toHaveProperty("specB");
  });

  it("throws a descriptive error when the config contains invalid JSON", async () => {
    await fs.writeFile(configPath(), "{ this is not json }", "utf-8");

    await expect(loadConfig(tempVault, [SPEC_A])).rejects.toThrow(
      CONFIG_FILENAME,
    );
  });

  it("throws a descriptive error when the config fails zod validation", async () => {
    // "sources" must be an array of Source objects — a string is invalid.
    const bad = { specA: { sources: "not-an-array" } };
    await fs.writeFile(configPath(), JSON.stringify(bad), "utf-8");

    await expect(loadConfig(tempVault, [SPEC_A])).rejects.toThrow(
      CONFIG_FILENAME,
    );
  });

  it("throws a descriptive error when a source has an unknown type", async () => {
    const bad = { specA: { sources: [{ type: "unknown", pattern: "**" }] } };
    await fs.writeFile(configPath(), JSON.stringify(bad), "utf-8");

    await expect(loadConfig(tempVault, [SPEC_A])).rejects.toThrow(
      CONFIG_FILENAME,
    );
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
