export const ALERT_RULE = "incompleteTaskAlert";
export const FAST_PATH_RULE = "ensureAudioTranscripts";
export const FAST_PATH_DEBOUNCE_MS = 1_000;

export function selectWatchRuleSets(
  selectedRuleNames: string[] | "all",
  availableRuleNames: string[],
): {
  fileChangeRuleNames: string[];
  enableFastPath: boolean;
} {
  const selectedNames =
    selectedRuleNames === "all" ? availableRuleNames : selectedRuleNames;

  return {
    fileChangeRuleNames: selectedNames.filter(
      (n) => n !== ALERT_RULE && n !== FAST_PATH_RULE,
    ),
    enableFastPath: selectedNames.includes(FAST_PATH_RULE),
  };
}

export function createStopAll(stops: Array<() => void>): () => void {
  return (): void => {
    for (const stop of stops) {
      stop();
    }
  };
}
