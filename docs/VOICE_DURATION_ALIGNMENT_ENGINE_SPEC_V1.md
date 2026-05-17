# Voice Duration Alignment Engine — Spec V1

> **Trạng thái:** Draft — chưa implement
> **Ngày tạo:** 2026-05-18
> **Phạm vi áp dụng:** VFOS Production Pipeline — tất cả video có voiceover

---

## 1. Problem Statement

### Sự cố thực tế kích hoạt spec này

| Thông số | Giá trị |
|----------|---------|
| Video | `yt_004_raw.mp4` |
| Thời lượng video | 26.93s |
| Script thiết kế | ~25–27s (theo `YT_004_VOICE_TIMELINE_FINAL.md`) |
| Voice ElevenLabs output | **17.79s** |
| Chênh lệch | **−9.14s (−34%)** |
| Nguyên nhân | ElevenLabs đọc nhanh hơn ~1.5× so với ước tính |

Nếu ghép trực tiếp, voice sẽ kết thúc lúc 17.8s trong khi video còn 9 giây — sản phẩm bị im lặng, mất đồng bộ toàn bộ text overlay và CTA.

### Định nghĩa vấn đề

Không có cơ chế nào trong pipeline hiện tại để:
1. **Đo** thời lượng voice output trước khi ghép
2. **Quyết định** voice có đạt tiêu chí không
3. **Điều chỉnh** script hoặc speed để khớp target
4. **Lặp lại** cho đến khi đạt dung sai chấp nhận được

---

## 2. Vì Sao Generate Voice Thủ Công Không Scale

### Throughput thực tế

| Quy mô | Video/ngày | Blocks/video | ElevenLabs runs cần thiết (tối thiểu) |
|--------|-----------|--------------|---------------------------------------|
| Pilot (hiện tại) | 1–3 | 3 | 3–9 manual generations |
| Target gần | 10 video | 3 | 30 runs thủ công |
| Target scale | 20 video × 8 kênh | 3–8 | 480–960 runs |

Ở 480+ runs/ngày, thao tác thủ công (paste script → click Generate → nghe thử → download → đo → quyết định) mất khoảng **3–5 phút/run** → **24–80 giờ/ngày** — về cơ bản không khả thi.

### Vấn đề hệ thống, không phải kỹ năng người dùng

Ngay cả người vận hành có kinh nghiệm cũng không thể ước tính WPM của một voice profile mới trên ElevenLabs mà không có empirical calibration. Tốc độ thực tế phụ thuộc vào:

- **Voice profile** (mỗi giọng có WPM mặc định khác nhau)
- **Stability / Style settings** (stability cao → chậm hơn; style cao → nhanh hơn)
- **Nội dung script** (câu dài liên tục vs. câu ngắn nhiều dấu câu)
- **Ngôn ngữ** (Vietnamese TikTok-style khác Vietnamese formal)

Không có bảng WPM chuẩn nào được ElevenLabs publish cho các trường hợp này. VFOS cần tự đo và lưu.

---

## 3. Kiến Trúc Đề Xuất: Voice Duration Alignment Engine (VDAE)

```
┌─────────────────────────────────────────────────────────────────┐
│                    VDAE Orchestrator                            │
│                                                                 │
│  Input: VideoSpec                                               │
│    └── blocks[]: { block_id, target_duration, script_draft }    │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │  Script      │    │  ElevenLabs  │    │  Duration        │  │
│  │  Calibrator  │───▶│  TTS Client  │───▶│  Probe           │  │
│  │  (LLM)       │    │  (API)       │    │  (ffprobe)       │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│         ▲                                        │              │
│         │          ┌──────────────┐              │              │
│         └──────────│  Alignment   │◀─────────────┘              │
│                    │  Decider     │                             │
│                    └──────────────┘                             │
│                           │                                     │
│                    ┌──────▼──────┐                              │
│                    │   Speed     │                              │
│                    │  Adjuster   │                              │
│                    │  (ffmpeg)   │                              │
│                    └─────────────┘                              │
│                                                                 │
│  Output: VoiceAlignmentResult                                   │
│    └── per block: audio_path, actual_duration, delta, status    │
└─────────────────────────────────────────────────────────────────┘
```

### Các component chính

