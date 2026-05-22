# VFOS Short-form Factory — Blueprint v0

> **Loại tài liệu**: Blueprint nhân bản dây chuyền — đọc trước khi xây Con số 2+
> **Tạo**: 2026-05-20
> **Trạng thái**: v0 — được chốt sau khi Con số 1 validate qua yt_005 + yt_006
> **Nguyên tắc**: Không fork kiến trúc bừa bãi. Chỉ nhân bản sau khi Con số 1 chứng minh hiệu quả.

---

## 1. Con số 1 là gì?

**Tên logic**: VFOS Short-form Affiliate Production Factory v0

**Mục tiêu**: Tự động hóa việc biến video demo sản phẩm nước ngoài (TikTok TQ, YouTube Shorts) thành
short-form video tiếng Việt có voice-over AI + BGM, sẵn sàng đăng Facebook Reels / TikTok VN gắn affiliate.

**Ngách khai thác**: Gadget, đồ gia dụng, đồ bếp — satisfying demo, kết quả thấy được rõ ràng.

**Đã chứng minh qua**:
- `yt_005` — video test pipeline đầu tiên (53s, đồ gia dụng, 10 blocks voice sync, BGM Mix v1)
- `yt_006` — pilot thứ hai (59s, 5 gadget mini, 6 blocks, BGM Mix -4.3 dBFS, user review mở preview)
- Pipeline không bị coupled với yt_005 — xác nhận generalize được

---

## 2. Core Pipeline — Cố định, không thay đổi khi nhân bản

Đây là "xương sống" chung của mọi con. Cải tiến ở đây thì tất cả con cùng hưởng lợi.

```
[SOURCE] → [ANALYZE] → [SCRIPT] → [VOICE] → [BGM] → [PREVIEW]
```

| Bước | Module | Input | Output | Tool |
|---|---|---|---|---|
| 1. Tải video | yt-dlp | URL / tìm thủ công | `<id>_source.mp4` | yt-dlp |
| 2. Phân tích | FFmpeg keyframe | source.mp4 | `keyframes/*.jpg` | ffmpeg |
| 3. Scene input | Manual / AI | keyframes + visual | `scene_input.json` | Agent |
| 4. Script Writer | `packages/script-writer` | scene_input.json | `script_ai_vX.json` + `.txt` | OpenAI gpt-4o |
| 5. Voice Sync | `packages/voice/scripts/sync.ts` | script.json + source.mp4 | `voice_timeline.mp3` | ElevenLabs eleven_v3 |
| 6. BGM Mix | `packages/voice/scripts/bgm-mix.ts` | voice_timeline + source.mp4 | `preview.mp4` | FFmpeg amix |
| 7. QC | Built-in trong bgm-mix.ts | preview.mp4 | volumedetect report | FFmpeg |

**Params đã chốt (Con số 1 — Short-form gadget)**:
- Voice: ElevenLabs `eleven_v3`, speed=1.3
- VFOS brand voice: `ZqE9vIHPcrC35dZv0Svu` — MỘT giọng duy nhất cho mọi video (chốt 2026-05-20). Multi-preset `voice_01..05` đã retire.
- BGM volume: 0.0972 (-20.2 dBFS), Voice gain: 1.716 (+4.7 dB), Final gain: 1.3 (+2.3 dB)
- BGM fadein: 1.5s, fadeout: 3.0s
- BGM source default: `yt_005_bgm_v2_candidate_b.mp3` (ElevenLabs Music API, "Light cheerful, bright piano")

**Chất lượng output mong đợi**:
- max_volume: -4 đến -9 dBFS (không clip, có headroom)
- Tất cả voice blocks FIT hoặc overflow_minor ≤0.5s
- Script PASS quality guard: word count ±5% target, hook/CTA tự nhiên

---

## 3. Phần Configurable — Thay khi nhân bản Con 2–10

Đây là 4 "knob" có thể thay để tạo ra con mới mà **không cần fork kiến trúc**:

