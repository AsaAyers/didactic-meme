export type RuleContext = {
  vaultPath: string;
  today: Date;
  dryRun: boolean;
  env: NodeJS.ProcessEnv;
};

export type FileChange = {
  path: string;
  content: string;
};

export type RuleResult = {
  changes: FileChange[];
  summary: string;
};

export type Rule = {
  name: string;
  run(ctx: RuleContext): Promise<RuleResult>;
};
