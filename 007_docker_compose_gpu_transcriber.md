# 007 — Docker Compose GPU Transcription Worker

## Goal

Add a long-running GPU transcription worker service to the existing `docker-compose.yml` so that the full stack can be started with a single `docker compose up` and no additional local setup is required.

---

## Why a Long-Running Worker Instead of Per-Job `docker run`

Spawning a new container for each audio file incurs a cold-start penalty (model loading) of several seconds to minutes depending on model size.  A long-running service loads the model once at startup and can process subsequent jobs in near-real-time.  This is the right trade-off given the accuracy-over-speed preference and the expectation that jobs arrive infrequently.

---

## Files to Update

| File | Change |
|---|---|
| `docker-compose.yml` | Add `transcriber-worker` service alongside the existing `didactic-meme` service. |
| `Dockerfile` | Update if the transcription binary needs to be co-located in the same image, or create a dedicated `Dockerfile.worker` if a separate image is cleaner. |
| Worker entrypoint script | Add if the worker needs a different startup sequence (e.g. model pre-warm, environment checks). |

---

## Services

### `didactic-meme`

The existing service; no behaviour change.  Add a shared `state` volume mount if not already present.

### `transcriber-worker`

Runs the Node.js background worker (`src/transcription/worker.ts`) with the local transcription backend wired in.  The transcription binary runs inside **the same container** — no separate transcriber sidecar.

```yaml
transcriber-worker:
  build:
    context: .
    dockerfile: Dockerfile        # or Dockerfile.worker
  command: ["node", "dist/transcription/worker.js"]
  volumes:
    - /vault:/vault               # shared vault mount
    - state:/state                # shared queue state
  environment:
    STATE_DIR: /state
    VAULT_PATH: /vault
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
  restart: unless-stopped
```

---

## Shared Mounts

| Mount | Purpose |
|---|---|
| `/vault` | Vault root — worker reads audio files and writes transcript files here. |
| `/state` | Filesystem queue — `pending/`, `processing/`, `done/`, `failed/` directories. |

The queue (`/state`) should live **outside the vault** to avoid polluting the user's notes.

---

## Transcription Backend

Use **`faster-whisper`** with the **`large-v3`** model:

- Best available accuracy for local Whisper-based transcription.
- Native NVIDIA CUDA GPU support.
- Suitable for a one-at-a-time background worker.

The worker shells out to the `faster-whisper` CLI (or uses its Python API via a small wrapper script) installed in the container image.

---

## GPU Access

The `transcriber-worker` service requires an NVIDIA GPU.  The Compose file uses the `deploy.resources.reservations.devices` field (Compose v3.8+ / Docker Engine 19.03+).  The host must have the NVIDIA Container Toolkit installed.

---

## Acceptance Criteria

- [ ] `docker compose up` starts both `didactic-meme` and `transcriber-worker`.
- [ ] Worker container has GPU access via the NVIDIA Container Toolkit config.
- [ ] `/vault` and `/state` are correctly mounted and shared between services.
- [ ] `faster-whisper large-v3` is installed in the worker image.
- [ ] Worker picks up jobs from `/state/pending/` and writes transcripts to `/vault`.
- [ ] Restarting the worker recovers stale `processing/` jobs.
- [ ] No local setup beyond `docker compose up` is required.
