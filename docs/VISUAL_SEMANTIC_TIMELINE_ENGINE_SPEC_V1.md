# Visual-Semantic Timeline Engine (VSTE) — Spec v1

> **Loại tài liệu**: Architecture spec — thiết kế nền tảng, chưa triển khai.
> **Lý do tồn tại**: Phát sinh từ production thực tế batch_001 yt_004 — duration khớp nhưng audio phát lệch semantic với hình.
> **Ngày**: 2026-05-18

---

## 1. Problem Statement

### 1.1 Duration alignment là điều kiện cần nhưng chưa đủ

VFOS hiện có pipeline:

```
script → TTS (ElevenLabs) → duration probe → ghép video
```

Duration của voice (26.880s) có thể khớp gần tuyệt đối với video (26.947s). Nhưng đây chỉ là **temporal alignment** (đồng bộ thời lượng tổng), không phải **semantic alignment** (đồng bộ ý nghĩa từng đoạn).

### 1.2 Lỗi thực tế: yt_004

**Video**: Top 3 Small Kitchen Gadgets — 26.93s

| Đoạn | Thời gian | Nội dung thực trên màn hình | Script voice hiện tại |
|---|---|---|---|
| Intro | 0:00 – 0:02 | Hoạt hình/animation giới thiệu kênh | Bắt đầu "3 đồ bếp..." ngay |
| Sản phẩm 1 | 0:02 – 0:15.6 | Demo sản phẩm 1 | Đang nói về sản phẩm 1 — khớp |
| Sản phẩm 2 | 0:15.6 – 0:21.5 | Demo sản phẩm 2 | Khớp |
| Sản phẩm 3 | 0:21.5 – 0:26.9 | Demo sản phẩm 3 + CTA | Khớp |

**Lỗi**: 2 giây đầu — màn hình đang phát hoạt hình channel intro nhưng voice đã bắt đầu quảng cáo sản phẩm. Người xem thấy hai thứ không liên quan nhau cùng lúc.

### 1.3 Tại sao đây là lỗi hệ thống, không phải lỗi người dùng

Script được viết dựa trên **mô tả text** của video (metadata, brief). Không ai thấy rằng video có 2 giây intro animation vì thông tin đó chỉ có trong hình ảnh thực tế, không có trong text description. Nếu không giải quyết bài toán này ở tầng hệ thống, lỗi sẽ tái diễn mỗi batch.

---

## 2. Phân biệt ba khái niệm cốt lõi

### 2.1 Scene Change Detection

Phát hiện **khi nào** cảnh thay đổi — dựa trên pixel difference, histogram shift, cut detection. Đây là bài toán kỹ thuật thuần túy, ffmpeg làm được.

**Cho biết**: Có bao nhiêu đoạn, mỗi đoạn bắt đầu/kết thúc lúc nào.

**Không cho biết**: Đoạn đó đang hiển thị gì, có nghĩa gì.

### 2.2 Semantic Scene Understanding

Hiểu **nội dung** của từng đoạn — đây là gì, đang làm gì, có liên quan đến sản phẩm không. Cần multimodal AI (vision model).

**Cho biết**: "Đoạn 0-2s là hoạt hình logo kênh", "Đoạn 2-15s là người đang demo cây lau sàn".

**Không cho biết**: Nên đọc gì ở đoạn đó (đó là bước tiếp theo).

### 2.3 Narration Alignment

Căn chỉnh **nội dung lời đọc** vào **semantic timeline** đã biết, đảm bảo lời nói phù hợp với hình ảnh đang hiển thị cùng lúc.

**Cho biết**: Câu nào đọc lúc nào, đoạn nào giữ im lặng, đoạn nào chỉ dùng hook ngắn.

Đây là output cuối cùng cần có trước khi gọi TTS.

---

## 3. Kiến trúc đề xuất