> **Note Phần 20–22 (2026-05-22)** — **SUPERSEDED bởi Phần 22 pivot**:
>
> Phần 20+21 ban đầu mô tả "Product-First Lane" chung (Shopee + TikTok Shop song song). Phần 22 (2026-05-22) **pivot Product-First → Shopee-First Only v0**, **TikTok Shop defer** (future lane, không triển khai trong giai đoạn này).
>
> **Lane orientation hiện tại** (sau Phần 22):
> - **Video-First** (default MODE 1/2/3) — tìm video trước → match Shopee affiliate sau. ACTIVE.
> - **Shopee-First** (MODE 4) — chọn sản phẩm **Shopee VN** trước → tìm video/demo tương đồng sau, output **Facebook Reels + Shopee Affiliate**, có **GUARD 8 Shopee Product Match**. ACTIVE (lane chính hiện tại).
> - **TikTok-Shop-First** — TikTok Video → TikTok Shop Affiliate. **FUTURE / DEFER** (chốt 2026-05-22 Phần 22). KHÔNG triển khai trong giai đoạn này. Sẽ revisit khi user mở lại scope.
>
> Lane KHÔNG phải knob configurable — là **mode operational** chọn ngay khi gọi `/chay` (MODE 1/2/3 = Video-First; MODE 4 = Shopee-First). Trigger chung `/chay product-first` → mặc định route Shopee-First (TikTok Shop defer).
>
> **Shopee Product Card 10 field** (Phần 22 schema mới): `shopee_product_url`, `product_name`, `price_vnd`, `commission_pct`, `sales_count`, `rating`, `review_count`, `shop_name`, `why_worthwhile`, `data_confidence`. Field unknown ghi `"unknown"` — KHÔNG bịa.
>
> **Shopee Product Discovery Mode** (Phần 21+22): `/chay shopee-first` hoặc `/chay product-first` không kèm link → agent tự tìm candidate Shopee theo lane, chấm Shopee Product Selection Scoring 6 trục, auto chọn nếu ≥13/18 và trục risk ≥2. Discovery KHÔNG bịa link Shopee/giá/hoa hồng — nếu không lấy được data Shopee trực tiếp thì báo limitation + xin user dán link Shopee.
>
> Chi tiết: `.claude/skills/chay/SKILL.md` sections "SHOPEE-FIRST LANE v0" + "SHOPEE PRODUCT DISCOVERY MODE v0" + "SHOPEE PRODUCT SELECTION SCORING" + "GUARD 8 SHOPEE PRODUCT MATCH GUARD".

### Knob A — Source Profile (cách tìm video)

Định nghĩa: TÌM video ở đâu, theo cách nào?

| Field | Con số 1 (hiện tại) | Ví dụ Con số 2+ |
|---|---|---|
| Platform | YouTube Shorts, TikTok TQ | Pinterest, Instagram Reels, Douyin |
| Search strategy | Tìm thủ công theo keyword | YouTube Data API, TikTok hashtag scrape |
| Discovery agent | Manual | Tự động theo lịch |
| Frequency | 1 video / run | Batch theo ngày |

**Cách override**: Truyền `source_profile` trong scene_input hoặc thêm discovery agent riêng.

---

### Knob B — Scoring Profile (tiêu chí chọn video)

Định nghĩa: Video như thế nào thì HỢP LỆ để đưa vào pipeline?

| Tiêu chí | Con số 1 (hiện tại) |
|---|---|
| Duration | 15–90s (ưu tiên 30–60s) |
| Orientation | Portrait 9:16 |
| Nội dung | Gadget demo, kết quả rõ ràng |
| Watermark | Chấp nhận logo nhỏ góc |
| Hook type | Satisfying demo, không cần diễn xuất |

**Cách override**: Viết `scoring_profile.json` cho từng con.

---

### Knob C — Edit Profile (kiểu xử lý nội dung)

Định nghĩa: Cách biến đổi video nguồn thành output.

| Yếu tố | Con số 1 (hiện tại) | Có thể thay |
|---|---|---|
| Script style | Content-led, reviewer ngắn, không quảng cáo cứng | Hài hước, storytelling, comparison |
| Voice | 1 brand voice `ZqE9vIHPcrC35dZv0Svu` (Eleven v3) — cố định, không random | Đổi voice khác cho ngách khác (CHỈ khi user duyệt rõ ràng) |
| BGM style | Light cheerful, bright piano | Lo-fi, energetic, hiphop... |
| CTA style | Soft ("link bio nhé") | Stronger ("order ngay...") |
| Text overlay | Không có (thủ công CapCut) | Tự động caption |
| Speed | 1.3x TTS | 1.0x hoặc 1.5x |

**Cách override**: Truyền `tone`, `cta_style`, `affiliate_angle` khác trong scene_input.json + thay BGM file. Voice CHỈ đổi khi có quyết định chiến lược (không đổi tự động theo ngách).

---

### Knob D — Niche/Affiliate Profile (ngách khai thác)

Định nghĩa: Khai thác thị trường nào, gắn affiliate nào?

> **Cập nhật Phần 22 (2026-05-22)**: Ví dụ "Con 2 dùng TikTok Shop VN" ở bảng dưới là **hypothetical illustration** của Knob D, KHÔNG phải lane active. TikTok Shop hiện đang **DEFER** (xem note Phần 22 ở đầu Section 3). Con 2 thực tế khi user duyệt mở sẽ vẫn nên dùng **Shopee VN** trừ khi user mở lại scope TikTok Shop.

