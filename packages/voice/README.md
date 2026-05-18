# @vfos/voice

ElevenLabs TTS client + audio duration probe — viên gạch đầu tiên của Voice Duration Alignment Engine (VDAE).

Xem thiết kế đầy đủ: `docs/VOICE_DURATION_ALIGNMENT_ENGINE_SPEC_V1.md`

---

## Lấy API Key & Voice ID

### 1. ElevenLabs API Key

1. Đăng nhập tại [elevenlabs.io](https://elevenlabs.io)
2. Click avatar góc trên phải → **Profile**
3. Kéo xuống mục **API Keys** → tạo key mới
4. Copy → paste vào `.env` (file `ELEVENLABS_API_KEY=...`)

### 2. Voice ID (Vietnamese)

**Cách A — Web UI:**
1. Vào mục **Voices** trên ElevenLabs
2. Filter: Language = Vietnamese, Gender = Male
3. Click vào giọng muốn dùng → copy **Voice ID** từ URL hoặc panel bên phải

**Cách B — API:**
```bash
curl -H "xi-api-key: $ELEVENLABS_API_KEY" \
  https://api.elevenlabs.io/v1/voices | jq '.voices[] | {name, voice_id, labels}'
```

**Gợi ý cho VFOS TikTok-style VN:** tìm giọng nam có nhãn `energetic` hoặc `young`.

---

## Cài đặt

```bash
# Từ root repo
pnpm install
```

Không cần cài thêm gì — package chỉ dùng Node.js built-ins + `tsx` (đã có ở root devDeps).

---

## Cách chạy CLI

### Windows (PowerShell)

```powershell
# 1. Chuẩn bị .env
Copy-Item .env.example .env
# Mở .env, điền ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, FFPROBE_PATH

# 2. Tạo file script text
"3 đồ bếp thông minh dưới 100 nghìn mà nhà nào cũng nên có!" | Out-File -Encoding utf8 C:\Temp\script.txt

# 3. Generate
pnpm voice:generate --input C:\Temp\script.txt --output C:\Temp\voice_out.mp3

# Với settings tùy chỉnh:
pnpm voice:generate `
  --input production\batch_001\yt_004\script.txt `
  --output production\batch_001\yt_004\yt_004_voice_v2.mp3 `
  --stability 0.60 `
  --similarity 0.75 `
  --style 0.35 `
  --speed 0.90

# Override voice ID không cần sửa .env:
pnpm voice:generate --input script.txt --output out.mp3 --voice-id <ID>
```

> **Note Windows:** `pnpm voice:generate` = `pnpm.cmd voice:generate` — cả hai đều hoạt động trong PowerShell/CMD. Backtick (`` ` ``) là line-continuation trong PowerShell, thay cho `\` của bash.

### macOS / Linux (bash)

```bash
# 1. Chuẩn bị .env
cp .env.example .env

# 2. Tạo file script text
echo "3 đồ bếp thông minh dưới 100 nghìn mà nhà nào cũng nên có!" > /tmp/script.txt

# 3. Generate
pnpm voice:generate --input /tmp/script.txt --output /tmp/voice_out.mp3

# Với settings tùy chỉnh:
pnpm voice:generate \
  --input production/batch_001/yt_004/script.txt \
  --output production/batch_001/yt_004/yt_004_voice_v2.mp3 \
  --stability 0.60 \
  --similarity 0.75 \
  --style 0.35 \
  --speed 0.90

# Override voice ID không cần sửa .env:
pnpm voice:generate --input script.txt --output out.mp3 --voice-id <ID>
```

### Output terminal

```
── ElevenLabs TTS ──────────────────────────────────────────
  Voice ID   : <id>
  Model      : eleven_multilingual_v2
  Stability  : 0.6
  ...
  Words      : 70

Generating… done
  Chars used : 312

Probing duration… done

── Result ──────────────────────────────────────────────────
  Duration   : 17.789s
  Format     : mp3
  Bitrate    : 143 kb/s
  Est. WPM   : 236
  File       : /path/to/out.mp3
```

---

## ffprobe (cần để đo duration)

Nếu `ffprobe` không có trong PATH:

```dotenv
# .env
FFPROBE_PATH=C:\Users\Admin\AppData\Local\Microsoft\WinGet\Packages\yt-dlp.FFmpeg_...\bin\ffprobe.exe
```

Nếu thiếu ffprobe, audio vẫn được lưu — chỉ bỏ qua bước đo duration.

---

## Voice Preset Library v0

Operator có thể chọn giọng theo tên preset thay vì truyền voice ID thủ công.

### Preset names

| Preset     | Env var                  |
|------------|--------------------------|
| `default`  | `ELEVENLABS_VOICE_ID`    |
| `voice_01` | `ELEVENLABS_VOICE_ID_01` |
| `voice_02` | `ELEVENLABS_VOICE_ID_02` |
| `voice_03` | `ELEVENLABS_VOICE_ID_03` |
| `voice_04` | `ELEVENLABS_VOICE_ID_04` |
| `voice_05` | `ELEVENLABS_VOICE_ID_05` |

### Cách khai báo trong `.env`

```dotenv
ELEVENLABS_VOICE_ID=<default_voice_id>
ELEVENLABS_VOICE_ID_01=<voice_id_1>
ELEVENLABS_VOICE_ID_02=<voice_id_2>
# ...
```

### Dùng với `voice:generate`

```powershell
# Không truyền flag → dùng preset "default" (ELEVENLABS_VOICE_ID)
pnpm voice:generate --input script.txt --output out.mp3

# Chọn preset cụ thể
pnpm voice:generate --input script.txt --output out_v2.mp3 --voice-preset voice_02

# Raw override (backward-compat, không ghi vào manifest)
pnpm voice:generate --input script.txt --output out.mp3 --voice-id <raw_id>
```

### Dùng với `voice:sync`

```powershell
# Dùng preset voice_01 cho toàn bộ sync
pnpm voice:sync `
  --script-json production/batch_001/yt_005/script_ai_v4_gpt4o_extended_polish.json `
  --output-dir production/batch_001/yt_005/voice_sync_v0_preset1 `
  --voice-preset voice_01

# Regenerate 1 block với preset khác
pnpm voice:sync `
  --script-json production/batch_001/yt_005/script_ai_v4_gpt4o_extended_polish.json `
  --output-dir production/batch_001/yt_005/voice_sync_v0_preset2 `
  --voice-preset voice_02 `
  --only-blocks b1
```

### Manifest traceability

`voice_sync_manifest.json` sẽ ghi:
```json
{
  "voice_preset": "voice_02",
  "voice_id": "<resolved_id>",
  ...
}
```

Khi đọc manifest biết ngay block sync này dùng preset giọng nào.

### Nguyên tắc

- **Operator chọn preset có chủ đích** — chưa random voice tự động ở v0.
- Không hardcode voice ID trong source code.
- Preset mới: khai báo env var + thêm vào `PRESET_ENV_MAP` trong `src/voice-presets.ts`.

---

## Roadmap

| Phase | Tính năng |
|-------|-----------|
| **v0 (hiện tại)** | TTS generate + duration probe |
| **v1** | Alignment loop: probe → speed-adjust → regenerate |
| **v1** | LLM script calibration (expand/trim theo WPM) |
| **v1** | ElevenLabs Timestamps API → SRT subtitles |
| **v2** | BullMQ job queue, multi-kênh, 20 video/ngày |
