import { describe, expect, it } from "vitest";
import { joinFrontmatter, splitFrontmatter } from "../src/markdown/frontmatter.js";

describe("frontmatter parsing/serialization", () => {
  it("parses files without frontmatter into an empty object", () => {
    const raw = "# Note\n\nBody\n";
    const parsed = splitFrontmatter(raw);
    expect(parsed.data).toEqual({});
    expect(parsed.body).toBe(raw);
  });

  it("does not serialize frontmatter when data is empty", () => {
    const raw = "# Note\n";
    const parsed = splitFrontmatter(raw);
    expect(joinFrontmatter(parsed, parsed.body)).toBe(raw);
  });

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
});
