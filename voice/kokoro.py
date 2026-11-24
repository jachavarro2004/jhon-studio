"""voice/kokoro.py — speak a video's narration with Kokoro-82M (kokoro-onnx).

Run by src/narrate.ts (`jhon-studio video narrate`) with the venv's Python,
never by hand:

    <venv>/bin/python -I voice/kokoro.py <job.json>

The job names the model and voices files and, per item (one line of
narration), the voice, the
phoneme language, the speed, the pause between cues, the cues' texts and
the WAV to write (mono, 16-bit, the model's 24 kHz). Each cue is spoken on
its own and the cues are joined with the pause, so the caller knows where
each cue starts. Prints one JSON line: per scene, its seconds and its cues'
start seconds.
"""
import json
import sys
import wave

import numpy as np
from kokoro_onnx import Kokoro


def main(job_path: str) -> None:
    with open(job_path, encoding="utf-8") as f:
        job = json.load(f)
    kokoro = Kokoro(job["model"], job["voices"])
    out = []
    for item in job["items"]:
        parts, starts, at, rate = [], [], 0, 24000
        for k, text in enumerate(item["cues"]):
            samples, rate = kokoro.create(text, voice=item["voice"], speed=item["speed"], lang=item["lang"])
            if k:
                gap = np.zeros(int(round(item["gap"] * rate)), dtype=np.float32)
                parts.append(gap)
                at += len(gap)
            starts.append(at / rate)
            parts.append(samples.astype(np.float32))
            at += len(samples)
        audio = np.concatenate(parts)
        pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2")
        with wave.open(item["wav"], "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes(pcm.tobytes())
        out.append({"seconds": len(pcm) / rate, "cues": starts})
    print(json.dumps(out))


if __name__ == "__main__":
    main(sys.argv[1])
