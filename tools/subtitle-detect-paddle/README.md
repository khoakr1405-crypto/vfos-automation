# subtitle-detect-paddle — PaddleOCR text-detection (CPU)

Bộ dò **vùng chữ** (PP-OCR DBNet, lang `ch`) cho tính năng xóa phụ đề Trung của VFOS.
Trả polygon ôm trọn cả dòng → đo được kích thước/vị trí phụ đề chính xác hơn
word-box của tesseract (không rớt ký tự mép). Gọi bởi `scripts/source-subtitle-detector.ts`
với `--engine paddle`.

## Setup 1 lần (Windows)

```powershell
# 1) Python (nếu máy chưa có) — per-user, không cần admin
winget install Python.Python.3.12 -e --scope user --accept-package-agreements --accept-source-agreements

# 2) venv riêng cho tool (đường dẫn cố định mà detector mong đợi)
$py = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
& $py -m venv tools\subtitle-detect-paddle\.venv

# 3) Cài dependency (CPU). Lần đầu tải paddlepaddle + model ≈ vài trăm MB.
tools\subtitle-detect-paddle\.venv\Scripts\python.exe -m pip install -r tools\subtitle-detect-paddle\requirements.txt
```

Model PP-OCR tự tải về cache người dùng lần chạy đầu (`~/.paddleocr`). **Không commit**
venv, model, log (đã có trong `.gitignore`).

## Lưu ý kỹ thuật

- **Dùng paddle 2.6.x (KHÔNG 3.x)**: paddle 3.x trên CPU bị lỗi `ConvertPirAttribute...
  not support` ở oneDNN×PIR → buộc tắt mkldnn → ~3s/frame. paddle **2.6.2 + mkldnn
  CHẠY ỔN** → ~0.3s/frame (nhanh ~7-10×). `detect.py` bật `enable_mkldnn=True`.
- **numpy < 2 bắt buộc**: paddle 2.6.2 wheel compile theo numpy 1.x ABI
  (`numpy==1.26.4`). numpy 2.x sẽ lỗi `module compiled against ABI version`.
- **CPU-only**: không cần GPU. Video 60s @2fps ≈ ~40s.
- Nếu lỡ cài nhầm bản 3.x trước đó, nên xoá venv tạo lại cho sạch dependency.

## Dùng trực tiếp (debug)

```powershell
tools\subtitle-detect-paddle\.venv\Scripts\python.exe tools\subtitle-detect-paddle\detect.py `
  --frames-dir <thư_mục_frame> --out <out.json> [--lang ch]
```

Output JSON: `{ engine, version, frames: [{ file, regions: [{ box:[x,y,w,h], text, score }] }] }`
(box theo pixel của ảnh frame đầu vào). Lọc CJK + cluster thời gian + dựng dải do
phía Node (`source-subtitle-detector.ts`) đảm nhiệm.
