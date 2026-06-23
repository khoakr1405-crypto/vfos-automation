# edge-tts-voice — voiceover tiếng Việt qua Microsoft Edge TTS (free, CPU)

Bộ sinh **voiceover** tiếng Việt cho VFOS bằng giọng neural của Microsoft Edge
(`vi-VN-HoaiMyNeural` nữ / `vi-VN-NamMinhNeural` nam). **Miễn phí, không cần API
key, không cần thẻ.** Gọi bởi `scripts/elevenlabs-voiceover-bridge.ts` với
`--provider edge` (mặc định). Trả mp3 + word-boundary để phía Node dựng
char-level timing cho kinetic caption.

## Setup 1 lần (Windows)

```powershell
# Python 3.12 (nếu máy chưa có) — per-user, không cần admin
winget install Python.Python.3.12 -e --scope user --accept-package-agreements --accept-source-agreements

$py = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
& $py -m venv tools\edge-tts-voice\.venv
tools\edge-tts-voice\.venv\Scripts\python.exe -m pip install -r tools\edge-tts-voice\requirements.txt
```

**Không commit** `.venv` (đã có trong `.gitignore`).

## Lưu ý kỹ thuật

- **Free & không key**: edge-tts gọi dịch vụ TTS online của Microsoft Edge. Cần
  **mạng** khi chạy. Đây là client **không chính thức** → nếu Microsoft đổi/khoá
  endpoint thì lib có thể gãy (khi đó dùng fallback `--provider elevenlabs`).
- **2 giọng vi-VN**: `vi-VN-HoaiMyNeural` (nữ), `vi-VN-NamMinhNeural` (nam).
- **Prosody**: chỉnh qua `--rate` / `--pitch` / `--volume` (vd `+18%`, `+22Hz`).
  Mặc định VFOS dùng mức "lv2" trẻ trung: rate `+18%`, pitch `+22Hz`.
- **Timing word-level**: edge-tts trả `WordBoundary` (offset/duration đơn vị
  100ns → giây). Bridge Node chia đều ký tự trong mỗi từ để dựng char-level
  alignment khớp schema `voice_timing_artifact.json` cũ (caption renderer
  không phải sửa).

## Dùng trực tiếp (debug)

```powershell
tools\edge-tts-voice\.venv\Scripts\python.exe tools\edge-tts-voice\synthesize.py `
  --text-file <text.txt> --voice vi-VN-HoaiMyNeural `
  --rate +18% --pitch +22Hz `
  --out-audio <out.mp3> --out-words <words.json>
```
