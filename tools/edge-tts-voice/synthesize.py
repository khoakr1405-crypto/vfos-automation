#!/usr/bin/env python
"""VFOS — edge-tts voiceover runner (Microsoft Edge online neural TTS, CPU).

Đọc text tiếng Việt từ --text-file, gọi edge-tts MỘT lần, ghi:
  --out-audio  : file mp3
  --out-words  : JSON word-boundary để phía Node dựng char-level timing

  {
    "voice": "vi-VN-HoaiMyNeural",
    "rate": "+18%", "pitch": "+22Hz", "volume": "+0%",
    "words": [{"text": "Nắng", "offsetSec": 0.10, "durationSec": 0.32}, ...]
  }

offset/duration của edge-tts ở đơn vị 100ns (ticks) → chia 1e7 ra giây.
MIỄN PHÍ, không cần API key (gọi dịch vụ TTS online của Microsoft Edge).
Log đẩy về stderr; stdout sạch. KHÔNG ghi gì ngoài 2 file out ở trên.
"""

import argparse
import asyncio
import json
import sys


async def synth(args) -> int:
    import edge_tts

    with open(args.text_file, "r", encoding="utf-8") as fh:
        text = fh.read().strip()
    if not text:
        print("edge-tts: text rỗng", file=sys.stderr)
        return 2

    communicate = edge_tts.Communicate(
        text,
        args.voice,
        rate=args.rate,
        pitch=args.pitch,
        volume=args.volume,
        boundary="WordBoundary",  # mặc định lib là SentenceBoundary → ép word-level
    )

    words = []
    audio_bytes = 0
    with open(args.out_audio, "wb") as af:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                af.write(chunk["data"])
                audio_bytes += len(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append(
                    {
                        "text": chunk["text"],
                        "offsetSec": round(chunk["offset"] / 1e7, 6),
                        "durationSec": round(chunk["duration"] / 1e7, 6),
                    }
                )

    if audio_bytes == 0:
        print("edge-tts: không nhận được audio (rỗng)", file=sys.stderr)
        return 3

    payload = {
        "voice": args.voice,
        "rate": args.rate,
        "pitch": args.pitch,
        "volume": args.volume,
        "words": words,
    }
    with open(args.out_words, "w", encoding="utf-8") as wf:
        json.dump(payload, wf, ensure_ascii=False)

    print(
        f"edge-tts: {audio_bytes} bytes audio, {len(words)} word boundaries -> {args.out_audio}",
        file=sys.stderr,
    )
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text-file", required=True)
    ap.add_argument("--voice", required=True)
    ap.add_argument("--rate", default="+0%")
    ap.add_argument("--pitch", default="+0Hz")
    ap.add_argument("--volume", default="+0%")
    ap.add_argument("--out-audio", required=True)
    ap.add_argument("--out-words", required=True)
    args = ap.parse_args()
    try:
        return asyncio.run(synth(args))
    except Exception as e:  # noqa: BLE001 — báo lỗi sạch ra stderr, exit !=0
        print(f"edge-tts: lỗi {type(e).__name__}: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