| Component | Trách nhiệm | Tool/API |
|-----------|-------------|----------|
| **VDAE Orchestrator** | Điều phối vòng lặp alignment per block | Node.js |
| **Script Calibrator** | Mở rộng / rút ngắn script theo target word count | Claude API |
| **ElevenLabs TTS Client** | Gọi TTS API, nhận audio + timestamps | ElevenLabs API |
| **Duration Probe** | Đo thời lượng audio output thực tế | ffprobe |
| **Alignment Decider** | Quyết định: accept / speed-adjust / regenerate | Logic thuần |
| **Speed Adjuster** | Áp dụng `atempo` trong ngưỡng an toàn | ffmpeg |
| **WPM Calibration Store** | Lưu trữ WPM thực đo theo voice profile | JSON / Postgres |

---

## 4. Input Schema

```typescript
interface VideoBlockSpec {
  block_id: string;              // "block_1", "block_2", ...
  target_duration_s: number;     // giây, ví dụ: 15.6
  tolerance_s: number;           // dung sai chấp nhận, ví dụ: 0.5
  script_draft: string;          // bản nháp script (có thể chưa đúng độ dài)
  scene_start_s: number;         // mốc bắt đầu trong video gốc
  scene_end_s: number;           // mốc kết thúc
}

interface VoiceProfile {
  profile_id: string;            // "elevenlabs_vi_daniel_v1"
  provider: "elevenlabs";
  voice_id: string;              // ElevenLabs voice ID
  language: "vi" | "en" | string;
  style: "tiktok_energetic" | "calm" | "storytelling";
  settings: {
    stability: number;           // 0.0–1.0
    similarity_boost: number;    // 0.0–1.0
    style: number;               // 0.0–1.0
    speed: number;               // 0.7–1.3 (ElevenLabs native)
  };
  calibrated_wpm?: number;       // WPM thực đo, null nếu chưa calibrate
}

interface VDAEJobInput {
  job_id: string;
  video_id: string;              // "yt_004"
  video_duration_s: number;      // 26.93
  voice_profile: VoiceProfile;
  blocks: VideoBlockSpec[];
  output_dir: string;            // "production/batch_001/yt_004/"
  max_iterations_per_block: number;  // mặc định: 3
}
```

---

## 5. Output Schema

```typescript
type AlignmentStatus =
  | "accepted"           // delta trong ngưỡng, không cần xử lý thêm
  | "speed_adjusted"     // accepted sau khi áp dụng atempo
  | "converged"          // accepted sau N lần regenerate
  | "failed_max_iter"    // hết iteration, delta vẫn ngoài ngưỡng
  | "failed_api_error";  // ElevenLabs / ffprobe lỗi

interface BlockVoiceResult {
  block_id: string;
  target_duration_s: number;
  actual_duration_s: number;
  duration_delta_s: number;      // actual - target, âm = ngắn hơn
  iterations_used: number;
  status: AlignmentStatus;
  final_script: string;          // script thực sự được dùng
  audio_path: string;            // đường dẫn file .mp3/.wav
  timestamps_path?: string;      // JSON timestamps từ ElevenLabs (nếu có)
  subtitles_path?: string;       // .srt/.vtt nếu generate được
  speed_factor_applied?: number; // 1.0 nếu không speed-adjust
}

interface VDAEJobOutput {
  job_id: string;
  video_id: string;
  total_video_duration_s: number;
  total_voice_duration_s: number;
  total_delta_s: number;
  overall_status: "success" | "partial" | "failed";
  blocks: BlockVoiceResult[];
  merged_audio_path?: string;    // audio track ghép từ tất cả blocks
  voice_profile_wpm_observed: number;  // WPM thực tế để update calibration store
  created_at: string;            // ISO timestamp
}
```

---

## 6. Quy Trình Alignment Loop

### Flowchart per block

