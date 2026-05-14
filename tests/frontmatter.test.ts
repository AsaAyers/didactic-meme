import { describe, expect, it } from "vitest";
import { joinFrontmatter, splitFrontmatter } from "../src/markdown/frontmatter.js";

describe("frontmatter parsing/serialization", () => {
  it("serializes frontmatter when data is added after parsing", () => {
    const parsed = splitFrontmatter("# Note\n");
    parsed.data.publish = false;
    const serialized = joinFrontmatter(parsed, parsed.body);
    const reparsed = splitFrontmatter(serialized);
    expect(reparsed.data).toEqual({ publish: false });
    expect(reparsed.body).toBe("# Note\n");
  });

  it("drops empty frontmatter blocks during serialization", () => {
    const parsed = splitFrontmatter("---\n---\n# Note\n");
    expect(parsed.data).toEqual({});
    expect(joinFrontmatter(parsed, parsed.body)).toBe("# Note\n");
  });

  it("drops frontmatter when all keys are removed", () => {
    const parsed = splitFrontmatter("---\npublish: false\n---\n# Note\n");
    delete parsed.data.publish;
    expect(joinFrontmatter(parsed, parsed.body)).toBe("# Note\n");
  });
});
