import { spawn } from "node:child_process";
import type { TranscriberBackend } from "./types.js";

type FasterWhisperBackendOptions = {
  executablePath?: string;
  scriptPath?: string;
  model?: string;
  device?: string;
  computeType?: string;
  downloadRoot?: string;
};

type ReadyMessage = {
  type: "ready";
};

type ResultMessage = {
  type: "result";
  text: string;
};

type ErrorMessage = {
  type: "error";
  error: string;
};

type BackendMessage = ReadyMessage | ResultMessage | ErrorMessage;

export function createFasterWhisperBackend(
  options: FasterWhisperBackendOptions = {},
): TranscriberBackend {
  const executablePath = options.executablePath ?? "python3";
  const scriptPath =
    options.scriptPath ?? "/app/scripts/faster_whisper_service.py";
  const args = [
    scriptPath,
    "--model",
    options.model ?? "large-v3",
    "--device",
    options.device ?? "cuda",
    "--compute-type",
    options.computeType ?? "float16",
  ];
  if (options.downloadRoot) {
    args.push("--download-root", options.downloadRoot);
  }

  const child = spawn(executablePath, args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdoutBuffer = "";
  let stderrBuffer = "";
  let readyResolve!: () => void;
  let readyReject!: (reason: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  let isReady = false;
  let pending:
    | {
        resolve: (value: string) => void;
        reject: (reason: Error) => void;
      }
    | undefined;

  function rejectPending(message: string): void {
    pending?.reject(new Error(message));
    pending = undefined;
  }

  function handleMessage(message: BackendMessage): void {
    if (message.type === "ready") {
      isReady = true;
      readyResolve();
      return;
    }

    if (!pending) {
      return;
    }

    if (message.type === "result") {
      pending.resolve(message.text);
    } else {
      pending.reject(new Error(message.error));
    }
    pending = undefined;
  }

  child.stdout.setEncoding("utf-8");
  child.stdout.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    for (;;) {
      const newlineIndex = stdoutBuffer.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }
      try {
        handleMessage(JSON.parse(line) as BackendMessage);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Invalid backend JSON";
        if (!isReady) {
          readyReject(new Error(message));
        }
        rejectPending(message);
      }
    }
  });

  child.stderr.setEncoding("utf-8");
  child.stderr.on("data", (chunk: string) => {
    stderrBuffer += chunk;
  });

  child.on("error", (err) => {
    if (!isReady) {
      readyReject(err);
    }
    rejectPending(err.message);
  });

  child.on("exit", (code, signal) => {
    const details = stderrBuffer.trim();
    const suffix = details ? `: ${details}` : "";
    const reason =
      signal !== null
        ? `faster-whisper backend exited via signal ${signal}${suffix}`
        : `faster-whisper backend exited with code ${code ?? "unknown"}${suffix}`;
    if (!isReady) {
      readyReject(new Error(reason));
    }
    rejectPending(reason);
  });

  return {
    async transcribe(audioPath: string): Promise<string> {
      await ready;
      if (pending) {
        throw new Error(
          "faster-whisper backend is busy; concurrent transcription is not supported",
        );
      }

      return new Promise<string>((resolve, reject) => {
        pending = { resolve, reject };
        child.stdin.write(`${JSON.stringify({ audioPath })}\n`, "utf-8");
      });
    },
  };
}