```
START: block_spec received
  │
  ▼
[1] Estimate target_word_count
    = target_duration_s × calibrated_wpm / 60
    (dùng WPM từ calibration store, hoặc 150 nếu chưa có)
  │
  ▼
[2] Script Calibrator (LLM)
    Expand / trim script_draft → target_word_count ± 10%
    Giữ nguyên nội dung, không bịa thông tin
  │
  ▼
[3] ElevenLabs TTS API
    POST /text-to-speech/{voice_id}/with-timestamps
    → audio (mp3) + character timestamps (JSON)
  │
  ▼
[4] Duration Probe
    ffprobe → actual_duration_s
    delta = actual_duration_s - target_duration_s
  │
  ▼
[5] Alignment Decider
    ┌─────────────────────────────────────────┐
    │ |delta| <= tolerance_s?                 │──YES──▶ STATUS: accepted ✓
    └─────────────────────────────────────────┘
                    │ NO
                    ▼
    ┌─────────────────────────────────────────┐
    │ |delta/target| <= 15%?                  │──YES──▶ [6] Speed Adjuster
    │ (speed-adjust zone)                     │
    └─────────────────────────────────────────┘
                    │ NO (lệch quá 15%)
                    ▼
    ┌─────────────────────────────────────────┐
    │ iterations_remaining > 0?               │──NO───▶ STATUS: failed_max_iter
    └─────────────────────────────────────────┘
                    │ YES
                    ▼
    Update WPM estimate từ kết quả vừa đo
    Quay lại [1] với WPM mới
  │
  ▼
[6] Speed Adjuster (nếu vào nhánh này)
    speed_factor = target_duration_s / actual_duration_s
    Clamp to [0.85, 1.15]  ← guardrail cứng
    ffmpeg -filter:a atempo={speed_factor}
    → overwrite audio file
    STATUS: speed_adjusted ✓
  │
  ▼
END: return BlockVoiceResult
```

### WPM Update Logic

Sau mỗi block hoàn thành:
```
observed_wpm = word_count(final_script) / (actual_duration_s / 60)
new_calibrated_wpm = 0.7 × calibrated_wpm + 0.3 × observed_wpm  // EMA update
```
Lưu `new_calibrated_wpm` vào calibration store theo `(voice_profile_id, language, style)`.

---

## 7. Xử Lý Video Dài — Chunked Strategy

### Nguyên tắc: Không generate một cục cho video dài

| Độ dài video | Strategy |
|-------------|---------|
| 15–60s (Short) | 1–3 blocks, generate song song |
| 1–3 phút (Medium) | 4–12 blocks theo scene cut, generate song song với rate limit |
| 5–10 phút (Long) | 15–40 blocks, generate theo batch của 5, ghép tuần tự |

### Lý do chunk

1. **Rate limit**: ElevenLabs giới hạn concurrent requests (thường 2–5 tùy plan)
2. **Error isolation**: Một block lỗi không phá cả job
3. **Partial retry**: Chỉ regenerate block bị lỗi, không làm lại toàn bộ
4. **Memory**: Audio 10 phút (>100MB uncompressed) không cần load vào RAM cùng lúc

### Block definition cho video dài

```typescript
// Blocks được định nghĩa từ scene detection output
// Mỗi block không nên dài hơn 60s để kiểm soát alignment tốt hơn
interface BlockFromSceneDetection {
  block_id: string;
  scene_start_s: number;
  scene_end_s: number;
  target_duration_s: number;     // = scene_end_s - scene_start_s
  tolerance_s: number;           // scale theo độ dài: 0.5s cho <30s, 1.5s cho 30–60s
  content_type: "hook" | "product_demo" | "transition" | "cta" | "narration";
}
```

### Ghép sau khi generate

```
blocks[0].mp3 + silence_pad(gap_s) + blocks[1].mp3 + ... → merged_voice.mp3
```
Gap giữa blocks có thể là 0 hoặc breath-pause nhỏ (~0.1–0.2s) nếu cần.

---

## 8. Tích Hợp ElevenLabs

### 8.1 TTS API (core)

**Endpoint:** `POST /v1/text-to-speech/{voice_id}`

```json
{
  "text": "...",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.50,
    "similarity_boost": 0.75,
    "style": 0.40,
    "use_speaker_boost": true
  }
}
```

**Lưu ý quan trọng:**
- `speed` parameter: ElevenLabs hỗ trợ `speed` trong voice_settings (0.7–1.3) — thử điều chỉnh ở đây **trước** khi dùng ffmpeg atempo
- Model `eleven_multilingual_v2` tốt nhất cho Vietnamese
- `eleven_turbo_v2_5` nếu cần throughput cao, chấp nhận quality thấp hơn nhẹ

### 8.2 Timestamps API (alignment + subtitle)

**Endpoint:** `POST /v1/text-to-speech/{voice_id}/with-timestamps`

