#!/usr/bin/env python
"""VFOS — PaddleOCR text-DETECTION runner (PP-OCR 2.7.x, CPU + mkldnn).

Đọc tất cả frame ảnh trong --frames-dir, chạy PP-OCR (det+rec, lang ch) MỘT lần
khởi tạo model rồi loop, ghi JSON ra --out:

  {
    "engine": "paddleocr",
    "version": "<x>",
    "frames": [
      {"file": "frame_0001.jpg",
       "regions": [{"box": [x, y, w, h], "text": "...", "score": 0.97}]}
    ]
  }

box = bbox trục-thẳng (axis-aligned) suy từ polygon detection → ôm TRỌN cả dòng
(không rớt ký tự mép như word-box tesseract). Lọc CJK/thời gian làm ở phía Node.

Dùng paddleocr 2.7.x (paddle 2.6.x) vì mkldnn CHẠY ỔN (nhanh ~5-10× so với
paddle 3.x phải tắt mkldnn). Log của Paddle đẩy về stderr; JSON ghi ra file nên
stdout không nhiễu. KHÔNG network khi chạy (model đã cache lần đầu).
"""

import argparse
import json
import logging
import os
import sys
from contextlib import redirect_stdout

logging.disable(logging.WARNING)
os.environ.setdefault("GLOG_minloglevel", "3")

IMG_EXT = (".jpg", ".jpeg", ".png", ".bmp")


def poly_to_box(poly):
    """Nx2 polygon (det) -> [x, y, w, h] nguyên, axis-aligned."""
    xs = [float(p[0]) for p in poly]
    ys = [float(p[1]) for p in poly]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    return [round(x0), round(y0), round(x1 - x0), round(y1 - y0)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames-dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--lang", default="ch")
    args = ap.parse_args()

    files = sorted(f for f in os.listdir(args.frames_dir) if f.lower().endswith(IMG_EXT))
    if not files:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump({"engine": "paddleocr", "frames": []}, fh)
        print("paddle-detect: 0 frame", file=sys.stderr)
        return

    # Import + init model (det+rec). mkldnn BẬT để nhanh trên CPU.
    with redirect_stdout(sys.stderr):
        from paddleocr import PaddleOCR
        import paddleocr as _pkg

        ocr = PaddleOCR(
            use_angle_cls=False,
            lang=args.lang,
            show_log=False,
            use_gpu=False,
            enable_mkldnn=True,
        )

    frames_out = []
    for idx, name in enumerate(files):
        path = os.path.join(args.frames_dir, name)
        regions = []
        try:
            with redirect_stdout(sys.stderr):
                res = ocr.ocr(path, cls=False)
            # 2.x: res = [ page ]; page = [ [poly, (text, score)], ... ] hoặc None.
            page = res[0] if res else None
            for det in page or []:
                poly = det[0]
                text = det[1][0]
                score = float(det[1][1])
                regions.append({"box": poly_to_box(poly), "text": text, "score": round(score, 4)})
        except Exception as e:  # noqa: BLE001 — 1 frame lỗi không chặn cả batch
            print(f"paddle-detect: frame {name} lỗi: {e}", file=sys.stderr)
        frames_out.append({"file": name, "regions": regions})
        if (idx + 1) % 30 == 0:
            print(f"paddle-detect: {idx + 1}/{len(files)} frame", file=sys.stderr)

    payload = {
        "engine": "paddleocr",
        "version": getattr(_pkg, "__version__", "?"),
        "frames": frames_out,
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False)
    hit = sum(1 for f in frames_out if f["regions"])
    print(f"paddle-detect: {hit}/{len(files)} frame có vùng chữ → {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
