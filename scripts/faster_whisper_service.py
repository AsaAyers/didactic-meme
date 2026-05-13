#!/usr/bin/env python3
import argparse
import json
import sys

from faster_whisper import WhisperModel


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--device", required=True)
    parser.add_argument("--compute-type", required=True)
    parser.add_argument("--download-root")
    return parser.parse_args()


def read_requests(model: WhisperModel) -> None:
    print(json.dumps({"type": "ready"}), flush=True)

    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue

        try:
            payload = json.loads(raw)
            audio_path = payload["audioPath"]
            segments, _info = model.transcribe(audio_path, beam_size=5)
            text = "\n".join(
                segment.text.strip()
                for segment in segments
                if segment.text.strip()
            )
            print(json.dumps({"type": "result", "text": text}), flush=True)
        except Exception as err:  # pragma: no cover - exercised via Node tests
            print(
                json.dumps({"type": "error", "error": str(err)}),
                flush=True,
            )


def main() -> int:
    args = parse_args()
    model = WhisperModel(
        args.model,
        device=args.device,
        compute_type=args.compute_type,
        download_root=args.download_root,
    )
    read_requests(model)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