Response trả về:
```json
{
  "audio_base64": "...",
  "alignment": {
    "characters": ["3", " ", "đ", "ồ", ...],
    "character_start_times_seconds": [0.0, 0.08, 0.09, ...],
    "character_end_times_seconds": [0.08, 0.09, 0.15, ...]
  }
}
```

**Ứng dụng trong VDAE:**
1. **Subtitle generation**: Group characters thành words → tạo SRT/VTT tự động
2. **Word-level timing**: Biết chính xác "Số 1" xuất hiện lúc nào trong audio → so với scene cut timestamp → tính sync offset
3. **Forced alignment check**: Nếu "Số 2" trong voice xuất hiện sau 15.6s nhưng scene cut video ở 15.6s → cần điều chỉnh pad trước block

### 8.3 Subtitle Generation từ Timestamps

```
character timestamps → word groups → SRT segments
Mỗi segment: 3–7 chữ, không cắt giữa từ
Output: yt_004_subtitles_vi.srt
```

### 8.4 Rate Limit Management

| Plan | Concurrent | Chars/month |
|------|-----------|-------------|
| Starter | 2 | 30K |
| Creator | 5 | 100K |
| Pro | 10 | 500K |

VDAE cần implement:
- **Job queue** (BullMQ): giới hạn concurrent ElevenLabs jobs theo plan
- **Retry với exponential backoff** cho HTTP 429
- **Character counter** để cảnh báo khi gần đạt limit

---

## 9. Guardrails

### 9.1 Speed Adjustment

| Điều kiện | Hành động |
|-----------|-----------|
| `speed_factor` trong [0.85, 1.15] | Áp dụng atempo, chấp nhận kết quả |
| `speed_factor` < 0.85 | Không dùng atempo → regenerate với script dài hơn |
| `speed_factor` > 1.15 | Không dùng atempo → regenerate với script ngắn hơn |
| ElevenLabs speed param đủ | Ưu tiên điều chỉnh qua API trước ffmpeg |

**Lý do:** `atempo` > 1.2× tạo hiệu ứng giọng robot rõ rệt. `atempo` < 0.8× làm giọng "kéo dài" không tự nhiên. Cả hai đều gây viewer drop-off.

### 9.2 Script Calibrator Constraints

Script Calibrator (LLM) phải tuân theo:
- **Không bịa sản phẩm / giá / thông tin** không có trong draft ban đầu
- **Không thêm CTA không liên quan** (không thêm "follow để xem thêm" nếu draft không có)
- Khi expand: thêm descriptors cảm xúc, nhịp ngắt, lặp ý — không thêm facts mới
- Khi trim: ưu tiên cắt câu cuối của block, không cắt hook đầu
- Max expand: 150% word count ban đầu
- Max trim: 60% word count ban đầu

### 9.3 Silence Padding

- **Không pad silence** trong block để kéo dài đến target
- Pad silence giữa blocks tối đa 0.3s (breath pause tự nhiên)
- Nếu cần gap lớn hơn → đây là signal script block cần expand

### 9.4 Iteration Limit

- Max 3 iterations mặc định per block
- Nếu sau 3 iterations vẫn `failed_max_iter` → log warning, dùng bản tốt nhất (delta nhỏ nhất), flag manual review
- Không block toàn bộ job vì một block lỗi

---

## 10. Roadmap Triển Khai

### v0 — Short Video Alignment (video 15–60s)

**Phạm vi:** Giải quyết đúng case yt_004 và các Shorts tương tự

**Mục tiêu:** Operator nhập script draft + video duration → nhận audio đã align

**Tính năng:**
- WPM calibration cho 1 voice profile (hard-coded ban đầu)
- Alignment loop đơn giản: generate → probe → speed-adjust nếu ≤15% lệch
- Output: `{video_id}_voice_vi.mp3` đã align

**Không có trong v0:**
- LLM script calibration
- Timestamps API / subtitle
- Multi-block parallelism
- Job queue

**Estimate:** 2–3 ngày implement, 1 ngày test với yt_004

---

### v1 — Multi-Block Alignment (video 15–60s với 2–8 blocks)

**Phạm vi:** Align per block, không chỉ toàn video

**Tính năng mới so với v0:**
- Block-level orchestration
- LLM Script Calibrator (Claude API) để expand/trim
- WPM Calibration Store (JSON file, upgrade lên Postgres ở v2)
- ElevenLabs Timestamps API → SRT output
- Parallel block generation (2 concurrent)
- Partial retry per block

