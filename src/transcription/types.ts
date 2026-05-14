export type TranscriptionJob = {
  id: string;
  audioPath: string;
  transcriptPath: string;
  sourceNotePath: string;
  createdAt: string;
};

export type TranscriberBackend = {
  transcribe(audioPath: string): Promise<string>;
};

export type WorkerOptions = {
  trimDeadAir?: boolean;
  stateDir: string;
  backend: TranscriberBackend;
  pollIntervalMs?: number;
  shouldContinue?: () => boolean;
  logger?: Pick<Console, "error">;
  sleep?: (ms: number) => Promise<void>;
};
