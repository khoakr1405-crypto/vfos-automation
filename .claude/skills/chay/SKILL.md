---
name: chay
description: Chạy VFOS Short-form Affiliate Factory v0 — pipeline yt-dlp → Script Writer → Voice Sync → BGM Mix → preview cho short-form video (15–90s, gadget/đồ gia dụng/đồ bếp) đăng Facebook Reels / TikTok VN gắn affiliate. Kích hoạt khi user gõ /chay, /chay <URL video>, hoặc /chay <chỉ thị ngắn>.
---

# Skill: /chay

> **Skill ID**: `chay`
> **Tên logic**: VFOS Short-form Affiliate Production Factory v0
> **Kích hoạt**: User gõ `/chay` (hoặc `/chay <args>`) trong Claude Code
> **Ngôn ngữ**: Trả lời tiếng Việt, technical terms giữ tiếng Anh

---

## MÔ TẢ

`/chay` là nút khởi động **Con số 1 — VFOS Short-form Factory**.

Khi được gọi, agent phải tự hiểu:
- cần đọc Project Memory
- xác định mode từ args
- chạy đúng dây chuyền đã đóng gói, không hỏi lại những thứ đã rõ

Dây chuyền này phục vụ:
- Short-form video (15–90s, portrait 9:16)
- Content-led affiliate (Shopee VN, TikTok Shop VN)
- Ngách: gadget, đồ gia dụng, đồ bếp, satisfying practical content
- Platform target: Facebook Reels / TikTok Việt Nam

---

## BƯỚC 0 — BẮT BUỘC MỖI LẦN CHẠY

Dù ở mode nào, agent phải làm ngay khi nhận `/chay`:

1. Đọc `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md`
2. Xác định "bước tiếp theo duy nhất" trong memory
3. Xác định mode từ args (xem phần MODE ROUTING bên dưới)
4. Báo ngắn: "Mode: X — bắt đầu [mô tả task]"

---

## MODE ROUTING

### MODE 1 — `/chay` (không có args)

**Trigger**: User chỉ gõ `/chay`, không kèm URL hay yêu cầu.

**Hành động**:
1. Đọc memory → xác định bước tiếp theo duy nhất
2. Nếu bước đó thuộc phạm vi Short-form Factory (Script Writer, Voice Sync, BGM Mix, video mới):
   - Tự chạy bước đó, không hỏi lại
3. Nếu bước đó **ngoài** phạm vi Short-form Factory (publish, text overlay, watermark, longform, router...):
   - **Không tự ý làm**
   - Báo: "Bước tiếp theo trong memory là: [X]. `/chay` hiện đóng gói cho Short-form Factory — bước này nằm ngoài phạm vi. Bạn muốn tiếp tục theo mode nào?"

**Phạm vi Short-form Factory** (có thể tự chạy):
- Tìm/tải video nguồn mới
- Phân tích scene / tạo scene_input.json
- Chạy AI Script Writer
- Chạy Voice Sync
- Chạy BGM Mix
- QC + render preview

---

### MODE 2 — `/chay <URL>`

**Trigger**: Args là một URL hợp lệ (http/https, YouTube, TikTok...).

**Hành động — chạy full pipeline từ URL đó**:
1. Audit URL: kiểm tra video có phù hợp không
   - Portrait hoặc có thể crop? Duration 15–90s?
   - Nếu không phù hợp: báo lý do, hỏi user có muốn tiếp tục không
2. Tải video với yt-dlp (format: best ≤1080p, mp4)
3. Đặt vào `production/batch_001/<video_id>/`
4. Chạy pipeline đầy đủ (xem WORKFLOW bên dưới)

---

### MODE 3 — `/chay <yêu cầu ngắn>`

**Trigger**: Args là text không phải URL (ví dụ: "tự tìm video mới", "tìm gadget bếp viral", "tìm clip đồ gia dụng Shopee").