**Kết quả operator nhận:**
- Audio per block + merged audio
- SRT subtitles
- Alignment report JSON

**Estimate:** 5–7 ngày implement, 2 ngày test với batch 3 video

---

### v2 — Long Video + Scale (video 1–10 phút, 10–20 video/ngày)

**Phạm vi:** Full scale production

**Tính năng mới so với v1:**
- BullMQ job queue với ElevenLabs rate limiting
- Character usage tracking + budget alerting
- Postgres-backed WPM calibration (multiple profiles/languages)
- Adaptive tolerance (tighter cho short blocks, looser cho long blocks)
- n8n workflow integration → trigger sau scene detection
- Dashboard: alignment success rate, average iterations, WPM drift theo thời gian
- Multi-language support (vi, en, th, id)

**Estimate:** 2–3 tuần implement

---

## 11. Module / File Cần Tạo Khi Implement

> Chưa tạo ở phiên này. Chỉ là đề xuất cấu trúc.

```
src/
  voice/
    vdae-orchestrator.ts          # VDAE Orchestrator — điều phối toàn bộ job
    script-calibrator.ts          # Gọi Claude API để expand/trim script
    elevenlabs-client.ts          # Wrapper ElevenLabs TTS + Timestamps API
    duration-probe.ts             # Wrap ffprobe → trả về số giây
    alignment-decider.ts          # Logic quyết định accept/speed-adjust/regenerate
    speed-adjuster.ts             # Wrap ffmpeg atempo
    wpm-store.ts                  # Đọc/ghi WPM calibration data
    subtitle-generator.ts         # Convert ElevenLabs timestamps → SRT/VTT
    types.ts                      # VDAEJobInput, VDAEJobOutput, tất cả interfaces

config/
  voice-profiles.json             # Khai báo voice profiles + WPM đã calibrate

data/
  wpm-calibration.json            # WPM thực đo theo profile/language/style (v0–v1)

scripts/
  calibrate-voice-profile.ts      # CLI: chạy 1 lần để đo WPM một voice profile mới
  run-vdae.ts                     # CLI: chạy VDAE cho một video/batch từ terminal

tests/
  voice/
    vdae-orchestrator.test.ts
    alignment-decider.test.ts
    script-calibrator.test.ts
```

### Dependency cần add khi implement

```json
{
  "elevenlabs": "^1.x",           // ElevenLabs official Node SDK
  "@anthropic-ai/sdk": "^0.x",   // Claude API (đã có trong stack)
  "fluent-ffmpeg": "^2.x",       // ffmpeg wrapper cho speed-adjuster
  "bullmq": "^5.x"               // Job queue (v2+)
}
```

---

## 12. Metrics Đo Lường Thành Công

| Metric | Target v0 | Target v1 | Target v2 |
|--------|-----------|-----------|-----------|
| Alignment success rate | >80% | >90% | >95% |
| Average iterations/block | — | <2 | <1.5 |
| Time to aligned audio (video ngắn) | <5 phút thủ công | <2 phút tự động | <1 phút tự động |
| Operator touch points/video | 3–5 | 1 (review output) | 0 (fully automated) |
| Delta sau alignment | ±1.5s | ±0.5s | ±0.3s |

---

## Phụ lục: Empirical Data yt_004

Dùng làm baseline calibration cho voice profile đầu tiên.

| Thông số | Giá trị |
|----------|---------|
| Video | `yt_004_raw.mp4` |
| Voice profile | ElevenLabs, Vietnamese, Nam năng lượng cao |
| Script (approx.) | ~70 từ |
| Output thực tế | 17.79s |
| WPM observed | ~236 WPM |
| Target | 26.93s |
| WPM cần để khớp target | ~156 WPM |
| ElevenLabs speed param cần | ~0.66× (quá thấp → regenerate script dài hơn) |
| Hành động đúng | Expand script lên ~106 từ VÀ tăng stability lên 0.60–0.65 |

> **Kết luận:** WPM 236 là quá nhanh cho Shorts-style Vietnamese. Calibrate target WPM về 150–170 cho style TikTok năng lượng cao (không phải racing-commentator). Ưu tiên expand script thay vì slow-down ffmpeg.