| Yếu tố | Con số 1 (hiện tại) | Ví dụ Con 2+ (hypothetical) |
|---|---|---|
| Ngách | Gadget / đồ gia dụng / đồ bếp | Làm đẹp / skincare |
| Platform affiliate | **Shopee VN** (ACTIVE) | TikTok Shop VN *(future, defer — xem Phần 22)* |
| CTA target | "Link bio" | "Bình luận SHOPEE" |
| Audience | Nội trợ, gia đình, người thích đồ bếp | GenZ, beauty |
| Price positioning | Giá rẻ, hàng Trung Quốc | Giá trung, hàng brand |

**Cách override**: Viết `niche_profile.json` + update few-shot examples trong Script Writer.

---

## 4. Ví dụ nhân bản — Từ Con 1 thành Con 2

```
Con số 1: Gadget đồ bếp từ TQ → Shopee VN → Facebook Reels
  Source: Tự tìm YouTube Shorts / TikTok TQ
  Score: Duration 15–90s, portrait, gadget demo rõ
  Edit: Voice-over tiếng Việt, BGM piano nhẹ, CTA soft
  Niche: Shopee, đồ gia dụng, giá rẻ

Con số 2 (ví dụ hypothetical — TikTok Shop CURRENTLY DEFER per Phần 22):
  Đồ làm đẹp từ TQ → TikTok Shop VN → TikTok Reels
  Source: Douyin hashtag scrape (agent mới — THAY)
  Score: Duration 15–60s, portrait, skincare demo rõ (THAY tiêu chí)
  Edit: Voice nữ, BGM pop nhẹ, CTA "thả tim + bình luận SHOP" (THAY voice + BGM + CTA)
  Niche: TikTok Shop, skincare, GenZ (THAY)
  Core pipeline: GIỮ NGUYÊN (yt-dlp + Script Writer + Voice Sync + BGM Mix)
  ⚠️ Note: Phần 22 (2026-05-22) defer TikTok Shop. Khi user duyệt Con 2 thật,
  default sẽ là Shopee VN + Facebook Reels, không phải TikTok Shop + TikTok
  Reels. Ví dụ trên giữ làm illustration cho Knob D khi mở lại TikTok Shop.
```

**Điều quan trọng**: Con 2 chỉ thay 4 knob, không xây lại Script Writer hay Voice Sync.

---

## 5. Quy tắc nhân bản

```
QUY TẮC 1 — Không nhân bản khi chưa chứng minh
  → Con số 1 phải có ≥3 video pilot với kết quả đủ tốt TRƯỚC khi nghĩ đến Con 2
  → Chứng minh = pipeline chạy ổn định + nội dung đủ dùng đăng thật

QUY TẮC 2 — Không fork kiến trúc
  → Core pipeline (Script Writer, Voice Sync, BGM Mix) là chung
  → Chỉ viết thêm config / profile / discovery agent — không copy-paste toàn bộ codebase
  → Cải tiến core thì mọi con cùng hưởng lợi

QUY TẮC 3 — Thử nghiệm nhỏ trước khi scale
  → Mỗi con mới: 3–5 video pilot → đánh giá → chốt → scale
  → Không scale khi chưa có signal rõ

QUY TẮC 4 — Một con mỗi vòng
  → Không xây đồng thời Con 2 và Con 3
  → Làm từng con, chứng minh, rồi đi tiếp

QUY TẮC 5 — Giữ nguyên triết lý content-led
  → Dù là con nào, nội dung phải có khả năng kéo view trước
  → Không biến pipeline thành spam machine
```

---

## 6. Thứ tự ưu tiên phát triển Core

Những cải tiến core (hưởng lợi tất cả con) nên làm theo thứ tự:

| Ưu tiên | Tính năng | Lý do |
|---|---|---|
| P1 | Watermark detection tự động | Lọc video trước khi đưa vào pipeline |
| P2 | BGM dynamic ducking | Voice rõ hơn khi nói, tự nhiên hơn |
| P3 | Text overlay tự động | Thay CapCut thủ công |
| P4 | Publish workflow (Facebook/TikTok API) | Xóa bước thủ công cuối |
| P5 | Performance feedback loop | Học từ video nào có view cao để cải thiện scoring |

> **Lưu ý**: P1–P5 chỉ nên làm sau khi Con số 1 chứng minh value và có ≥3 video pilot thành công.

---

## 7. Tham chiếu

- Skill vận hành: `.claude/skills/chay/SKILL.md`
- Project memory: `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md`
- Script Writer doc: `docs/SCRIPT_WRITER.md`
- Video evidence standard: `docs/VFOS_VIDEO_EVIDENCE_STANDARD.md`
- Voice resolver: `packages/voice/src/voice-presets.ts` (single brand voice)
- Schema types: `packages/script-writer/src/types.ts`