**Hành động — Auto-source mode**:
1. Hiểu yêu cầu → xác định tiêu chí tìm kiếm
2. Tìm candidate video phù hợp (YouTube Shorts, TikTok TQ, etc.)
3. Đánh giá shortlist: chất lượng hình ảnh, duration, gadget demo rõ, không watermark lộ
4. **Guard**: Nếu shortlist không đủ tốt (không đạt tiêu chí tối thiểu) → dừng ở đây, trình bày shortlist cho user duyệt. Không đốt pipeline cho video quá tệ.
5. Nếu có ≥1 candidate đủ tốt → tải video tốt nhất và chạy pipeline đầy đủ
6. Không giả vờ "đã xem" nếu không xem được thực sự — mô tả evidence thật (metadata, thumbnail, duration, visual keyframes)

---

## WORKFLOW CHUẨN SHORT-FORM FACTORY V0

*Áp dụng cho MODE 2 và MODE 3, và MODE 1 khi bước tiếp theo là video mới.*

```
STEP 1   Đọc Project Memory
STEP 2   Xác định video_id (format: yt_NNN, pattern tăng dần)
STEP 3   Tải video nguồn
         → yt-dlp -f "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]"
         → Lưu: production/batch_001/<video_id>/<video_id>_source.mp4
STEP 4   Phân tích video thực tế
         → Trích keyframes: ffmpeg -vf "select='not(mod(n,150))',scale=300:-1" -vsync vfr frame_%03d.jpg
         → Mô tả từng keyframe dựa trên hình thật — KHÔNG hallucinate
         → Xác định scene timeline: sản phẩm gì, thời điểm nào, hook/CTA ở đâu
STEP 5   Tạo scene_input.json
         → Đặt tại: production/batch_001/<video_id>/scene_input.json
         → Schema: video_id, content_goal, target_platform (tiktok|reels|shorts),
                   duration_target_s, tone, affiliate_angle, cta_style,
                   scene_timeline[] (window_start_s, window_end_s, scene_type, visual_summary, notes)
         → scene_type hợp lệ: HOOK | KITCHEN | FILLER | TRANSITION | CTA | OFF_TOPIC
         → Viết Latinized Vietnamese để tránh encoding error trong JSON
STEP 6   Chạy AI Script Writer
         → pnpm script:write --input production/batch_001/<video_id>/scene_input.json
         → Đọc output: script_ai_v1.json + script_ai_v1.txt
         → Nếu FAIL quality guard: phân tích lý do, sửa scene_input.json và retry 1 lần
         → Nếu vẫn FAIL sau retry: báo user, dừng
STEP 7   Đánh giá script
         → Đọc script_ai_v1.txt toàn bộ — có tự nhiên không? Hook kéo view?
         → Không tô vẽ kết quả — nếu script kém thì nói thật
STEP 8   Chọn voice preset
         → Default: voice_01 (xPEfmymXC4WdBxGMznS7) — đã validate
         → Nếu tone video khác (nam giọng trầm, giọng trẻ...): xem xét voice_02–05
         → Ghi rõ preset chọn + lý do
STEP 9   Chạy Block-based Voice Sync
         → pnpm voice:sync --script production/batch_001/<video_id>/script_ai_v1.json
                          --source production/batch_001/<video_id>/<video_id>_source.mp4
                          --output-dir production/batch_001/<video_id>/voice_sync_v0
                          --voice-preset voice_01 --speed 1.3
         → Đọc manifest: kiểm tra overflow
         → Nếu có block overflow_minor (≤0.5s): chấp nhận
         → Nếu có block overflow (>0.5s): rút ngắn text block đó, regenerate --only-blocks <id>
STEP 10  Chạy BGM Mix
         → BGM source mặc định: production/batch_001/yt_005/bgm/yt_005_bgm_v2_candidate_b.mp3
           (60s, "Light cheerful, bright piano, warm friendly" — đã validate yt_005 + yt_006)
         → Params đã chốt:
           --bgm-volume 0.0972  (≈ -20.2 dBFS)
           --voice-gain 1.716   (≈ +4.7 dB)
           --final-gain 1.3     (≈ +2.3 dB)
           --bgm-fadein 1.5
           --bgm-fadeout 3.0
         → pnpm bgm:mix --source-video production/batch_001/<video_id>/<video_id>_source.mp4
                        --voice-timeline production/batch_001/<video_id>/voice_sync_v0/<video_id>_voice_timeline.mp3
                        --output-dir production/batch_001/<video_id>/bgm_mix_v1
                        --video-id <video_id>
                        --bgm-file production/batch_001/yt_005/bgm/yt_005_bgm_v2_candidate_b.mp3
                        --bgm-volume 0.0972 --voice-gain 1.716 --final-gain 1.3
                        --bgm-fadein 1.5 --bgm-fadeout 3.0
STEP 11  QC kỹ thuật
         → Streams: phải có 2 (video + audio)
         → Duration: video ≈ audio, không lệch >0.5s
         → Source audio leak: none detected
         → max_volume: không vượt -1 dBFS (no clipping)
         → Ghi rõ từng chỉ số — không bỏ qua
STEP 12  Mở preview cho user
         → Start-Process <path>/bgm_mix_v1/<video_id>_voice_blocks_bgm_preview_vi.mp4
         → Báo đường dẫn file để user click nếu không tự mở được
STEP 13  SELF-REVIEW (xem checklist bên dưới)
STEP 14  Commit/push nếu đạt
         → Commit: script, manifest, scene_input, docs — KHÔNG commit binary (.mp3, .mp4)
         → Message: "feat: produce <video_id> — script+voice+bgm pilot"
STEP 15  Báo cáo cuối (xem REPORT TEMPLATE bên dưới)
```

