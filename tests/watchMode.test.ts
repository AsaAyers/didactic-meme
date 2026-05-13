import { describe, it, expect, vi } from "vitest";
import {
  ALERT_RULE,
  FAST_PATH_RULES,
  selectWatchRuleSets,
  createStopAll,
} from "../src/engine/watchMode.js";

describe("selectWatchRuleSets", () => {
  it('returns all non-alert rules for normal debounce when selectedRuleNames is "all"', () => {
    const allRules = [ALERT_RULE, ...FAST_PATH_RULES, "stampDone"];

    const result = selectWatchRuleSets("all", allRules);

    expect(result.fastPathRuleNames).toEqual([...FAST_PATH_RULES]);
    expect(result.allFileChangeRuleNames).toEqual([...FAST_PATH_RULES, "stampDone"]);
  });

  it("returns empty fast-path rules when none are selected", () => {
    const result = selectWatchRuleSets(
      ["stampDone", ALERT_RULE],
      [ALERT_RULE, ...FAST_PATH_RULES, "stampDone"],
    );

    expect(result.fastPathRuleNames).toEqual([]);
    expect(result.allFileChangeRuleNames).toEqual(["stampDone"]);
  });

  it("keeps normal file-change rules including fast-path rules", () => {
    const result = selectWatchRuleSets(
      [...FAST_PATH_RULES],
      [ALERT_RULE, ...FAST_PATH_RULES, "stampDone"],
    );

    expect(result.fastPathRuleNames).toEqual([...FAST_PATH_RULES]);
    expect(result.allFileChangeRuleNames).toEqual([...FAST_PATH_RULES]);
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
