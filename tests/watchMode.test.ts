import { describe, it, expect, vi } from "vitest";
import {
  ALERT_RULE,
  FAST_PATH_RULE,
  selectWatchRuleSets,
  createStopAll,
} from "../src/engine/watchMode.js";

describe("selectWatchRuleSets", () => {
  it('enables fast path when selectedRuleNames is "all"', () => {
    const allRules = [ALERT_RULE, FAST_PATH_RULE, "stampDone"];

    const result = selectWatchRuleSets("all", allRules);

    expect(result.enableFastPath).toBe(true);
    expect(result.fileChangeRuleNames).toEqual(["stampDone"]);
  });

  it("excludes only alert rule when fast-path rule is not selected", () => {
    const result = selectWatchRuleSets(
      ["stampDone", ALERT_RULE],
      [ALERT_RULE, FAST_PATH_RULE, "stampDone"],
    );

    expect(result.enableFastPath).toBe(false);
    expect(result.fileChangeRuleNames).toEqual(["stampDone"]);
  });

  it("keeps normal file-change rules empty when only fast-path rule is selected", () => {
    const result = selectWatchRuleSets(
      [FAST_PATH_RULE],
      [ALERT_RULE, FAST_PATH_RULE, "stampDone"],
    );

    expect(result.enableFastPath).toBe(true);
    expect(result.fileChangeRuleNames).toEqual([]);
  });
});

describe("createStopAll", () => {
  it("calls each stop handler once in order", () => {
    const first = vi.fn();
    const second = vi.fn();
    const third = vi.fn();

    const stopAll = createStopAll([first, second, third]);
    stopAll();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(third).toHaveBeenCalledTimes(1);
    expect(first.mock.invocationCallOrder[0]).toBeLessThan(
      second.mock.invocationCallOrder[0],
    );
    expect(second.mock.invocationCallOrder[0]).toBeLessThan(
      third.mock.invocationCallOrder[0],
    );
  });
});
