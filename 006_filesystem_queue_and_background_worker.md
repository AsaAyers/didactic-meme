# 006 — Filesystem Queue and Background Worker

## Goal

Implement the filesystem queue and the async background worker that picks up transcription jobs and writes results to transcript files, without blocking or crashing the main rule engine.

---

## Suggested Module Layout

| File                          | Responsibility                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `src/transcription/types.ts`  | Shared types: `TranscriptionJob`, `TranscriberBackend`, `WorkerOptions`.          |
| `src/transcription/queue.ts`  | Filesystem queue: `enqueue`, `claimNext`, `markDone`, `markFailed`.               |
| `src/transcription/worker.ts` | Main worker loop: polls queue, calls backend, writes transcript file.             |
| `src/transcription/format.ts` | Pure functions: `buildPlaceholder`, `buildSuccessContent`, `buildFailureContent`. |

---

## Module Responsibilities

### `types.ts`

```ts
export type TranscriptionJob = {
  id: string;
  audioPath: string;
  transcriptPath: string;
  sourceNotePath: string;
  createdAt: string; // ISO 8601
};

/** Abstraction over the actual transcription engine (real or fake). */
export type TranscriberBackend = {
  transcribe(audioPath: string): Promise<string>; // returns transcript text
};
```

### `queue.ts`

- `enqueue(stateDir, job): Promise<void>` — writes `<id>.json` to `pending/`.
- `claimNext(stateDir): Promise<TranscriptionJob | null>` — atomically moves the oldest `pending/*.json` to `processing/`; returns `null` if queue is empty.
- `markDone(stateDir, id): Promise<void>` — moves job from `processing/` to `done/`.
- `markFailed(stateDir, id, error): Promise<void>` — moves job from `processing/` to `failed/`.

### `worker.ts`

- Exported `startWorker(options: WorkerOptions): Promise<void>` starts the main loop.
- On startup, move any stale `processing/` jobs back to `pending/` (crash recovery).
- Main loop: `claimNext` → call `backend.transcribe` → write transcript file → `markDone` or `markFailed`.
- Sleep briefly between polls when queue is empty.
- **One job at a time** for v1 — no concurrency needed.

### `format.ts`

Pure functions for generating placeholder, success, and failure content (see task 005 for exact formats).

---

## Error Handling Requirements

- Worker failures (unhandled exceptions in the loop) must **not** crash the rule engine process.
- Per-job transcription errors must **not** stop the worker; write the failure content to the transcript file and continue.
- Every transcript file must end in either a "done" or "failed" state — never left half-written.

---

## Transcriber Backend Interface

The `TranscriberBackend` abstraction allows:

- **Production**: a real backend that shells out to the transcription binary inside the container.
- **Tests**: a fake backend that returns deterministic text instantly, making E2E tests fast and reliable without Docker or a real model.

---

## Acceptance Criteria

- [ ] All four modules created with the responsibilities listed above.
- [ ] `enqueue` / `claimNext` / `markDone` / `markFailed` implemented in `queue.ts`.
- [ ] Worker starts, polls, and handles jobs one at a time.
- [ ] Stale `processing/` jobs recovered on startup.
- [ ] Worker does not crash the host process on error.
- [ ] `TranscriberBackend` interface used throughout (no hard-coded binary paths in `worker.ts`).
- [ ] Unit tests for queue operations in `tests/transcriptionQueue.test.ts`.