---

## TIÊU CHÍ CHỌN VIDEO (dùng cho MODE 3 — auto-source)

Video phù hợp cho Short-form Factory khi:

| Tiêu chí | Yêu cầu |
|---|---|
| Duration | 15–90s (ưu tiên 30–60s) |
| Orientation | Portrait 9:16 (hoặc có thể crop) |
| Nội dung | Demo gadget / đồ gia dụng / đồ bếp — kết quả thấy được rõ ràng |
| Visual quality | Đủ sáng, không blur nặng, sản phẩm nằm trong frame rõ |
| Watermark | Không có watermark TikTok lớn đè lên sản phẩm (logo nhỏ góc OK) |
| Audio | Không quan trọng — sẽ bị thay bằng voice-over AI |
| Vibe | Satisfying demo, không cần diễn xuất — gadget tự "nói" |

Video không phù hợp:
- Quá dài (>90s)
- Landscape không crop được
- Sản phẩm mờ, không nhìn rõ kết quả
- Người diễn quá nhiều, khó reup
- Nội dung không phù hợp affiliate gadget/đồ gia dụng

---

## GUARD CHẤT LƯỢNG

```
GUARD 1 — Script quality
  → Nếu quality guard FAIL: retry 1 lần. Nếu vẫn fail: dừng + báo user.
  → Không dùng script kém chỉ để "xong pipeline"

GUARD 2 — Video source quality
  → Nếu không có candidate đủ tốt (MODE 3): trình shortlist, xin user duyệt
  → Không chạy pipeline cho video quá tệ

GUARD 3 — Voice overflow
  → overflow_minor (≤0.5s): chấp nhận — log vào manifest
  → overflow (>0.5s): rút ngắn text + regenerate block đó

GUARD 4 — Audio QC
  → Nếu max_volume > -1 dBFS: clipping — điều chỉnh final-gain trước khi báo done

GUARD 5 — Kết quả 75–85% là đủ
  → Không tối ưu vô hạn
  → Đạt ngưỡng dùng được → ghi lại → đi tiếp
```

---

## SELF-REVIEW CHECKLIST

Bắt buộc chạy trước khi báo "hoàn thành":

