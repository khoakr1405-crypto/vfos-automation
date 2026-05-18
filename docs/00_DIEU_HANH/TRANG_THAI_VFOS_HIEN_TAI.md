# TRẠNG THÁI VFOS HIỆN TẠI

> **Loại tài liệu**: File điều hành trung tâm — cập nhật sau mỗi vòng làm việc lớn
> **Cập nhật lần cuối**: 2026-05-19
> **Branch**: `master` | **Commit mốc tại thời điểm cập nhật trạng thái**: `(cập nhật sau commit BGM Mix v0)`
> **Đọc trước khi làm bất cứ việc gì**: `CLAUDE.md` → file này → rồi mới bắt đầu task

---

## 1. Mục tiêu lớn của VFOS

VFOS là hệ thống hỗ trợ chiến lược **content-led affiliate**:

- Tìm / download / xử lý video nước ngoài (chủ yếu TikTok TQ, YouTube Shorts)
- Việt hóa nội dung (script, voice-over AI, text overlay)
- Tối ưu để đăng **Facebook Reels / TikTok Việt Nam**
- Gắn affiliate (Shopee, TikTok Shop) để tạo doanh thu
- Kiểm chứng dần qua từng vòng thực nghiệm nhỏ → scale khi có signal rõ

**North Star thương mại**: 100–200 triệu VNĐ/tháng từ affiliate video. Đây là đích tham vọng, không phải cam kết.

---

## 2. Nguyên tắc làm việc đã chốt

| Nguyên tắc | Nội dung |
|---|---|
| **Làm từng phần nhỏ** | Mỗi vòng chỉ làm 1 bước rõ ràng, hoàn thiện chắc rồi chốt |
| **75–85% là đủ chốt** | Không tối ưu vô hạn. Đủ dùng thật → ghi lại → đi tiếp |
| **Thực nghiệm trước, scale sau** | Chứng minh đúng việc → mới tự động hóa |
| **Không mở scope** | Không làm thêm feature B trong khi đang làm A |
| **Commit rõ theo mốc** | Mỗi phần hoàn thiện đều có commit riêng, message rõ |
| **Không tô vẽ kết quả** | Không claim "đã xong" khi chưa kiểm chứng |
| **Data beats opinion** | Quyết định dựa trên kết quả test thực tế, không dựa cảm giác |

---

## 3. Các phần đã hoàn thành

### ✅ Phần 1 — AI Script Writer: ĐÃ CHỐT

**Trạng thái**: v3.1 — Production-ready cho TTS/sync (tính đến 2026-05-18)

**Tổng kết kỹ thuật**:
- Package: `packages/script-writer/`
- Backend: OpenAI Responses API (`gpt-4o` cho prose tốt nhất)
- Input: `scene_input.json` (video timeline scene từ ffmpeg scene-detect)
- Output: `script_ai_vX.json` + `script_ai_vX.txt` (paste thẳng vào ElevenLabs)
- Kiến trúc 2-pass: Pass 1 (Writer, temp 0.5) → Pass 2 (Extender, temp 0.3)
- Quality guard: hard-banned phrases + soft ad-copy phrases + word count window + hook/CTA consistency
- Extender Pass tự động khi Pass 1 under word count và pass các guard cứng

**Kết quả thực nghiệm trên `yt_005`**:
- 141 từ trong window [141–156], PASS guard, 0 ad-copy hit
- TTS ước tính ~50s ≈ video 53s (khớp)
- Hook/CTA byte-identical qua 2 pass
- Không bịa spec/giá

**Giới hạn còn lại (chấp nhận được)**:
- Model copy TỐT examples gần verbatim → video nhiều sẽ bị trùng câu (logged roadmap)
- Operator vẫn cần review trước khi feed TTS (không zero-touch)
- `gpt-4o-mini` prose kém hơn `gpt-4o` đáng kể

**Commit history Phần 1**:

| Commit | Nội dung |
|---|---|
| `2fc91c9` | Script Writer v0 — single-shot baseline |
| `c9b058b` | v1 — few-shot + quality guard |
| `bb479c0` | v2 — duration coverage (temp 0.5, per-scene budget) |
| `d31f10f` | v3 — Extender Pass (2-pass architecture) |
| **`13ff133`** | **v3.1 — Ad-copy polish (commit hoàn thiện Phần 1, đã push)** |

---

### ✅ Voice Preset Library v0: ĐÃ CHỐT

**Trạng thái**: v0 — production-ready (tính đến 2026-05-19)

**Tổng kết kỹ thuật**:
- Module: `packages/voice/src/voice-presets.ts`
- Preset map: `default` → `ELEVENLABS_VOICE_ID`, `voice_01`–`voice_05` → `ELEVENLABS_VOICE_ID_01..05`
- `resolveVoice()`: priority chain — `--voice-id` (raw) > `--voice-preset` (lookup) > env default
- Flag `--voice-preset` thêm vào cả `voice:generate` và `voice:sync`
- Manifest `voice_sync_manifest.json` ghi cả `voice_preset` và `voice_id` để traceability
- Backward-compat: không truyền flag → tiếp tục dùng `ELEVENLABS_VOICE_ID` như cũ