```
Video file
    │
    ▼
┌─────────────────────────┐
│  Keyframe Extraction    │  ffmpeg / fps sampling
│  (1–2 fps grid)         │
└──────────┬──────────────┘
           │ frame grid (JPG/PNG)
           ▼
┌─────────────────────────┐
│  Scene Segmentation     │  ffmpeg scene detect + temporal clustering
│  (temporal boundaries)  │
└──────────┬──────────────┘
           │ segment boundaries [t_start, t_end]
           ▼
┌─────────────────────────┐
│  Visual Understanding   │  Multimodal AI (vision model)
│  (per-segment caption)  │  Input: keyframes của đoạn đó
└──────────┬──────────────┘
           │ semantic label + visual summary per segment
           ▼
┌─────────────────────────┐
│  Semantic Timeline      │  JSON schema chuẩn hóa
│  (VSTE output)          │
└──────────┬──────────────┘
           │ timeline với narration_allowed, style hints
           ▼
┌─────────────────────────┐
│  Script Planning        │  LLM viết script, bám timeline
│  (narration-aware)      │  Biết đoạn nào câm, đoạn nào hook ngắn
└──────────┬──────────────┘
           │ script có timestamp annotation
           ▼
┌─────────────────────────┐
│  Voice Generation       │  ElevenLabs TTS (eleven_v3)
│  (TTS per block)        │  Có thể chia thành nhiều audio block
└──────────┬──────────────┘
           │ audio file(s)
           ▼
┌─────────────────────────┐
│  Duration Alignment     │  Probe + validate timing
│  (existing layer)       │  Đảm bảo block audio khớp block video
└─────────────────────────┘
```

---

## 4. Semantic Timeline Schema

### 4.1 File output

`{video_id}_semantic_timeline.json`

### 4.2 Root schema

```json
{
  "video_id": "yt_004",
  "source_file": "yt_004_raw.mp4",
  "total_duration_s": 26.93,
  "analyzed_at": "2026-05-18T00:00:00Z",
  "analyzer_version": "v0-manual",
  "segments": [ ... ]
}
```

### 4.3 Segment schema

```json
{
  "segment_id": "seg_001",
  "start_time_s": 0.0,
  "end_time_s": 2.1,
  "duration_s": 2.1,

  "segment_type": "intro_animation",
  "visual_summary": "Hoạt hình logo kênh, nền đen, chữ xuất hiện dần",
  "confidence": 0.92,

  "narration_allowed": false,
  "narration_style": null,
  "narration_notes": "Không đọc gì trong đoạn này. Giữ im lặng hoặc dùng nhạc nền.",

  "hook_candidate": false,
  "product_present": false,
  "affiliate_opportunity": false
}
```

### 4.4 Giá trị hợp lệ cho `segment_type`

| Giá trị | Mô tả | narration_allowed mặc định |
|---|---|---|
| `intro_animation` | Hoạt hình/logo/bumper mở đầu | `false` |
| `title_card` | Màn hình title text (ít hình động) | `false` hoặc hook ngắn |
| `product_demo` | Demo sản phẩm rõ ràng, có tay/vật | `true` |
| `speaking_head` | Người nói chuyện trực tiếp vào camera | `false` — giữ nguyên voice gốc hoặc thay |
| `scenery` | Cảnh nền, phong cảnh, B-roll | `true` nhưng nhẹ nhàng |
| `transition` | Hiệu ứng chuyển cảnh ngắn (<0.5s) | `false` |
| `text_overlay_heavy` | Màn hình đầy text — người xem đang đọc | `false` hoặc tóm tắt |
| `outro` | Kết thúc video, CTA, subscribe screen | `true` nhưng chỉ CTA |
| `unknown` | Không đủ thông tin để phân loại | `false` — giữ an toàn |

---

## 5. Xử lý intro / bumper / title card

### 5.1 Nguyên tắc

> **Quy tắc cơ bản**: Nếu màn hình chưa hiển thị sản phẩm hoặc context liên quan, KHÔNG phát voice bán hàng.

Phá quy tắc này → người xem nghe quảng cáo trong khi chưa thấy gì → mất trust, drop-off sớm.

### 5.2 Bảng quyết định

| Loại đoạn | Thời lượng | Hành động đề xuất |
|---|---|---|
| `intro_animation` | < 1.5s | Im lặng hoàn toàn, nhạc nền nhẹ |
| `intro_animation` | 1.5s – 3s | Có thể dùng hook 1 câu ngắn (<3 words tiếng Việt) như "Xem nào!" hoặc âm thanh attention |
| `intro_animation` | > 3s | Dùng hook câu đầy đủ, nhưng chưa đề cập sản phẩm |
| `title_card` | bất kỳ | Đọc nội dung title card hoặc im lặng |
| `transition` | < 0.5s | Không làm gì, ghép tiếp voice từ đoạn trước |
| `outro` | bất kỳ | CTA rõ ràng: link bio, Shopee, TikTok Shop |