```
[ ] Video source: tải thành công, đúng format, đúng duration?
[ ] Keyframes: mô tả dựa trên hình thật, không hallucinate?
[ ] scene_input.json: schema hợp lệ, scene_type đúng enum?
[ ] Script Writer: PASS quality guard? Hook/CTA không cứng?
[ ] Voice Sync: tất cả blocks FIT hoặc overflow_minor?
[ ] BGM Mix: 2 streams? Không clipping? Không leak source audio?
[ ] Preview: đã mở và có thể play?
[ ] Binary media: KHÔNG nằm trong git commit?
[ ] Manifest JSON: ghi đủ params để reproduce?
[ ] Nếu phát hiện lỗi rõ ràng trong scope: đã sửa chưa?
[ ] Báo cáo: đủ thông tin audit, không tô vẽ?
```

---

## HARD CONSTRAINTS

```
KHÔNG BAO GIỜ:
  × Commit binary media (.mp4, .mp3) — đã có .gitignore
  × Publish lên Facebook / TikTok
  × Echo đầy đủ API key ra terminal
  × Chạy pipeline cho nhiều video trong 1 lần /chay
  × Giả vờ "đã xem" video nếu không thật sự xem được
  × Tô vẽ kết quả chưa kiểm chứng
  × Mở rộng sang longform dubbing / vietsub
  × Build router đa loại video / Con số 2
  × Tự ý auto-publish

CHỈ LÀM TRONG SCOPE:
  ✓ 1 video mỗi lần /chay
  ✓ Short-form ≤90s, portrait 9:16
  ✓ Ngách gadget / đồ gia dụng / đồ bếp
  ✓ Kết quả cuối là preview MP4 local
  ✓ Commit code/docs/manifests — KHÔNG commit binary
```

---

## REPORT TEMPLATE

Sau khi hoàn thành, báo cáo theo format:

```
## /chay — Báo cáo

**Mode**: [1 / 2 (URL) / 3 (auto-source)]
**Video ID**: [yt_NNN]
**Nguồn**: [URL hoặc "tự tìm từ yêu cầu: ..."]

### Đã làm
- [ ] Tải video: [duration, resolution, format]
- [ ] Script Writer: [PASS/FAIL, word count, TTS estimate]
- [ ] Voice Sync: [N/N blocks FIT, overflow nếu có]
- [ ] BGM Mix: [max_vol dBFS, mean_vol dBFS, streams]
- [ ] Preview: [đã mở / path file]

### QC chính
| Chỉ số | Giá trị | Nhận xét |
|---|---|---|
| Streams | X | |
| Duration | Xs | |
| max_volume | -X dBFS | |
| Source audio leak | none / detected | |

### Self-review
[Lỗi tự phát hiện và sửa / Giới hạn còn lại]

### Git
[Commit hash + files committed / Lý do chưa commit]

### Giới hạn vòng này
[Những gì chưa hoàn hảo, chấp nhận ở 75–85%]
```

---

## TRIẾT LÝ VFOS (nhúng để không bị drift)

- **Content-led trước**: nội dung phải có khả năng kéo view trước khi gắn affiliate
- **Không biến video thành quảng cáo lộ liễu**: CTA phải soft ("link bio nhé", không ép mua)
- **Evidence-first**: mô tả video dựa trên hình thật — không bịa spec, không bịa số liệu sản phẩm
- **Làm từng phần chắc**: không rush nhiều bước cùng lúc
- **75–85% là đủ chốt**: không tối ưu vô hạn, đủ dùng thật → ghi lại → đi tiếp
- **Scale bằng blueprint**: không xây lại hệ thống từ đầu cho mỗi ngách mới

---

## THAM CHIẾU

- Pipeline code: `packages/script-writer/`, `packages/voice/`
- BGM source mặc định: `production/batch_001/yt_005/bgm/yt_005_bgm_v2_candidate_b.mp3`
- Voice presets: `packages/voice/src/voice-presets.ts`
- Schema types: `packages/script-writer/src/types.ts`
- Blueprint nhân bản: `docs/00_DIEU_HANH/VFOS_SHORTFORM_FACTORY_BLUEPRINT_V0.md`
- Project memory: `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md`