**Commit**: `53341ea` — feat: add Voice Preset Library v0 (–voice-preset flag, resolveVoice, manifest traceability)

---

### ✅ Phần 2 — Block-based Voice Sync: ĐÃ CHỐT (v0 + preview MP4)

**Trạng thái**: v0 — production-ready cho yt_005 (tính đến 2026-05-19)

**Tổng kết kỹ thuật**:
- Script: `packages/voice/scripts/sync.ts`
- Input: `script_ai_vX.json` (blocks với window_start_s / window_end_s)
- Luồng: TTS per-block (ElevenLabs eleven_v3) → probe duration → fit/overflow QC → ffmpeg adelay+amix stitch → manifest JSON
- Output: 10 block mp3 + `yt_005_voice_timeline.mp3` (53s) + `voice_sync_manifest.json`
- Preview MP4: `yt_005_voice_blocks_v1b_preview_vi.mp4` (1080x1920, AV1, no original audio)
- Flag thêm: `--only-blocks b10` để regenerate 1 block cụ thể mà không regenerate toàn bộ

**Kết quả thực nghiệm trên `yt_005`**:
- 10/10 blocks FIT (sau khi fix b10 overflow)
- b10 CTA: text rút ngắn "5 món xong rồi, ghé bio nhé!" → 2.0s, +0.4s buffer trong window 2.4s
- Preview MP4 QC: không leak original audio (handler "SoundHandler" ≠ "ISO Media"), 2 streams (video copy + audio block-sync)
- Source video: `yt_005_source.mp4` (1080x1920, AV1, 53.43s) — đã tải, không commit binary

**Giới hạn còn lại (chấp nhận được)**:
- Chưa test sync thực tế bằng mắt người xem (cần xem preview thủ công)
- Không có BGM — chỉ voice block-sync
- Operator vẫn cần review preview trước khi publish

**Commit history Phần 2**:

| Commit | Nội dung |
|---|---|
| `c9e1bf3` | feat: add block-based voice sync v0 for yt_005 |
| **`6382b75`** | **fix: shorten b10 CTA + add --only-blocks flag (commit hoàn thiện Phần 2 v0, đã push)** |

---

### ✅ Phần 3 — BGM Mix v0: ĐÃ CHỐT

**Trạng thái**: v0 — production-ready cho yt_005 (tính đến 2026-05-19)

**Tổng kết kỹ thuật**:
- Script: `packages/voice/scripts/bgm-mix.ts` (`pnpm bgm:mix`)
- BGM source: ElevenLabs Sound Generation API (`/v1/sound-generation`, 22s, 128kb/s)
- BGM xử lý: `stream_loop -1` → `atrim` → `afade in/out` → `volume=0.15` (-16.5 dBFS)
- Mix: `amix=normalize=0` (voice giữ nguyên mức, BGM giảm)
- Output: `voice_bgm_mixed.mp3` + preview `*_bgm_v1_preview_vi.mp4` + manifest JSON
- CLI flags: `--bgm-file`, `--bgm-volume`, `--bgm-fadein`, `--bgm-fadeout`, `--bgm-prompt`

**Kết quả thực nghiệm trên `yt_005`**:
- BGM generated: `yt_005_bgm_v1_generated.mp3` (22s, 128kb/s)
- Preview render: `bgm_mix_v1/yt_005_voice_blocks_bgm_v1_preview_vi.mp4` (12.2MB)
- Volume QC: voice max -11.6 dB, BGM max (after reduction) ≈ -16.8 dB, voice rõ hơn BGM ~5 dB
- Mixed max: -12.0 dB (no clipping), no source audio leak, 2 streams (AV1 video + AAC audio)
- Fade-in 1.5s / Fade-out 3.0s

**Giới hạn còn lại (chấp nhận được)**:
- No dynamic ducking — BGM không tự giảm khi voice đang nói (v0, cố định)
- BGM là 22s looped x3 — có thể nghe thấy loop point nếu nghe kỹ
- Operator cần nghe preview để xác nhận vibe phù hợp video

---

## 4. Phần đang chuẩn bị làm tiếp theo

### ⏳ Phần 4 — Video preview validation + publish workflow: CHƯA BẮT ĐẦU

**Mục tiêu**:
- Operator xem/nghe preview BGM `yt_005_voice_blocks_bgm_v1_preview_vi.mp4` và xác nhận chất lượng
- Nếu đạt → chuẩn bị publish lên Facebook Reels / TikTok VN với affiliate tag
- Tối ưu hoá workflow từ script → voice → BGM → publish (giảm thời gian tay)

> **Ghi chú**: BGM Mix v0 đã hoàn thành. Preview MP4 với BGM đã render, QC đã pass. Bước tiếp theo là operator nghe/xem preview và quyết định publish.

---

## 5. Những việc CHƯA làm / ngoài scope hiện tại

