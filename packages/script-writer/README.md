# @vfos/script-writer

AI Script Writer cho VFOS — sinh voiceover tiếng Việt cho video short-form affiliate, dùng **OpenAI Responses API + structured outputs** để trả JSON typed.

> Mục tiêu: thay thế bước viết script thủ công, đầu ra paste thẳng vào ElevenLabs TTS (`@vfos/voice`).

---

## Cài đặt

```bash
# từ root repo
pnpm install
```

Set 2 env trong `.env` ở root:

```dotenv
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini   # optional, default
```

---

## Chạy

```powershell
pnpm script:generate `
  --input  production\batch_001\yt_005\scene_input.json `
  --output production\batch_001\yt_005\script_ai_v1.json `
  --text-output production\batch_001\yt_005\script_ai_v1.txt
```

Hoặc bash:

```bash
pnpm script:generate \
  --input  production/batch_001/yt_005/scene_input.json \
  --output production/batch_001/yt_005/script_ai_v1.json \
  --text-output production/batch_001/yt_005/script_ai_v1.txt
```

CLI flags:

| Flag | Default | Note |
|---|---|---|
| `--input` | required | path tới `scene_input.json` (validated bằng zod) |
| `--output` | required | path JSON đầy đủ (input + output + meta + timestamp) |
| `--text-output` | optional | path TXT chỉ chứa `full_script` để paste vào TTS |
| `--model` | `gpt-4o-mini` | override `OPENAI_MODEL` env |

---

## Input schema

`ScriptWriterInput` (zod, file `src/types.ts`):

```ts
{
  video_id: string,
  content_goal: string,
  target_platform: "tiktok" | "reels" | "shorts",
  duration_target_s: number,
  tone: string,
  affiliate_angle: string,
  cta_style: string,
  scene_timeline: Array<{
    window_start_s: number,
    window_end_s: number,
    scene_type: "HOOK" | "KITCHEN" | "FILLER" | "TRANSITION" | "CTA" | "OFF_TOPIC",
    visual_summary: string,
    notes: string | null,
  }>,
}
```

Validation chạy ở CLI trước khi gọi API. Lỗi → exit 1 + chỉ rõ field.

---

## Output schema

`ScriptOutput` — OpenAI trả về đúng schema này (structured output strict mode):

```ts
{
  hook: string,                 // câu hook chính (tóm tắt block đầu)
  blocks: Array<{
    block_id: string,           // "b1", "b2", ...
    window_start_s: number,
    window_end_s: number,
    intent: "HOOK" | "KITCHEN" | "FILLER" | "TRANSITION" | "CTA" | "SILENT",
    line: string,               // "" nếu SILENT
    notes: string | null,
  }>,
  cta: string,                  // câu CTA (khớp block cuối)
  full_script: string,          // text paste vào TTS, dùng "\n\n" giữa block
  writer_notes: string[],       // ghi chú từ writer cho operator
}
```

JSON file output bọc thêm `input` (re-print), `meta` (model, tokens, response_id), `generated_at`.

---

## Nguyên tắc trong system prompt

Trích ngắn (xem full ở `src/system-prompt.ts`):

- Tiếng Việt tự nhiên kiểu người nói, không dịch máy.
- Bám đúng visual_summary từng scene.
- KHÔNG bịa tính năng/giá sản phẩm.
- Scene `OFF_TOPIC` → `SILENT` hoặc `FILLER` tease, không cố giải thích visual lạc đề.
- Hook 3s đầu: câu khẳng định gây tò mò, tránh "Xin chào".
- CTA mềm kiểu TikTok VN ("link mình để bio nha").
- Nhịp ~170 WPM (≈ 2.8 words/s).
- Tránh các cụm AI hay dùng: "thực sự", "đáng kinh ngạc", "tuyệt vời", "không thể bỏ qua".

---

## Validation & error handling

- Input JSON parse fail → exit 1 với message rõ.
- Input schema fail → exit 1 + list field lỗi.
- `OPENAI_API_KEY` missing → exit 1.
- API call fail → exit 1 + error message (không log API key).
- Output JSON parse fail (rất hiếm vì structured output strict) → throw qua OpenAI SDK.

Không log API key ở bất kỳ stream nào.

---

## Tiêu chí script đạt/chưa đạt

Cho operator review trước khi đẩy sang TTS:

| Tiêu chí | Đạt |
|---|---|
| Hook 3s đầu | có câu khẳng định/đặt vấn đề, không "Xin chào" |
| Bám visual | mỗi block khớp scene tương ứng, không nói về thứ không có trong hình |
| Off-topic | SILENT hoặc FILLER tease nhẹ, không mô tả thẳng |
| Tự nhiên | đọc thấy như người nói chứ không như AI |
| Không bịa | không gán tính năng/giá chưa có trong input |
| CTA mềm | không "mua ngay", không "bấm vào link giảm giá X%" |
| Tổng từ | gần `duration_target_s × 2.8` (±10%) |
| Lặp | không lặp "sản phẩm" >1 lần, không lặp "đỉnh thật sự" |

Khi không đạt: chỉnh `scene_input.json` (thêm note cho scene khó, đổi tone) → re-generate.

---

## Tích hợp với pipeline VFOS

```
scene_input.json
        │
        ▼
  @vfos/script-writer  ──►  script_ai_v1.json + .txt
        │
        ▼
  @vfos/voice (TTS)    ──►  yt_005_voice_v3.mp3
        │
        ▼
  render.ps1 -Mode final -Version v3  ──►  yt_005_voice_v3_preview_vi.mp4
```

Mỗi bước chạy độc lập, output bước trước là input bước sau. Không có pipeline lớn — vẫn là CLI rời.

---

## Roadmap

| Phase | Tính năng |
|-------|-----------|
| **v0 (hiện tại)** | Single-shot script generation, structured JSON output |
| **v1** | Variant generation (2-3 bản: cuốn hơn / tự nhiên hơn / bán mềm hơn) |
| **v1** | Auto-feedback loop: nếu word_count lệch quá nhiều → re-prompt |
| **v2** | Tích hợp với `@vfos/voice`: chained CLI `vfos:script-to-voice` |
| **v2** | Cache prompt cho cost saving (OpenAI prompt caching) |