### 5.3 Ví dụ yt_004 sau khi áp dụng

| Đoạn | t_start | t_end | Loại | Voice được phép |
|---|---|---|---|---|
| Logo/intro | 0.0 | 2.1 | `intro_animation` | Hook 1 câu: *"Xem ngay!"* hoặc im lặng |
| Demo sp1 | 2.1 | 15.6 | `product_demo` | Full narration: mô tả sản phẩm 1 |
| Demo sp2 | 15.6 | 21.5 | `product_demo` | Full narration: mô tả sản phẩm 2 |
| Demo sp3 + CTA | 21.5 | 26.9 | `product_demo` + `outro` | Full narration + CTA link Shopee |

---

## 6. Công cụ khả thi

### 6.1 Scene Detection — ffmpeg (sẵn có)

```bash
ffmpeg -i input.mp4 \
  -vf "select='gt(scene,0.3)',showinfo" \
  -vsync vfr \
  -frame_pts true \
  frames/frame_%04d.jpg
```

Hoặc dùng scene detect filter để xuất timestamp:
```bash
ffmpeg -i input.mp4 -filter:v "select='gt(scene,0.4)',metadata=print:file=scenes.txt" \
  -frames:v 1000 -vsync 0 frames/scene_%04d.jpg
```

**Threshold**: 0.3–0.4 thường phù hợp với video short. Cần calibrate per video type.

### 6.2 Frame Grid / Contact Sheet

Tạo lưới hình thu nhỏ để xem toàn bộ video một lần:

```bash
ffmpeg -i input.mp4 -vf "fps=1,scale=320:-1,tile=5x6" contact_sheet.jpg
```

Dùng để: xem nhanh trước khi gửi cho AI, debug, manual labeling.

### 6.3 Multimodal AI / Video Vision

**Hiện tại** (v0): Gửi keyframes thủ công hoặc bán tự động vào:
- Claude claude-sonnet-4-6 (vision) — mô tả từng frame hoặc tập frame
- GPT-4o (vision)

**Input**: Tập JPG keyframes của đoạn + câu hỏi: *"Mô tả nội dung đoạn video này. Có sản phẩm không? Đây là loại cảnh gì?"*

**Output**: JSON theo `segment_type` + `visual_summary`.

**Hướng mở rộng** (v1–v2):
- Google Gemini Video API — hỗ trợ video trực tiếp, không cần extract frame thủ công
- OpenAI Video (nếu có GA)
- Self-hosted: `video-llava`, `CogVideoX` cho frame captioning

### 6.4 Video dài 3–10 phút

Với short video <60s: phân tích toàn bộ frame là khả thi.

Với video dài:
- Sample 1 frame/3s thay vì 1 frame/1s → giảm 3x input tokens
- Chia video thành sliding window 60s, phân tích từng window
- Chỉ send scene-change frames, không send toàn bộ

---

## 7. Guardrails

### 7.1 Không suy luận từ brightness hoặc scene cut đơn thuần

Sai:
> "Đây là scene cut → hẳn đoạn mới này là sản phẩm mới"

Đúng:
> Phải có visual evidence (caption AI hoặc manual label) mới được gán `segment_type`.

### 7.2 Nếu không hiểu đoạn hình → đánh `unknown`

`unknown` có `narration_allowed: false` theo mặc định. Thà giữ im lặng còn hơn nói sai chỗ.

### 7.3 Script phải bám semantic timeline

Script writer (LLM hoặc người) **bắt buộc** nhận `semantic_timeline.json` làm input, không được viết script chỉ từ brief text.

Nếu chưa có semantic timeline → không được gọi TTS.

### 7.4 Không nhồi voice vào đoạn không có visual support

Ví dụ: đang hiển thị cây lau sàn → không đọc về sản phẩm 2 (dụng cụ bóc trứng) vì người xem sẽ bị confused.

---

## 8. Ứng dụng theo loại video

### 8.1 Short Product Demo (<60s)

Ví dụ: yt_004, yt_003

- Keyframe tại 1fps là đủ
- Thường có 3–6 segments rõ ràng
- Intro animation là vấn đề phổ biến nhất → phải handle