| Việc | Trạng thái |
|---|---|
| BGM dynamic ducking (sidechain) | Chưa làm (v0 dùng fixed volume) |
| Watermark detection tự động | Chưa làm (spec có, code không) |
| Text overlay tự động | Chưa làm (thủ công CapCut) |
| Publish workflow tự động | Chưa làm (thủ công) |
| ContentFactory agent | Chưa làm (quá sớm) |
| VSTE (Visual Semantic Timeline Engine) | Spec có (`docs/VISUAL_SEMANTIC_TIMELINE_ENGINE_SPEC_V1.md`), code không |
| VDAE (Voice Duration Alignment Engine) | Spec có (`docs/VOICE_DURATION_ALIGNMENT_ENGINE_SPEC_V1.md`), code không |
| VOE với video thật (chỉ metadata text) | Đã test 10 cases synthetic, chưa test video live |

---

## 6. Quyết định quan trọng đã chốt

| Quyết định | Lý do |
|---|---|
| Script Writer dùng OpenAI (không phải Claude) | OpenAI Responses API có structured output tốt hơn cho tiếng Việt prose |
| `gpt-4o` > `gpt-4o-mini` cho prose | Mini còn nhiều cliché TV/Shopee, 4o tự nhiên hơn rõ rệt |
| 2-pass (Writer + Extender) thay vì 1 pass dài | Model mạnh hơn (4o) viết concise — ép 1 pass phá prose |
| Chấp nhận 75–85% thay vì tối ưu vô hạn | Vòng Script Writer đã dừng đúng lúc, không ép thêm |
| `yt_005` là video test pipeline | Không nhất thiết là asset publish tốt — mục đích là validate pipeline |
| Video analysis phải evidence-first | Xem `docs/VFOS_VIDEO_EVIDENCE_STANDARD.md` — chống hallucination |
| VOE chỉ đánh giá text metadata | VOE không xem video, không có audio/visual analysis thật |

---

## 7. Bước tiếp theo duy nhất

> **Nghe/xem preview BGM và xác nhận chất lượng âm thanh.**
>
> File: `production/batch_001/yt_005/bgm_mix_v1/yt_005_voice_blocks_bgm_v1_preview_vi.mp4`
>
> Câu hỏi cần trả lời khi xem:
> 1. BGM có nghe vừa phải, không lấn voice không?
> 2. Voice vẫn rõ so với video không BGM không?
> 3. Vibe nhạc có phù hợp với video review đồ bếp không?
> 4. Có cần giảm BGM thêm (--bgm-volume 0.10) hay tăng thêm (0.18)?
>
> Nếu đạt → bắt đầu Phần 4: publish workflow.

---

## 8. Cấu trúc repo quan trọng

```
packages/
  script-writer/   ← Phần 1 (CHỐT)
  voice/           ← ElevenLabs TTS client (có, chưa dùng cho yt_005)
  sdk/             ← Types/interfaces chung
  db/              ← DB layer
apps/
  kernel/          ← API server, VOE, pipeline syscall
  cockpit/         ← Dashboard UI
production/
  batch_001/yt_005/ ← Asset và output cho yt_005
docs/
  SCRIPT_WRITER.md                ← Doc chi tiết Phần 1
  VFOS_VIDEO_EVIDENCE_STANDARD.md ← Chuẩn evidence video (mới, 2026-05-18)
  00_DIEU_HANH/                   ← File điều hành (thư mục này)
```

---

## 9. Hướng dẫn cho agent/session mới

**Bước bắt buộc khi bắt đầu session**:

1. Đọc `CLAUDE.md`
2. Đọc file này (`docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md`)
3. Tóm tắt lại (không bỏ qua):
   - Dự án đang ở đâu?
   - Phần nào đã chốt?
   - Phần nào đang làm?
   - Bước tiếp theo duy nhất là gì?
4. **Không làm bất cứ gì trước khi tóm tắt đúng.**

**Sau mỗi vòng làm việc lớn**:

- Cập nhật mục 3 (Phần đã hoàn thành)
- Cập nhật mục 4 (Phần tiếp theo)
- Cập nhật commit hash mốc tại thời điểm cập nhật
- Cập nhật "Cập nhật lần cuối" ở đầu file

---

## 10. Git / Remote status

| Thông tin | Giá trị |
|---|---|
| Branch | `master` |
| Commit mốc tại thời điểm cập nhật trạng thái | `(cập nhật sau commit BGM Mix v0)` |
| Remote | `origin` (GitHub) |
| Sync status | Đã push sau commit BGM Mix v0 |

**Untracked/modified ngoài scope** (tính đến 2026-05-19):
- `docs/VFOS_VIDEO_EVIDENCE_STANDARD.md` — tạo trong vòng audit, chưa commit
- `.claude/skills/vfos_video_analysis_evidence_gate.md` — tạo trong vòng audit, chưa commit
- `apps/kernel/src/syscalls/voe.ts` — sửa VOE prompt trong vòng audit, chưa commit
- Binary media (không commit): tất cả `.mp4`, `.mp3` trong `production/` — đã có `.gitignore`

> File media là local artifact, đã có `.gitignore`, không commit binary.