### 8.2 Content-Led Affiliate Video

Ví dụ: video câu cá, du lịch, đời sống

- Hầu hết là `scenery` hoặc `speaking_head`
- `narration_allowed: true` cho scenery → tự do hơn khi viết voice-over
- Cần identify: đoạn nào là khoảnh khắc mạnh nhất (emotional peak) để đặt CTA

### 8.3 Video tiếng Trung có lời thoại (speaking_head)

- `speaking_head` segment → cần quyết định: thay voice hoàn toàn hay dùng giọng AI dịch đè lên?
- VSTE phải mark rõ `speaking_head` để script planner biết không overlap với giọng gốc còn nghe được

### 8.4 Video dài nhiều cảnh (3–10 phút)

- Cần scene segmentation tốt hơn (threshold động)
- Semantic timeline sẽ có 20–50 segments
- Script planning phải xử lý narrative arc dài — không chỉ list mô tả sản phẩm

---

## 9. Roadmap

### v0 — Keyframe + Manual/AI Labeling (Shorts)

**Mục tiêu**: Giải quyết ngay lỗi yt_004. Không cần build tool.

**Quy trình**:
1. Dùng ffmpeg extract 1 frame/s
2. Tạo contact sheet để nhìn tổng quan
3. Gửi keyframes vào Claude vision → mô tả từng đoạn
4. Điền `semantic_timeline.json` thủ công / bán tự động
5. Script writer đọc timeline trước khi viết

**Thời gian per video**: ~15–20 phút

**Output**: `{video_id}_semantic_timeline.json` chuẩn

---

### v1 — Automated Segment Classification

**Mục tiêu**: Tự động hóa bước vision + labeling.

**Cần build**:
- CLI tool: `vfos video:analyze --input <mp4> --output <timeline.json>`
- Tích hợp ffmpeg scene detection
- Call multimodal AI tự động per segment
- Validate output JSON theo schema

**Dependency**: `@vfos/video-analyzer` package (mới)

---

### v2 — Full Timeline Planning cho Video 3–10 phút

**Mục tiêu**: Handle video dài, tích hợp với ContentFactory agent.

**Cần build**:
- Sliding window analyzer
- Narrative arc detection (rising action, climax, CTA placement)
- Script planner agent nhận semantic timeline làm context
- Auto-sync TTS output với video timeline (per-block audio stitching)

---

## 10. Tại sao spec này cần trước khi scale production

Batch 001 có 3 video. Nếu lỗi semantic mismatch chỉ ảnh hưởng 1 video → damage thấp.

Khi scale lên 10–20 video/batch:
- Cùng loại lỗi xảy ra trên 60–70% video (mọi video ngắn đều có intro)
- Người xem drop-off ngay từ giây đầu → watch time thấp → TikTok/Reels không push
- Affiliate click bằng 0 dù video kỹ thuật hoàn chỉnh

VSTE không phải "nice to have". Đây là layer bắt buộc để content-led affiliate hoạt động đúng — vì xác suất viral của một video phụ thuộc vào 3 giây đầu tiên, và 3 giây đầu tiên phải audio-visual coherent.

---

## Phụ lục A — File liên quan

| File | Vai trò |
|---|---|
| `docs/YT_004_VOICE_TIMELINE_FINAL.md` | Timeline thủ công yt_004 — tiền thân của semantic timeline |
| `docs/VOE_SPEC_V1.md` | VOE upstream — cung cấp metadata đầu vào |
| `docs/PRODUCTION_EXECUTION_PACK_BATCH_001.md` | Script hiện tại — viết thiếu timeline context |
| `docs/PRODUCTION_PILOT_001_PLAN.md` | Kế hoạch pilot — cần update để thêm bước VSTE |

---

## Phụ lục B — Câu hỏi cần trả lời trước khi build v1

1. Multimodal model nào cho kết quả tốt nhất với video ngắn tiếng Trung/Việt? (Claude vs Gemini vs GPT-4o)
2. Frame sampling rate tối ưu cho short video <60s?
3. `segment_type` taxonomy có đủ hay cần thêm loại mới sau batch 001?
4. TTS per-block (nhiều file audio nhỏ) vs TTS toàn bộ rồi crop — cái nào ít artifact hơn?
