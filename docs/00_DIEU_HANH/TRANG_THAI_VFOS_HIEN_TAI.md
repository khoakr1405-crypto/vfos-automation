# TRẠNG THÁI VFOS HIỆN TẠI

> **Loại tài liệu**: File điều hành trung tâm — cập nhật sau mỗi vòng làm việc lớn
> **Cập nhật lần cuối**: 2026-07-12 (**Reels quality trio (Phần 51)**: (1) 87s arc story `7e10518` session song song — ĐÃ PUSH; (2) center crop 9:16 thay scale bẹp + invalidate scrub mask khi montage mới + 3 prompt vision/narrate bỏ prime "trên biển" — commit `a2dedc8` ĐÃ PUSH; (3) bản địa hóa contextual: luật BẢN ĐỊA HÓA cứng + gỡ hardcode "ngoài biển" 2 nhánh + persona theo video + visionWhat vào nhánh story + meme example contextual — commit `a2dedc8` ĐÃ PUSH; (4) style persona "vùng nước" thay "vùng biển" hook-style-bank — commit `a2dedc8` ĐÃ PUSH. Verify frame thật + dry-run 87.2s job `ent_fishing_20260711_154233`. TẤT CẢ ĐÃ PUSH origin 2026-07-12. Trước đó **Trend Scout R2 UI (Phần 50)**: commit `e0788dc` ĐÃ PUSH — 7 file: scout.ts server lib pure-read + spawn detached, GET /api/studio/entertainment/scout pool+filter ?niche, POST /api/studio/entertainment/scout/run quét detached, ScoutPanel thu gọn trong Action 1 "Tải link" /lanes/content, dropdown ngách = bộ lọc shortlist, guard chung Douyin profile, poll 5s, promote qua intake 409 sẵn có; fix intake 502 surface message thật; R1 CLI pnpm ent:scout commit `3384f40` ĐÃ PUSH — 8 file: config/scout fishing+cooking, scout-core thuần + test 25/25, douyin-search capture, scout-jobs-index, 30-scout.ts, alias; smoke live PASS không CAPTCHA, snapshot thật scout_cooking_20260710_185800 3 ứng viên.)
> **Branch**: master `e2d0a55` (lane Giải trí end-to-end). | **Lane câu cá (round hiện tại)**: `feat/ent-multichannel` HEAD **`a2dedc8` — local == origin, working tree CLEAN** (Reels quality trio Phần 51); chứa toàn bộ commit scout R1+R2+anchors+story+multichannel+hygiene đều ĐÃ PUSH. **Bước tiếp theo duy nhất**: Operator chạy "Sản xuất video" job `ent_fishing_20260711_154233` nghiệm thu 3 tầng fix (87s + center crop + contextual localization). **Commit mốc**: `f9a2fa6` (feat(ent-lane): add guarded TikTok publish flow (Phase 3 round 1)).
> **Đọc trước khi làm bất cứ việc gì**: `CLAUDE.md` → file này → rồi mới bắt đầu task → luôn chạy `pnpm vfos:daily` để có chỉ dẫn trạng thái mới nhất

> ⚠️ **ĐƯỜNG VẬN HÀNH CHÍNH THỨC**: dùng `docs/00_DIEU_HANH/HUONG_DAN_VAN_HANH_CHINH_THUC_VFOS.md` (operator guide chuẩn, flow A-Z `commerce:intake` → `job:run-review` → `job:publish-facebook`).
> Mọi lệnh `publish:facebook` (run-based), `shopee:login` / `shopee:fetch` / `shopee:fetch-cookie` / `shopee:select`, `pipeline:pN-demo` xuất hiện trong các round-log bên dưới là **legacy historical reference** (đã gỡ/đổi `debug:shopee:*` qua chuỗi Cleanup B1/C/C2/D1). KHÔNG dùng làm đường chính.

---

## 1. Mục tiêu lớn của VFOS

> **🆕 2026-06-11 — North Star v2 (outcome-based) đã chốt**: nguồn sự thật là `docs/VFOS_NORTH_STAR.md`.
> Kết quả cuối: video nguồn → video tiếng Việt đã biên tập/biến đổi → đăng thật Facebook/TikTok → có người xem → có click affiliate → có đơn hàng/doanh thu thật.
> Quản lý theo cấu trúc **Niche → Channel → Video Job → Affiliate Link → Publish Result**, nhiều ngách/nhiều kênh qua Command Center.
> Page "Review Nhà bạn" là kênh thử nghiệm product review đầu tiên, không phải giới hạn cuối. TikTok publish + các ngách Vlog Câu cá/Vlog xe = roadmap dài hạn.
> Milestone ladder M1–M6 (postId thật → TikTok thật → click → đơn → doanh thu → 10tr/50tr/100–200tr/tháng) — chỉ tick khi có bằng chứng thật.

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

### 🆕 2026-07-03 — Round Proposal Discipline (chốt sau Round 1 Revenue Feedback Loop)

- **Bám roadmap, không bắt đầu từ số 0**: mỗi round phải bám `state doc + North Star + roadmap hiện có`.
- **Round = mảng lớn**: mỗi round phải là **một mảng lớn của VFOS**, không phải patch lặt vặt.
- **Agent tự đề xuất, KHÔNG bắt Operator chọn**: agent phải **tự đề xuất hướng mặc định tốt nhất kèm lý do**. KHÔNG đưa nhiều lựa chọn ngang hàng bắt Operator chọn nếu đã đủ context.
- **Chỉ hỏi khi nhánh lớn**: chỉ hỏi Operator khi có nhánh **thật sự ảnh hưởng lớn đến kinh doanh / workflow / dữ liệu / architecture**. Nếu phải hỏi, vẫn kèm khuyến nghị rõ: "Tôi đề xuất chọn X vì…".
- **Không refactor/dọn vô cớ**: KHÔNG refactor / dọn UI / dọn code nếu không phục vụ **trực tiếp** North Star hoặc roadmap hiện tại.
- **Format BẮT BUỘC trình bày trước khi đề xuất round** (7 mục):
  1. Roadmap hiện ở đâu
  2. North Star yêu cầu gì
  3. Bottleneck lớn nhất tiếp theo
  4. Đề xuất round tiếp theo
  5. Vì sao chọn round đó
  6. Scope làm / không làm
  7. Acceptance criteria

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

### ⚠️ Voice Preset Library v0: ĐÃ RETIRE (xem Phần 11)

**Lịch sử**: v0 chạy từ 2026-05-19 với 6 preset (`default` + `voice_01..05`).
**Tình trạng hiện tại (2026-05-20)**: Đã retire — VFOS chuyển sang 1 brand voice duy nhất, xem Phần 11. `voice-presets.ts` còn nhưng chỉ là single-voice resolver.

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
- Không có BGM — chỉ voice block-sync (BGM được thêm ở Phần 3b)
- yt_005 phục vụ mục đích validate pipeline, chưa được dùng làm publish pilot chính thức

**Commit history Phần 2**:

| Commit | Nội dung |
|---|---|
| `c9e1bf3` | feat: add block-based voice sync v0 for yt_005 |
| **`6382b75`** | **fix: shorten b10 CTA + add --only-blocks flag (commit hoàn thiện Phần 2 v0, đã push)** |

---

### ✅ Phần 3a — BGM Mix v0: ĐÃ CHỐT (ElevenLabs Sound Gen API — đã thay)

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
- User đánh giá BGM v0 "dở" → đã thay bằng BGM Mix v1 (xem 3b)

---

### ✅ Phần 3b — BGM Mix v1: ĐÃ CHỐT + USER REVIEW ĐẠT

**Trạng thái**: v1 — production-ready, đã được user nghe 2 lần và xác nhận đạt (2026-05-19)

**Tổng kết kỹ thuật**:
- Script: `packages/voice/scripts/bgm-mix.ts` (cùng script v0, thêm `--voice-gain` + `--final-gain`)
- BGM source: ElevenLabs Music API (`/v1/music`, `force_instrumental: true`, 60s, 128kb/s) — chất lượng tốt hơn hẳn Sound Gen API
- BGM candidate: B — "Light cheerful advertising, bright piano + subtle beat, warm and friendly"
- Output dir: `production/batch_001/yt_005/bgm_mix_v2/`
- Preview: `yt_005_voice_blocks_bgm_preview_vi.mp4`

**Params mix đã chốt sau 4 vòng tune**:

| Param | Giá trị | dB |
|---|---|---|
| `--bgm-volume` | 0.0972 | −20.2 dBFS |
| `--voice-gain` | 1.716 | +4.7 dB |
| `--final-gain` | 1.3 | +2.3 dB |

**QC kết quả**:
- max_volume: −5.3 dB (headroom 5.3 dB, no clipping)
- mean_volume: −26.0 dB
- 2 streams: AV1 video + AAC audio, 53s
- Không leak source audio

**User review**: Nghe trực tiếp 2 lần → "quá ổn" + "quá ok" ✅ (2026-05-19, chốt)

> **Vai trò của yt_005**: Video này phục vụ mục đích **validate pipeline end-to-end**, không phải publish pilot chính thức. Bước tiếp theo là chạy pipeline trên 1 video mới hoàn toàn để kiểm chứng hệ thống không bị coupled với yt_005.

**Commit history**:

| Commit | Nội dung |
|---|---|
| `6382b75` | fix: shorten b10 CTA + add --only-blocks flag |
| `7f55c59` | BGM Mix v0 chốt |
| `6c6544c` | bgm_mix_v2 voice +30% (voice=1.716, max=−5.3dB) |
| `16ced1f` | fix: remove hardcoded _v1 from preview filename |
| `fee664e` | docs: record successful user approval of BGM mix v1 |
| **`f004bb4`** | **docs: align next milestone to end-to-end pilot (commit hiện tại)** |

---

## 4. Phần đang chuẩn bị làm tiếp theo

### ✅ Phần 4 — End-to-end pilot yt_006: ĐÃ HOÀN THÀNH (2026-05-20)

**Kết quả**:
- Video: `yt_006_source.mp4` (59s, 608x1080, portrait 9:16) — 5 gadget mini
- Script Writer: 165 từ, PASS quality guard, TTS est. 58.9s
- Voice Sync: 6/6 blocks FIT, no overflow, voice_01 preset, speed=1.3
- BGM Mix: max_volume -4.3 dBFS, no clipping, no source audio leak, 2 streams
- Preview: `yt_006_voice_blocks_bgm_preview_vi.mp4` — user mở và xem
- **Xác nhận**: pipeline hoạt động đúng với video mới, không bị coupled với yt_005

---

### ✅ Phần 5 — Đóng gói Con số 1 thành `/chay` skill: ĐÃ CHỐT

**Kết quả**:
- `.claude/skills/chay/SKILL.md` — skill command vận hành Con số 1 (commit `83b1094`)
- `docs/00_DIEU_HANH/VFOS_SHORTFORM_FACTORY_BLUEPRINT_V0.md` — blueprint nhân bản (commit `83b1094`)
- Fix frontmatter để Claude Code đăng ký được slash command (commit `80f7c0e`)

---

### ⏸️ Phần 6 — Test `/chay` trên yt_007: DỪNG CÓ CHỦ ĐÍCH

**Phân biệt rõ ràng**:
- **`/chay` skill: HOẠT ĐỘNG ĐÚNG** — agent đọc skill, chạy đúng workflow theo thứ tự đến bước Script Writer
- **Blocker nằm ở Script Writer**, không phải ở skill `/chay`

**Pilot `yt_007`**: dừng có chủ đích sau bước Script Writer, KHÔNG phải thất bại mơ hồ.

**Blocker phát hiện — Script Writer word-budget calibration cho video ngắn ≤50s**:

| Video | Duration | Kết quả Script Writer |
|---|---|---|
| `yt_005` | 53s | ✅ PASS — 141 từ trong window |
| `yt_006` | 59s | ✅ PASS — 165 từ trong window |
| `yt_007` | **46s** | ❌ FAIL — word budget không khớp video ngắn |

**Triệu chứng phụ**: Extender Pass có lúc **bù quá tay** và **hallucinate pattern "5 món"** (pattern từ video khác trong few-shot), tức là extender đang leak pattern qua video — không phải bám sát scene_input của video hiện tại.

**Quyết định**:
- **Artifacts `yt_007` giữ lại để debug**, KHÔNG xóa (`production/batch_001/yt_007/`)
- Pilot `yt_007` không được publish, vai trò chuyển thành **test case debug** cho Script Writer calibration

---

### ✅ Phần 7 — Permission Autonomy v0 cho `/chay`: ĐÃ CHỐT (2026-05-20)

**Mục tiêu**: Giảm số prompt xin quyền lặp lại khi chạy `/chay` để chuẩn bị scale 50–100 video/ngày.

**Audit dựa trên test yt_007** — các nhóm prompt lặp lại:
- WebSearch + WebFetch(youtube.com) cho MODE 3 auto-source
- `yt-dlp` tải video nguồn
- `ffprobe` kiểm tra video
- `ffmpeg` trích keyframe + xử lý media
- `pnpm script:generate / voice:sync / bgm:mix`
- `mkdir` tạo output dir
- `Start-Process` mở preview MP4
- `git add / commit / push` lên master

**File đã cập nhật**:
- `.claude/settings.json` — project-level allow/deny/ask (commit vào repo)
- `.claude/settings.local.json` — clean về `allow: []` (rules đã promote lên project)

**Auto-approve (không hỏi nữa)**: `pnpm *`, `node *`, `tsx *`, `yt-dlp *`, `ffprobe *`, `ffmpeg *`, `mkdir *`, `Start-Process *`, `git add/commit/push origin *`, `git checkout -- *`, `git restore *`, `WebSearch`, `WebFetch` cho youtube.com/youtu.be/tiktok.com, `Read/Edit/Write/Glob/Grep(**)`.

**Vẫn deny tuyệt đối**: `git push --force*` (mọi biến thể), `git push --delete *`, `git push -d *`, `git reset --hard*`, `git clean -fd/fx/fdx*`, `git branch -D *`, `rm -rf*`, `rm -fr*`, `curl|sh`, `wget|sh`, `Remove-Item -Recurse -Force *`, `iwr|iex`.

**Vẫn ask (xác nhận tay)**: `gh pr create/merge*`, `gh repo delete*`, `git push upstream *`, sửa/xóa file load-bearing config (`biome.json`, `.env*`, `tsconfig*`, `package.json`, `.gitignore`).

**KHÔNG bị mở**: Auto-publish FB/TikTok (không có rule nào allow), shell command lạ ngoài pipeline (default ask).

---

### ✅ Phần 8 — Script Writer calibration + extender anti-leak: ĐÃ CHỐT (2026-05-20)

**Root cause đã xác định**:
1. **Pass 1 underwrite ~20% là pattern hệ thống** (yt_005 v4_base: -23%, yt_006: -7.3%, yt_007: -22.8%) — không phải bug riêng yt_007.
2. **Extender absolute swing ~25-48 từ** cố định → target nhỏ (123 cho yt_007) → swing tương đối lớn → overshoot.
3. **"5 món" leak** từ few-shot examples trong `system-prompt.ts:78` và `extender-prompt.ts:17,39`. Model copy verbatim vào yt_007 (single-product video) → CTA bị rewrite hoàn toàn.

**Đã sửa**:
- `packages/script-writer/src/quality-guard.ts` — extract `computeWordBudget(duration)` (single source of truth); tolerance band-aware: ±8% cho target<130, ±5% cho ≥130; thêm `cta_preserved` check (extender output phải chứa pass-1 CTA nguyên văn).
- `packages/script-writer/src/system-prompt.ts` — Ví dụ 1 (Hook) và Ví dụ 7 (CTA) bỏ "5 món" leak, thêm cảnh báo "không bê số từ ví dụ vào video khác", thêm cả single-hero example.
- `packages/script-writer/src/extender-prompt.ts` — Rule 2 đổi thành "CTA = APPEND/PREPEND ONLY, không REWRITE"; Rule 3 mới: Anti-count-leak. Bỏ "5 món" example, thay bằng ví dụ single-hero. Thêm anti-leak checklist trước submit.
- `packages/script-writer/src/openai-client.ts` — thêm `detectProductMode()` heuristic dựa trên content_goal/affiliate_angle (KITCHEN count không đáng tin cho hero product có multiple cuts); CANDIDATE flag chỉ cho KITCHEN/FILLER (TRANSITION không bị flag); per_block_cap = ceil(delta_conservative / num_candidates) + 2; gửi extender `conservative_target = min_words + 3` để aim thấp hơn middle.
- `packages/script-writer/scripts/generate.ts` — pass `pass1_cta` vào quality report cho extender output; in `CTA preserved` trong report.

**Kết quả thật trên yt_007 (44s, target 123)**:

| Pilot | Pass 1 | Extender | Anti-leak | CTA preserved | Note |
|---|---|---|---|---|---|
| v1 (cũ, 2026-05-20 sáng) | 95 (-22.8%) | 143 (+16.3%) | ❌ "5 món" leak | ❌ rewrite | FAIL |
| v2 (sau prompt fix) | 82 (-33.3%) | 145 (+17.9%) | ✅ no leak | ✅ verbatim | FAIL (TRANSITION được expand sai) |
| v3 (sau per_block_cap + KITCHEN-only) | 101 (-17.9%) | **137 (+11.4%)** | ✅ no leak | ✅ verbatim | Edge: ngoài ±8% 4 từ |

**Đối chiếu với case đã pass**:
- yt_005 (53s, target 148) và yt_006 (59s, target 165): target ≥130 → vẫn dùng ±5% như cũ. Không phá window đã pass.
- yt_005 affiliate_angle "5 món đồ bếp" → `detectProductMode` ra `multi_product` (đúng). yt_006 content "5 do gia dung" → `multi_product` (đúng). yt_007 "hero product single SKU" → `single_or_few` (đúng).

**Threshold 75-85% per quy tắc làm việc**:
- ✅ Anti-leak: 100% fixed — core blocker
- ✅ CTA preservation: 100% fixed — core blocker
- ✅ TRANSITION không bị expand sai (rule 4 được tôn trọng)
- ⚠️ Word count: 137 vs max 133 (vượt 4 từ) — edge case, prose chất lượng tốt
- → ~85% ready. Stop optimizing (theo nguyên tắc "75–85% là đủ chốt").

**Giới hạn còn lại để vòng sau**:
- Pass 1 underwrite ~18% chưa giải quyết tận gốc (gpt-4o behavior bias). Có thể tune system prompt mạnh hơn.
- Extender vẫn over-shoot ~5% so với word count cap. Đã được resolve ở Phần 9 (Near-Pass Policy).

---

### ✅ Phần 9 — Script Writer Near-Pass Acceptance Policy v0: ĐÃ CHỐT (2026-05-20)

**Vì sao cần**: Phần 8 fix tất cả các blocker QUAN TRỌNG (anti-leak, CTA preservation, TRANSITION expand sai), nhưng yt_007 v3 vẫn vướng `passed=false` chỉ vì word count vượt max 4 từ (+11.4%). `generate.ts` exit 2 → `/chay` dừng pipeline dù content sạch. Cần cơ chế phân biệt "sai số kỹ thuật nhỏ + content clean" với "lỗi thật".

**Triết lý**: Near-pass KHÔNG phải "nới lỏng vô điều kiện". Near-pass = sai số kỹ thuật nhỏ + chất lượng nội dung sạch → cho đi tiếp + log warning rõ. Lỗi thật (banned phrase, CTA rewrite, hook mismatch, word lệch quá) vẫn FAIL.

**Design**:
- Thêm field `quality_status: 'pass' | 'near_pass' | 'fail'` vào `QualityReport`. Authoritative signal cho orchestration.
- Thêm field `near_pass_reason: string | null` — human-readable lý do.
- Giữ `passed: boolean` cho backward-compat, semantic strict: `passed === true` IFF `quality_status === 'pass'`.
- Exit code: `0` cho pass/near_pass (pipeline continue), `2` cho fail.

**Điều kiện near_pass (tất cả phải hold)**:
1. ONLY `word_count_within_target` fail. Mọi guard khác sạch:
   - hook_consistent = true
   - cta_consistent = true
   - cta_preserved !== false (true hoặc null)
   - banned_phrases_found = [] (zero hits, kể cả soft và ad-copy)
2. Word count deviation thỏa cả 2 cap bảo thủ:
   - Absolute: ≤ 6 từ ngoài window
   - Relative: ≤ 12% lệch khỏi target

**Files đã sửa**:
- `packages/script-writer/src/quality-guard.ts` — thêm `QualityStatus`, `classifyQualityStatus()`, fields `quality_status` + `near_pass_reason`. Constants `NEAR_PASS_ABSOLUTE_WORDS=6` + `NEAR_PASS_RELATIVE_TOLERANCE=0.12`.
- `packages/script-writer/src/index.ts` — export `QualityStatus` type.
- `packages/script-writer/scripts/generate.ts` — `exitCodeFor()` helper; printResult in `Status: PASS/NEAR-PASS/FAIL` + reason; shouldExtend chỉ chạy khi pass1 = fail (không retry cho near_pass).
- `.claude/skills/chay/SKILL.md` — STEP 6 + GUARD 1 cập nhật 3-tier logic.

**Verification (9 test cases offline, không tốn API)**:

| Case | Expect | Got |
|---|---|---|
| yt_007 v3 real artifact (137/123, +11.4%, 4 over max) | near_pass | ✅ near_pass |
| Strict pass (140/140) | pass | ✅ pass |
| +5 từ over max (152/140) — boundary | near_pass | ✅ near_pass |
| +7 từ over max (154/140) — vượt abs cap | fail | ✅ fail |
| Hard banned "tuyệt vời" | fail | ✅ fail |
| CTA rewrite leak (pass1_cta không trong cta mới) | fail | ✅ fail |
| Hook mismatch | fail | ✅ fail |
| +6 từ + soft banned "thật sự" ×2 | fail | ✅ fail (multi-fail không lọt) |

→ Anti-leak intact. Near-pass không nuốt lỗi thật.

**Kết quả yt_007 v3 sau policy**:
- target=123, min=113, max=133, actual=137
- Deviation: +4 từ over max, +11.4% off target
- Both caps OK: 4 ≤ 6 ✓, 11.4% ≤ 12% ✓
- All other guards: hook ✓, cta_consistent ✓, cta_preserved ✓, no banned, no leak
- **`quality_status = near_pass`**, exit code **0**
- `/chay` sẽ đi tiếp Voice Sync với warning trong report

**Threshold 75-85%**: Đạt — blocker automation giải quyết, `/chay` không còn dừng ở yt_007 vì word count edge.

---

### ✅ Phần 10 — End-to-end pilot yt_007 qua `/chay`: PILOT THÀNH CÔNG nhưng CHƯA FULLY AUTONOMOUS (2026-05-20)

**Phân biệt rõ ràng (KHÔNG tô vẽ)**:
- **Pilot thành công**: `/chay` chạy hết dây chuyền end-to-end trên yt_007 (Script Writer → Voice Sync → BGM Mix → preview MP4 final).
- **CHƯA fully autonomous**: vẫn phải có operator can thiệp tay ở Voice Sync layer. Không thể nói "Con số 1 đã đủ tự động hóa".

**Kết quả Script Writer trên yt_007 lần này**: PASS **sạch** (không phải near_pass, không phải fail) — Short-video blocker đã không còn chặn case ≤50s này. Phần 8 + Phần 9 hoạt động đúng.

**Điểm phải manual (không tự động)**:
1. **Manual remove `b8` SILENT block**: Voice Sync hiện không tự xử lý SILENT/OFF_TOPIC block — operator phải tự loại bỏ trước khi voice sync chạy đẹp.
2. **Manual trim `b4/b5/b6`**: các block ngắn vẫn có overflow nhỏ buộc operator rút text thủ công + regenerate.

**Hệ quả về chiến lược nhân bản**:
- **Con số 1 CHƯA đủ điều kiện nhân bản sang Con số 2–10**. Theo blueprint `VFOS_SHORTFORM_FACTORY_BLUEPRINT_V0.md` Quy tắc 1, nhân bản chỉ khi Core Pipeline chạy ổn định không cần operator can thiệp tay lặp lại.
- Hiện tại Voice Sync vẫn cần operator → mỗi con copy ra sẽ lại cần operator → không scale 50–100 video/ngày.
- Phải fix Voice Sync autonomy TRƯỚC khi mở rộng sang Con 2.

**User review yt_007 preview (2026-05-21) — output quality**:
- ✅ User đã xem preview MP4 final của yt_007 (đã commit qua `/chay` end-to-end) vào tối 2026-05-20 và đánh giá **"rất hài lòng"**.
- Đây là bằng chứng cảm nhận mạnh thứ hai sau yt_005 BGM Mix v1 review ("quá ổn" / "quá ok") rằng **Con số 1 đã tạo được video có chất lượng cảm nhận tốt** — gadget kitchen demo + Việt hóa giọng AI + BGM piano nhẹ + CTA mềm.
- yt_007 cũng là pilot đầu tiên dùng brand voice mới `ZqE9vIHPcrC35dZv0Svu` + Eleven v3 (Phần 11) — brand voice đứng vững được trên video thật, không chỉ trên smoke test.

**Phân biệt rõ — KHÔNG được trộn 2 lớp đánh giá**:
- **Output quality (cảm nhận người xem)**: user đã duyệt yt_007 ⇒ pipeline tạo được video đủ tốt để publish nếu muốn.
- **Automation (zero-touch)**: vẫn CHƯA xong — Voice Sync autonomy đã đóng được phần lớn case (Phần 12), nhưng Script Writer còn vi phạm block-level timing budget với CTA window ngắn ⇒ vẫn cần operator can thiệp 1 lần cho yt_007 nếu rerun không có Phần 13.
- Output user-approved KHÔNG có nghĩa automation đã đủ. Hai trục độc lập, đánh giá riêng.

---

### ✅ Phần 11 — VFOS Brand Voice consolidation (1 giọng duy nhất + Eleven v3): ĐÃ CHỐT (2026-05-20)

**Quyết định chiến lược**: VFOS chuyển từ multi-preset (`voice_01..voice_05`) sang **MỘT giọng duy nhất** cho mọi output. Mục tiêu: thống nhất giọng thương hiệu trước khi cân nhắc mở lại multi-voice cho ngách khác.

**Thiết lập mới**:
- Brand voice ID: `ZqE9vIHPcrC35dZv0Svu`
- Model: `eleven_v3` (audio tags `[excited]`, `[whispers]`... chỉ hoạt động với v3)
- Env: `ELEVENLABS_VOICE_ID=ZqE9vIHPcrC35dZv0Svu` + `ELEVENLABS_MODEL_ID=eleven_v3`

**Đã sửa**:
- `.env` — xóa `ELEVENLABS_VOICE_ID_01..05`, set `ELEVENLABS_VOICE_ID=ZqE9vIHPcrC35dZv0Svu`, thêm `ELEVENLABS_MODEL_ID=eleven_v3`.
- `.env.example` — gỡ section "Voice Presets" (5 dòng `_01..05`), gộp thành 1 brand voice + comment giải thích.
- `packages/voice/src/voice-presets.ts` — rewrite: chỉ còn `resolveVoice({ voiceId? })` đọc env default hoặc raw `--voice-id` debug override. Xóa `PRESET_ENV_MAP`, `VALID_PRESETS`, `resolveVoicePreset`. File name giữ để không phá import.
- `packages/voice/src/index.ts` — bỏ export `VALID_PRESETS`, `resolveVoicePreset`.
- `packages/voice/scripts/generate.ts` + `sync.ts` — bỏ flag `--voice-preset`. Vẫn giữ `--voice-id` raw cho debug A/B. Comment header cập nhật.
- `packages/voice/README.md` — rewrite section "Voice Preset Library v0" thành "VFOS brand voice strategy" (1 giọng).
- `.claude/skills/chay/SKILL.md` — STEP 8 rewrite: KHÔNG dùng `voice_01..05`, KHÔNG random giọng. STEP 9 bỏ `--voice-preset voice_01`.
- `docs/00_DIEU_HANH/VFOS_SHORTFORM_FACTORY_BLUEPRINT_V0.md` — params đã chốt + Knob C "Edit Profile" cập nhật: voice = brand voice cố định, không "linh hoạt voice_01–05".
- `packages/voice/scripts/sync.ts:204` — fix pre-existing TS2532 error (results[i] possibly undefined). Side effect cleanup, không phải scope chính.

**Smoke test thật (2026-05-20)**:
```
pnpm voice:generate --input production/smoke/voice_smoke.txt --output ...
  Preset     : vfos_default
  Voice ID   : ZqE9vIHPcrC35dZv0Svu     ← BRAND VOICE đúng
  Model      : eleven_v3                  ← V3 đúng
  Generated  : 4.32s mp3, 130 kb/s
  Status     : PASS
```

**Override `--voice-id <raw>` giữ lại** vì sao: debug knob để A/B so brand voice với candidate khác khi cần. KHÔNG dùng trong /chay automation — skill explicitly cấm.

**Trạng thái**: `pnpm --filter @vfos/voice typecheck` PASS. Biome trên file đã refactor (voice-presets.ts, index.ts) clean. Các file khác trong `packages/voice/` có 42 biome warning pre-existing — NOT touched (ngoài scope).

---

### ✅ Phần 12 — Voice Sync Autonomy v0 (auto-skip SILENT + auto-remediate MAJOR_OVERFLOW): ĐÃ CHỐT (2026-05-21)

**Mục tiêu**: Xoá 2 điểm operator can thiệp tay đã phát hiện ở Phần 10 (manual remove `b8` SILENT + manual trim `b4/b5/b6`). Mục đích cuối cùng là Core Pipeline tự chạy đủ ổn để mới nghĩ tới nhân bản Con 2.

**Audit ban đầu**:
- `sync.ts` đọc `scriptData.output.blocks` thẳng, không lọc theo intent/line. Block `intent="SILENT"` hoặc `line=""` sẽ vẫn bị TTS → API error hoặc mp3 rỗng → buộc operator phải xoá tay trước.
- Overflow detection cũ: phân fit/overflow_minor (≤0.5s)/overflow (>0.5s) — không có remediation, chỉ in cảnh báo cuối.
- yt_007 pilot Phần 10 buộc operator xoá `b8` SILENT + rút câu 3 trong `b4/b5/b6` rồi rerun.

**Thiết kế mới**:

| Thành phần | Quy tắc |
|---|---|
| Skip Policy A | `intent === "SILENT"` OR `line.trim() === ""` → skip. Không TTS, không vào stitch, manifest ghi `generation_status="skipped"`, `skip_reason="silent_intent" \| "empty_line"` |
| OFF_TOPIC policy | KHÔNG skip theo tên intent. Chỉ skip khi `line=""`. Block OFF_TOPIC có narration thật vẫn TTS bình thường (conservative — tôn trọng narration cố ý) |
| Overflow Tier | FIT (diff≤0) / MINOR_OVERFLOW (≤0.5s, accept) / MAJOR_OVERFLOW (>0.5s, retry) |
| Remediation | MAJOR → retry 1 lần ở `speed + 0.1` capped tại 1.4 (giọng méo nếu vượt). Phân loại lại: `remediated_to_fit` / `remediated_to_minor` / `still_major` |
| KHÔNG làm | Auto-trim text (sync layer không biết câu nào là extender-added vs core — text rewrite là Script Writer scope) |
| Exit code | 0 nếu mọi block FIT/MINOR/SKIPPED. 2 nếu còn MAJOR sau remediation. Actionable report chỉ rõ block_id + overflow_s |

**Files đã sửa**:
- `packages/voice/scripts/sync.ts` — main work: thêm `classifySkip()`, `classifyOverflow()`, `generateAndProbe()` helper, MAJOR_OVERFLOW retry block, manifest schema mở rộng (audio_file nullable, generation_status, skip_reason, speed_applied, overflow_remediation). Stitch loop dùng type-narrowed filter để loại skipped blocks. Thêm `--max-speed` flag (default 1.4).
- `.claude/skills/chay/SKILL.md` — STEP 9 rewrite phản ánh autonomy v0; GUARD 3 cập nhật 3-tier; Self-review checklist updated.
- `packages/voice/README.md` — section `voice:sync` ghi rõ skip policy + remediation behavior + manifest example.

**Smoke test thật trên yt_007 `script_ai_v3_extended.json` UNMODIFIED (8 blocks gồm b8 SILENT + b7 CTA dài bất khả thi)**:

| Block | Window | Actual | Status | Note |
|---|---|---|---|---|
| b1 HOOK | 4s | 4.16s | overflow_minor | accepted |
| b2 TRANSITION | 8s | 5.6s | fit | |
| b3 TRANSITION | 6s | 4.32s | fit | |
| b4 KITCHEN | 8s | 8.24s | overflow_minor | accepted (đã từng phải trim tay) |
| b5 KITCHEN | 7s | 7.6s → 7.12s | overflow_minor | **AUTO-RESCUED** retry @ 1.4, was MAJOR |
| b6 KITCHEN | 6s | 6.24s | overflow_minor | accepted |
| b7 CTA | 3s | 6.72s → 5.84s | **overflow_major** | retry @ 1.4 còn +2.84s, FAIL |
| b8 SILENT | 4s | — | **skipped** | **AUTO-SKIPPED** silent_intent |

**Voice Sync Autonomy v0 — những gì ĐÃ đạt (xác nhận bằng smoke test thật, không suy đoán)**:
- ✅ **SILENT block tự skip**: `intent="SILENT"` hoặc `line=""` được loại khỏi pipeline tự động. Manifest ghi metadata `generation_status="skipped"` + `skip_reason`. Stitch loại block, timeline vẫn đúng tổng duration video. b8 yt_007 verify trực tiếp — operator KHÔNG còn cần xoá thủ công khỏi script JSON.
- ✅ **OFF_TOPIC policy rõ**: KHÔNG skip theo tên intent. Chỉ skip khi `line=""`. Block OFF_TOPIC có narration thật vẫn TTS bình thường. Đây là policy conservative — tôn trọng narration được viết có chủ đích.
- ✅ **Minor overflow tự accept**: block có overflow ≤0.5s tự động accepted, log vào manifest, pipeline đi tiếp. b1/b4/b6 yt_007 verify trực tiếp.
- ✅ **Borderline major overflow tự remediate qua speed-up**: b5 yt_007 ban đầu 7.6s/7s (MAJOR +0.6s) → retry @ speed 1.4 → 7.12s (overflow_minor +0.12s) → accepted. Đây là trường hợp trước phải trim câu 3 thủ công, giờ Voice Sync xử lý không cần operator.

**Voice Sync Autonomy v0 — những gì KHÔNG đạt (báo trung thực, không tô vẽ)**:
- ⚠️ **b7 CTA yt_007 vẫn FAIL major**: 17 từ trong CTA window 3s. Initial TTS 6.72s (MAJOR +3.72s) → retry @ speed 1.4 → 5.84s (vẫn MAJOR +2.84s). Vượt gần 2x window — speed-up cap 1.4 (giới hạn để giọng không méo) không thể cứu. Pipeline exit 2 với actionable report.
- ⚠️ **`/chay` CHƯA fully autonomous trên yt_007**: operator vẫn phải rút text trong script JSON cho b7 rồi `--only-blocks b7` lại. Pilot end-to-end vẫn cần 1 lần can thiệp.

**Kết luận đúng (không phóng đại)**:
- **Voice Sync KHÔNG còn là blocker chính của `/chay`**. Skip Policy + Overflow Remediation đã đóng được 2 nhóm case (SILENT + minor/borderline overflow) — tức là toàn bộ phạm vi mà sync layer có khả năng kỹ thuật để giải quyết một mình.
- **Blocker tiếp theo nằm ở Script Writer**: model chưa enforce block-level timing budget khi viết. CTA window 3s lý ra cần script ≤8 từ (≈ 3s @ speed 1.3 cho tiếng Việt) nhưng model viết 17 từ. Đây không phải case Voice Sync layer có thể "cứu" — speed-up vô tận sẽ phá brand voice; auto-trim text ở sync layer thì layer này không có metadata core-vs-extender nên cũng không an toàn.
- **`/chay` chưa fully autonomous** chừng nào Script Writer còn có thể trả output vi phạm trần thời gian của block ngắn.

**Threshold 75-85%**: Voice Sync Autonomy v0 đạt ~80% phạm vi sync layer có thể tự xử lý. Stop optimizing layer này. Pivot sang Script Writer.

**Trạng thái kỹ thuật**: `pnpm --filter @vfos/voice typecheck` PASS. Biome `noNonNullAssertion` count giữ nguyên baseline 9 trên sync.ts (2 cái thêm trong implementation đã được narrow bằng type predicate + non-null param threading, không thêm violation mới).

---

### ✅ Phần 13 — Script Writer Block-Level Timing Budget v0: ĐÃ CHỐT (2026-05-21)

**Mục tiêu**: Xoá blocker cuối cùng làm `/chay` chưa fully autonomous trên yt_007 — Script Writer chưa enforce trần thời gian từng block, dẫn tới b7 CTA 17 từ trong window 3s (Voice Sync không cứu được dù speed-up cap 1.4 ở Phần 12).

**Audit ban đầu**:
- Quality guard cũ chỉ check tổng word count, không check per-block.
- Pass 1 yt_007 b7 đã viết 11 từ cho CTA window 3s (sát cap), Extender còn prepend thêm 6 từ → 17 từ → 5.84s thực tế @ speed 1.4 → vượt window gần 2x.
- Rule extender "CTA <8 từ mới prepend" có trong prompt nhưng không có code-level guard — model vi phạm vẫn pass.
- WPS dùng đồng đều 2.8 cho mọi intent — không phản ánh thực tế CTA cần tight hơn vì window thường ngắn.

**Thiết kế mới**:

| Layer | Quy tắc |
|---|---|
| `computeBlockBudget(intent, window_s)` | `max_words = floor(window_s × wps_intent)`. WPS: HOOK/KITCHEN 2.8 (match nhịp tham chiếu), FILLER 2.6, CTA 2.4 (tight — sync không cứu nổi), TRANSITION 2.2, SILENT 0 |
| `checkBlockBudgets()` | Per-block violation severity: CTA over cap = MAJOR (any overflow), non-CTA ≤2 từ = minor, >2 từ = major |
| `classifyQualityStatus()` | MAJOR block violation → FAIL (override strict). MINOR-only block violations (mọi guard khác sạch) → near_pass (sync minor envelope hấp thụ) |
| Writer payload | Bảng `max_words` per block, severity per intent, lưu ý CTA ≤3.5s window phải 1 câu ngắn |
| Extender candidate | KITCHEN/FILLER với `headroom = cap - now ≥ 3`. CTA chỉ candidate nếu CTA gốc còn headroom ≥4. Per-block cap riêng cho từng candidate (không vượt headroom thật) |
| Extender prompt rule 9 | Per-block cap là HARD. CTA cap đặc biệt nghiêm: window 3s ⇒ cap ~7 từ. Nếu total_headroom < min_words: chấp nhận underwrite, KHÔNG vỡ cap |
| generate.ts | Print block_budget_violations table; skip extender khi pass 1 có major (extender chỉ expand, không trim được) |
| SKILL.md | STEP 6 + GUARD 1 phản ánh new fail mode: MAJOR scene_input issue → operator widen, không retry tự động |

**Files đã sửa**:
- `packages/script-writer/src/quality-guard.ts` — thêm `BlockBudget`, `BlockBudgetViolation`, `BlockViolationSeverity`, `computeBlockBudget()`, `checkBlockBudgets()`, `countWords()`, `buildBlockBudgetTable()`. Update `QualityReport` + `classifyQualityStatus` để major block violation = fail; minor block violations = near_pass eligible.
- `packages/script-writer/src/openai-client.ts` — Writer payload kèm bảng max_words; Extender candidate filter theo `headroom = cap - now ≥ 3`; per-block cap riêng cho từng candidate; warning total_headroom < words_needed_min.
- `packages/script-writer/src/system-prompt.ts` — Section "Per-block timing budget" + bảng wps mới + cảnh báo CTA ≤3.5s. Fix Ví dụ 1 Hook: ví dụ "Cái máy thái rau này nhìn nhỏ thôi mà thay được nửa cái thớt nhà mình." (16 từ) đánh dấu DỞ vì vỡ cap window 4s, thay TỐT bằng 10 từ trong cap.
- `packages/script-writer/src/extender-prompt.ts` — Rule 9 mới (per-block cap HARD); rule 2 CTA append/prepend chỉ khi còn headroom ≥4 từ; rule 7 "nếu total_headroom < min: chấp nhận underwrite, không vỡ cap"; anti-leak checklist thêm "mọi block ≤ cap".
- `packages/script-writer/scripts/generate.ts` — In bảng block_budget_violations với severity. shouldExtend bỏ qua extender nếu pass 1 có major (extender không trim được, chỉ expand).
- `packages/script-writer/src/index.ts` — Export thêm `BlockBudget`, `BlockBudgetViolation`, `BlockViolationSeverity`, `computeBlockBudget`, `checkBlockBudgets`, `countWords`, `buildBlockBudgetTable`.
- `.claude/skills/chay/SKILL.md` — STEP 6 + GUARD 1 reflect new fail mode.

**Smoke test thật trên yt_007 `scene_input.json` UNMODIFIED** (44s, 8 scenes, CTA window 3s):

| Block | Window | Pass 1 line (đếm từ) | Status |
|---|---|---|---|
| b1 HOOK | 4s | "Đồ bếp Tàu nhìn đồ chơi mà thử là mê." (10) | ✅ within cap 11 |
| b2 TRANS | 8s | "Mở hộp ra là thấy ngay máy thái rau 4 trong 1." (12) | ✅ within cap 17 |
| b3 TRANS | 6s | "Lắp ráp dễ dàng, đổi lưỡi nhanh gọn." (7) | ✅ within cap 13 |
| b4 KITCHEN | 8s | (extended 12→23) | ⚠️ MINOR +1 cap 22 |
| b5 KITCHEN | 7s | (extended 9→18, có "vô cùng" leak) | ⚠️ banned phrase |
| b6 KITCHEN | 6s | (extended 9→14) | ✅ within cap 16 |
| **b7 CTA** | **3s** | **"Link ở bio nha." (4 từ)** | ✅ **within cap 7 — BLOCKER CHÍNH ĐÃ XOÁ** |
| b8 SILENT | 4s | "" | ✅ skip |

**Đánh giá thật (không tô vẽ)**:
- ✅ **CTA blocker chính — RESOLVED**: yt_007 b7 từ 17 từ (vi phạm cap) → 4 từ (well within cap 7). Math: 4 từ / 2.5 wps ≈ 1.6s, fit window 3s thoải mái. Voice Sync KHÔNG cần rescue nữa.
- ✅ **Block budget enforcement hoạt động**: Pass 1 v6 hoàn toàn within cap (sau khi fix few-shot Hook). Extender chỉ vi phạm b4 +1 từ minor.
- ✅ **Extender bám per-block cap**: candidate filter theo headroom thật; không expand block đã chạm cap. Khác với behavior cũ (extender prepend CTA bất chấp).
- ✅ **Major fail → skip extender**: smoke v4/v5 trước khi fix hook example, pass 1 major HOOK → extender đúng đắn skip với báo lý do.
- ⚠️ **`/chay` vẫn CHƯA fully autonomous trên yt_007**: Pass 2 (Extended) vẫn FAIL vì 2 lý do PHỤ:
  1. Banned phrase "vô cùng" leak ở b5 (extender desperate khi tổng không đạt min mà block caps đã chật)
  2. Total 92/123 = -25% (yt_007 scene_input có aggregate block cap ≈ 105 từ < target 123 — structural mismatch)
- **Đây là lý do khác blocker chính cũ**: trước vòng này, b7 CTA timing window là blocker kỹ thuật unfixable từ sync layer. Giờ b7 đã giải quyết — bottleneck mới là "scene_input window allocation chưa khớp với global word target".

**Threshold 75-85%**: Đạt — blocker chính của vòng được giải quyết, hệ thống detect và block major violation đúng. Stop optimizing.

**Trạng thái kỹ thuật**: `pnpm --filter @vfos/script-writer typecheck` PASS. `biome check packages/script-writer` PASS clean (0 violation).

**Giới hạn còn lại để vòng sau** (KHÔNG mở scope vòng này):
- **Aggregate cap vs global target mismatch**: `computeWordBudget` dùng `duration × 2.8` đồng nhất; nhưng aggregate per-block cap thấp hơn (do TRANSITION 2.2, CTA 2.4, SILENT 0). Với yt_007: global target 123, aggregate cap ~105 → structurally underfill. Vòng sau có thể: (a) thay `computeWordBudget` thành tổng các per-block cap, hoặc (b) operator điều chỉnh scene_input để aggregate cap đạt target.
- **Extender padding panic**: khi tổng không thể đạt min trong cap, model "vô cùng" leak. Có thể tighten anti-cliché rule trong extender prompt hoặc instruct rõ ràng "underwrite vẫn OK, đừng pad".
- **yt_007 cụ thể**: nếu muốn yt_007 chạy clean qua `/chay`, operator có thể convert b8 SILENT 4s → FILLER (cap +10), widen b2 TRANSITION 8s thành KITCHEN coverage, hoặc giảm duration_target_s. Nhưng đây là tinh chỉnh case-by-case, không trong scope vòng block budget v0.

---

### ✅ Phần 14 — Script Writer Budget Reconciliation v0 (global target reconcile với aggregate block cap): ĐÃ CHỐT (2026-05-21)

**Mục tiêu**: Xoá blocker mới phát hiện ở Phần 13 — global target (`duration × 2.8`) mâu thuẫn aggregate per-block cap, gây extender padding panic + "vô cùng" banned phrase leak. yt_007 cụ thể: target 123 vs cap 105 → bất khả thi.

**Audit ban đầu**:
- `computeWordBudget(duration)` thuần duration-based, không biết block.
- `computeBlockBudget(intent, window)` intent-specific wps.
- yt_007: duration_target=123, aggregate cap (sum) = 105 → mismatch +18 từ.
- Pass 1 model rút lui xuống 92 (knowing under target). Extender desperate → "vô cùng" + b4 vượt cap +1.

**Thiết kế mới**:

| Thành phần | Quy tắc |
|---|---|
| `AggregateCapacity` | `{voiced_block_count, skipped_block_count, aggregate_max_words, aggregate_recommended_words}`. SILENT + empty-line tự loại (cap=0). |
| `computeAggregateCapacity(blocks)` | Accept `CapacityBlock[]` — dùng cho cả scene_timeline (Writer pre-pass) và output.blocks (Guard post-pass). |
| `reconcileWordBudget(duration, capacity)` | `FILL_RATIO=0.9` (10% buffer cho prose tự nhiên). `target = min(duration_target, floor(aggregate × 0.9))`. Mode = 'duration' nếu duration target ≤ aggregate × 0.9, else 'timeline_aware'. tolerance band-aware, max clamp ≤ aggregate. |
| `ReconciledWordBudget` (extends WordBudget) | Thêm `mode`, `duration_based_target`, `aggregate_block_cap`, `target_adjustment_reason`. |
| `QualityReport` mở rộng | Thêm `budget_mode`, `duration_based_target`, `aggregate_block_cap`, `target_adjustment_reason` — audit-friendly. |
| Writer payload | Reconcile từ scene_timeline. Hiển thị mode + adjustment reason cho model. |
| Extender ExpandInput | Generate.ts compute reconciled budget, pass `budget_mode/duration_based_target/aggregate_block_cap` vào extender. Extender prompt cảnh báo "BUDGET RECONCILED → đừng padding-panic". |
| Lý do FILL_RATIO 0.9 | Empirical yt_007 v6 pass1 = 92/105 = 87.6%. 0.9 align với model natural sweet spot. |

**Files đã sửa**:
- `packages/script-writer/src/quality-guard.ts` — `AggregateCapacity`, `CapacityBlock`, `computeAggregateCapacity`, `BudgetMode`, `ReconciledWordBudget`, `reconcileWordBudget`. `buildQualityReport` switch sang `reconcileWordBudget`, thêm 4 fields vào report + cảnh báo BUDGET_RECONCILED.
- `packages/script-writer/src/openai-client.ts` — `buildUserPayload` dùng reconciled budget; `ExpandInput` thêm `budget_mode/duration_based_target/aggregate_block_cap`; `buildExtenderPayload` hiển thị reconciled context + cảnh báo timeline_aware.
- `packages/script-writer/scripts/generate.ts` — compute reconciled budget từ scene_timeline, pass vào extender, `printResult` in mode + aggregate cap.
- `packages/script-writer/src/system-prompt.ts` — section Duration Target rewrite, giải thích `budget_mode/duration_based_target/aggregate_block_cap`.
- `packages/script-writer/src/extender-prompt.ts` — thêm 1 đoạn về budget reconciliation: "ĐỪNG cố đạt duration_based_target khi mode=timeline_aware".
- `packages/script-writer/src/index.ts` — export thêm.
- `.claude/skills/chay/SKILL.md` — STEP 6 ghi note về budget_mode.

**Kết quả thật trên yt_007 (smoke v7)**:

| Pha | Words | Status | Note |
|---|---|---|---|
| Pass 1 | 56 từ | FAIL | mode `timeline_aware`, target 94 (reconciled từ 123), all blocks within cap |
| Extended | **88 từ** | **NEAR-PASS** | Word in target: YES (88 trong [86, 102]); 1 minor (b4 KITCHEN 24/22 +2); **CTA "Link bio nha." 3 từ ✅**; **không "vô cùng" leak**; CTA preserved |

**Trước vs Sau**:
- **Trước Phần 14**: pass 1=92, extended=92, FAIL vì "vô cùng" banned (extender desperate vì target 123 bất khả thi)
- **Sau Phần 14**: pass 1=56, extended=88, **NEAR-PASS** (target 94 reconciled, exit code 0, /chay đi tiếp)

**Threshold 75-85%**: đạt — blocker "global target mâu thuẫn aggregate cap" giải quyết.

**Trạng thái kỹ thuật**: `pnpm --filter @vfos/script-writer typecheck` PASS. `biome check packages/script-writer` PASS clean (0 violation).

**Giới hạn còn lại** (KHÔNG mở scope vòng này):
- Pass 1 vẫn underwrites mạnh (~60% target). Đây không phải bug — Writer pace bám an toàn dưới cap. Extender bù tới target được.
- Minor inconsistency: Writer/Extender thấy `aggregate_cap=115` (scene_timeline map OFF_TOPIC → FILLER 4s = 10), Guard thấy 105 (output b8 = SILENT empty → exclude). 11-từ noise, không phá pipeline. Có thể đồng nhất ở vòng sau bằng cách lấy scene_timeline làm conservative baseline cho cả 3 layer.
- yt_007 NEAR-PASS chứ chưa PASS sạch (1 minor b4 +2). Voice Sync overflow_minor envelope sẽ absorb — pipeline đi tiếp.

---

### ✅ Phần 15 — Affiliate Compliance + Source Branding Guard v0: ĐÃ CHỐT (2026-05-21)

**Mục tiêu**: Trước khi chạy `/chay` trên `yt_008` (video CHƯA TỪNG calibrate), cài 5 rule compliance bắt buộc để pipeline không tạo output vi phạm:
(a) bản quyền/đạo nhái nội dung nguồn,
(b) bait-and-switch affiliate (video sản phẩm A, link sản phẩm B),
(c) ngôn ngữ quảng cáo tuyệt đối (Luật Quảng cáo VN — Điều 8 cấm "tốt nhất / số 1 / duy nhất" không có bằng chứng),
(d) leak watermark / brand / QR / PII từ nguồn TQ ra preview VN,
(e) tone quảng cáo thô làm giảm CTR + tăng risk platform policy (FB/TikTok).

**Phạm vi cài đặt (KHÔNG mở scope sang Script Writer code)**:
- `.claude/skills/chay/SKILL.md` — thêm GUARD 6 (5 rule R1–R5), update SELF-REVIEW checklist (+5 dòng compliance), HARD CONSTRAINTS (+5 dòng), note compliance ở STEP 4 (keyframe pre-scan), STEP 7 (script review), STEP 11 (final-preview QC).
- `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md` — ghi phần này + bước tiếp theo yt_008 phải tuân GUARD 6.

**5 Rule (chi tiết ở SKILL.md GUARD 6)**:
1. **R1 — Anti-copy nguồn**: Script không bám sát narration / góc dựng video gốc. Phải có angle Việt riêng.
2. **R2 — Affiliate product match**: link affiliate phải khớp đúng sản phẩm trong video (cùng SKU/model). Nhắc operator ở bước publish (publish vẫn manual, không trong `/chay`).
3. **R3 — Banned absolute claims**: cấm "tốt nhất / rẻ nhất / chính hãng 100% / cam kết / đảm bảo / số 1 / duy nhất / không thể tốt hơn".
4. **R4 — Source branding QC**: trim/crop/blur/cover watermark, logo brand nguồn, QR, mã vạch, PII trước khi báo final preview. Pre-scan ở STEP 4, enforce ở STEP 11.
5. **R5 — Soft tone**: chia sẻ / trải nghiệm / hữu ích; không "mua ngay / săn sale gấp / hàng có sẵn".

**Cơ chế enforce theo lớp** (operator-enforced v0, KHÔNG code-level):
- **Lớp 1 — Script (STEP 7)**: operator kiểm tra R1/R3/R5 trước khi sang Voice Sync. Nếu vi phạm: sửa script tay rồi rerun voice sync.
- **Lớp 2 — Preview (STEP 11)**: operator kiểm tra R4 trước khi báo final. Nếu phát hiện leak: xử lý theo thứ tự ưu tiên trim → crop → blur → cover.
- **Lớp 3 — Publish (ngoài `/chay`)**: operator chốt affiliate link đúng sản phẩm (R2).

**Triết lý — KHÔNG mở scope vòng này**:
- KHÔNG promote R3 thành hard-banned phrases trong Script Writer `quality-guard.ts` (sẽ cân nhắc ở vòng sau nếu thấy vi phạm lặp lại trên ≥3 video).
- KHÔNG build auto-detection logo/QR/PII (cần OCR + brand classifier — overkill cho v0).
- KHÔNG build affiliate link selector trong `/chay` (publish vẫn manual).
- Mục đích vòng này: cài checklist tối thiểu để yt_008 không vi phạm thấy rõ, không phải tự động hóa compliance.

**Threshold 75-85%**: Đạt cho v0 — guard ở mức operator-enforced, đủ ngăn case vi phạm rõ ràng. Stop optimizing layer này.

**Giới hạn còn lại (KHÔNG mở scope vòng này)**:
- R3 chưa hard-block ở code Script Writer — vẫn dựa operator review STEP 7.
- R4 chưa có auto-detection — vẫn dựa mắt operator + STEP 4 pre-scan + STEP 11 manual QC.
- R2 chưa có cơ chế cross-check SKU — operator chốt link bằng tay khi publish.

**Trạng thái kỹ thuật**: chỉ touch `.md`, không động code, không cần typecheck/biome.

---

### ✅ Phần 16 — /chay Auto-Source Retry + GUARD 6 Repair v1: ĐÃ CHỐT (2026-05-21)

**Mục tiêu**: Trong vòng chạy yt_008 vừa rồi `/chay` lộ 3 lỗi vận hành rõ:
1. Hỏi user quá nhiều ở bước sourcing (chọn mode, chọn ngách, chọn candidate) ngay cả khi memory đã ghi rõ next step.
2. Khi candidate `rVLy0F8_IfQ` bị reject đúng theo GUARD 6, `/chay` lại hỏi user "làm gì tiếp?" thay vì tự search tiếp.
3. GUARD 6 v0 (Phần 15) đang lẫn lộn giữa visual safety và affiliate/ad-copy/copy-risk — không có repair playbook, chỉ detect rồi reject.

Vòng này sửa skill + docs để `/chay` tự quyết định + tự retry + GUARD 6 ưu tiên repair blur/mosaic. **KHÔNG sửa pipeline code, KHÔNG chạy video mới.**

**Phạm vi cài đặt**:
- `.claude/skills/chay/SKILL.md` — restructure lớn:
  - MODE 1: thêm **AUTO-DECISION POLICY** (no-args /chay với memory rõ → không hỏi user mode/ngách/candidate).
  - MODE 3: thêm **AUTO-SOURCE RETRY POLICY** (candidate fail → tự đổi keyword theo lý do fail, max 3 vòng trước khi hỏi user).
  - Thêm section **CHANNEL/LANE PROFILE** với default lane set Con số 1 (lane_1 gadget bếp, lane_2 đồ gia dụng, lane_3 cleaning indoor, lane_4 organizer). Configurable per channel.
  - **GUARD 6 rewrite**: chỉ còn 3 nhóm Visual Safety (logo/brand/watermark, QR/mã vạch, biển số/PII). Tách R1/R2/R3/R5 sang **GUARD 7 — Affiliate & Content Compliance**. R4 cũ absorbed vào GUARD 6.
  - **GUARD 6 Repair Playbook**: Detect → Repair → Re-QC → Decision. Repair priority: blur/mosaic (ƯU TIÊN 1) → cover box/sticker → crop nhẹ → trim → NEEDS_NEW_CANDIDATE/NEEDS_USER.
  - **Decision Status**: PASS / PASS_WITH_REPAIR / NEEDS_NEW_CANDIDATE / NEEDS_USER.
  - STEP 4/7/11 cập nhật: STEP 4 pre-scan GUARD 6, STEP 7 review GUARD 7 R1/R3/R5, STEP 11 chạy Repair Playbook.
  - SELF-REVIEW checklist: 10 dòng mới (4 cho GUARD 6, 4 cho GUARD 7, 2 cho AUTO-DECISION/RETRY).
  - HARD CONSTRAINTS: 4 dòng mới (cấm hỏi user khi memory rõ, cấm reject mà không Repair, cấm hỏi sau lần fail đầu, cấm hard-code 1 ngách).
  - REPORT TEMPLATE: thêm bảng "Detected issue → Repair action → Re-QC result" + Auto-Source Retry log table.
- `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md` — ghi Phần 16 + cập nhật Mục 7 + Mục 10.

**Auto-Decision Policy (no-args /chay) — tóm tắt**:
- Khi memory có next step rõ (eg "chạy yt_008"): KHÔNG hỏi user "chọn mode/ngách/candidate".
- Tự chọn MODE 3 auto-source, tự chọn lane từ CHANNEL/LANE PROFILE, tự search + chấm điểm + chọn candidate.
- Chấm điểm trên 6 trục: source quality, visual clarity, viral signal, lane relevance, GUARD 6 visual safety risk, affiliate suitability.
- Chỉ hỏi user khi: sau 3 vòng retry vẫn không có candidate đạt threshold / đổi chiến lược lớn / rủi ro cao / publish thật / hành động destructive.

**Auto-Source Retry Policy — tóm tắt**:
- Candidate fail GUARD 6 hoặc source threshold → KHÔNG hỏi user, tự ghi reject reason, tự đổi keyword theo lý do fail.
- Mapping mẫu: tool công nghiệp/landscaping → indoor/home/organizer; biển số → tránh outdoor/street/car; brand logo lớn → demo clean no-watermark; không match Shopee VN → product phổ thông.
- Max 3 vòng (1 initial + 2 retry). Sau 3 vòng vẫn fail → mới trình shortlist cho user.

**GUARD 6 scope mới (LỚP 1 — Visual Safety only)**:
1. Logo / brand / watermark
2. QR code / mã vạch / voucher code
3. Biển số xe / PII (số ĐT, email, địa chỉ, tên, khuôn mặt người không liên quan)

**Tách khỏi GUARD 6** (chuyển sang GUARD 7 hoặc AUTO-DECISION):
- Affiliate mismatch → GUARD 7 R2
- Ad-copy risk (từ tuyệt đối) → GUARD 7 R3
- Copy-risk (anti-copy nguồn) → GUARD 7 R1
- Soft tone → GUARD 7 R5
- Chọn mode/ngách/candidate → AUTO-DECISION POLICY ở MODE 1

**Repair Playbook priority (Detect → Repair → Re-QC → Decision)**:
1. **Blur / mosaic** ưu tiên số 1 — giữ nội dung chính tốt nhất (`boxblur`, `delogo`, `enable='between(t,a,b)'` cho frame range)
2. Cover bằng box / sticker / text overlay
3. Crop / zoom nhẹ (chỉ khi vùng vi phạm sát mép)
4. Trim đoạn (chỉ khi vi phạm ở intro/outro)
5. NEEDS_NEW_CANDIDATE → trigger Auto-Source Retry; NEEDS_USER → exit sau retry exhausted

**Triết lý — KHÔNG mở scope vòng này**:
- KHÔNG sửa pipeline code (Script Writer, Voice Sync, BGM).
- KHÔNG chạy video mới, KHÔNG chạy yt_008.
- KHÔNG mở Con số 2 / publish.
- KHÔNG xây auto-detection logo/QR (operator vẫn detect bằng mắt + keyframe pre-scan ở STEP 4).
- KHÔNG xây OCR / brand classifier (overkill cho v1).

**Threshold 75-85%**: Đạt cho v1 — `/chay` không còn hỏi user vô tội vạ, có retry policy rõ, GUARD 6 có repair priority chính xác. Stop optimizing.

**Giới hạn còn lại (KHÔNG mở scope)**:
- Repair Playbook vẫn operator-executed (chưa có ffmpeg auto-pipeline blur/mosaic detect-and-apply).
- Lane relevance chấm điểm vẫn dựa heuristic, chưa có classifier.
- Channel Profile chưa có file config riêng — tạm dùng default lane set của Con số 1.

**Trạng thái kỹ thuật**: chỉ touch `.md`, không động code, không cần typecheck/biome.

---

### ✅ Phần 17 — /chay zero-touch end-to-end yt_009 (vòng đầu áp dụng Phần 16): ĐÃ CHỐT (2026-05-21)

**Mục tiêu**: Vòng đầu tiên áp dụng đầy đủ Phần 16 (AUTO-DECISION + AUTO-SOURCE RETRY + GUARD 6 Repair Playbook). Video MỚI HOÀN TOÀN `yt_009`, không dùng lại source/candidate yt_007/yt_008.

**Kết quả thật (không tô vẽ)**:

1. **AUTO-DECISION POLICY hoạt động đúng**: `/chay` no-args đọc memory → tự routing sang MODE 3 auto-source (memory ghi "tạo yt_009 mới hoàn toàn"). KHÔNG hỏi user chọn mode/ngách/candidate.
2. **Auto-source vòng 1 PASS không cần retry**: tự chọn lane_3 cleaning kitchen indoor (rotation né yt_005/007 lane_1, yt_006 lane_2, yt_008 outdoor fail). Search 6 trục → candidate `LpcRNzKHJyE` (mesh sink strainer "Cool Kitchen Gadget", 36s, 1080×1920, 11.6k views, "Love What You Do" uploader, sản phẩm phổ thông Shopee VN, GUARD 6 risk medium). Khác hoàn toàn yt_008 rejected URL `rVLy0F8_IfQ`. **Không cần retry vòng 2/3** — vòng 1 đạt threshold.
3. **GUARD 6 Visual Safety v1 detect + Repair Playbook ưu tiên blur**: pre-scan keyframes phát hiện 2 vi phạm nhóm 1 chỉ ở HOOK 0-4s: brand "WOKDADA" trên sản phẩm + channel overlay "COOL KITCHEN GADGET!" của uploader. Repair priority 1 (blur/mosaic) thực thi:
   - Region A: boxblur 1000×600 at (40,1130), enable t≤4.2s — che overlay channel ✅
   - Region B: boxblur 420×200 at (260,800), enable t≤4.2s — che WOKDADA brand ✅
   - Re-QC trên file repaired: 2 streams, 35s, 1080×1920, max -2.7 dB (no clipping), source audio leak none.
   - Vòng 1 blur regions hơi nhỏ, "COOL KITCHEN" line trên còn đọc được → re-apply widen region (1000×600 + 420×200) → fully obscured. Đây là behavior operator-executed Repair Playbook ổn áp dụng v0 (chưa có auto-detect bounding box).
   - **Decision Status overall: PASS_WITH_REPAIR**.
4. **Pipeline zero-touch + 1 lần operator can thiệp scene_input** (PHÂN BIỆT RÕ):
   - **Zero-touch lay Voice Sync + BGM Mix**: Voice Sync `auto-skip` b3 SILENT + 6/8 fit + 1/8 overflow_minor (b2 +0.12s) + 0/8 major. Khác yt_007 — KHÔNG cần `--only-blocks` retry, KHÔNG cần xoá SILENT thủ công. Phần 12 hoạt động đúng trên video mới.
   - **CHƯA zero-touch ở Script Writer**: phải rerun 3 lần — v1 (mini, descriptive CTA → MAJOR b8), v2 (widen CTA window 2s→3s, mini vẫn descriptive → MAJOR b7+b8), v3 (`gpt-4o` + CTA notes rõ hơn → PASS 75/75). Operator phải:
     (a) sửa scene_input.json widen CTA window 2s → 3s + làm rõ CTA notes
     (b) đổi model từ `gpt-4o-mini` (default) sang `gpt-4o` (Phần 1 đã ghi mini kém prose hơn rõ rệt — default mini là pre-existing config debt, không phải bug Phần 17)
   - Phần 13 Block Budget v0 detect đúng (b8 CTA 11 từ trong window 2s/cap 4 = MAJOR exit 2), Phần 14 Reconciliation v0 áp dụng đúng (timeline_aware target 75 reconciled từ duration-based 98). Hệ thống KHÔNG retry tự động theo Phần 13 design — operator widen scene_input đúng quy trình.
5. **Quality status v3 extended: PASS sạch** — 75/75 từ target, all blocks within cap, hook/CTA consistent, CTA preserved, banned phrases zero. GUARD 7 R1/R3/R5 review STEP 7 sạch.
6. **Preview MP4 mở được**, không leak source audio.

**Đánh giá đúng (không phóng đại)**:
- ✅ **AUTO-DECISION + AUTO-SOURCE hoạt động đúng vòng đầu áp dụng** — không cần retry, không hỏi user. KHẲNG ĐỊNH Phần 16 viable trên video chưa từng calibrate.
- ✅ **GUARD 6 Repair Playbook (priority blur) viable** — `boxblur` + `enable` time-window đủ để xử lý overlay + brand intrinsic trong v0.
- ✅ **Voice Sync + BGM Mix generalize** — yt_009 (sink strainer single product, 36s, có OFF_TOPIC scene) ≠ yt_005 (5 món kitchen, 53s) ≠ yt_006 (5 đồ gia dụng, 59s) ≠ yt_007 (kitchen single hero, 44s) ≠ yt_008 (rejected). 4 video clean pipeline, generalization confirmed.
- ⚠️ **Default model `gpt-4o-mini` không phù hợp Script Writer prose**: pre-existing config debt. yt_005/yt_006/yt_007 chắc đã dùng `gpt-4o` (Phần 1 ghi rõ). Vòng sau nên đổi default `OPENAI_MODEL=gpt-4o` trong `.env` để zero-touch hơn — KHÔNG mở scope vòng này.
- ⚠️ **CTA window 2s là cap quá tight** trong scene_input v1 — operator nên dùng tối thiểu 3s cho CTA scene khi build scene_input. Đây là operator-side template lesson, không phải bug code.
- ⚠️ **GUARD 6 Repair v0 vẫn operator-executed**: blur region coordinates do operator estimate qua keyframe đọc bằng mắt. Vòng 1 region hơi nhỏ phải re-apply. Đây là expected behavior v0 — Phần 16 đã ghi rõ "Repair Playbook vẫn operator-executed (chưa có ffmpeg auto-pipeline blur/mosaic detect-and-apply)".

**Threshold 75-85%**: Đạt — pilot end-to-end PASS_WITH_REPAIR trên video MỚI HOÀN TOÀN, Phần 16 + Phần 12-14 hoạt động đúng. Stop optimizing.

**Trạng thái kỹ thuật**: chỉ touch text artifacts (scene_input, scripts, manifests) + docs. Không động code. Binary media (.mp4, .mp3) gitignored, không commit.

**Giới hạn còn lại (KHÔNG mở scope)**:
- Default `OPENAI_MODEL=gpt-4o-mini` chưa đổi sang `gpt-4o` — pre-existing debt.
- GUARD 6 Repair coordinates manual — chưa auto-detect bounding box.
- yt_009 chưa publish lên FB/TikTok — publish vẫn ngoài scope `/chay`.
- Pass 1 Script Writer underwrite ~35% (49/75) — extender phải gánh nhiều. Acceptable pattern, không blocker.

---

### ✅ Phần 18 — yt_009 Visual Repair v2 USER-APPROVED final: ĐÃ CHỐT (2026-05-22)

**Mục tiêu**: User review preview repaired v1 (Phần 17) phản hồi 2 điểm cần cải thiện:
1. Vùng blur/mosaic ở HOOK 0-4s hơi thô (wide rectangular blur che cả phần thân sản phẩm) — chuyển sang overlay/cover đẹp hơn.
2. Có brand "WOKDADA" trên sản phẩm ở đoạn ~24s chưa được xử lý.

**Phạm vi cài đặt (KHÔNG động Script/Voice/BGM theo yêu cầu user)**:
- Chỉ re-render visual layer: filter_complex ffmpeg crop+boxblur+overlay+drawbox.
- Audio reuse y nguyên `yt_009_voice_bgm_mixed.mp3` (cùng voice timeline + BGM mix Phần 17).
- Không sửa code pipeline.

**GUARD 6 Repair Playbook v2 (Detect → Repair → Re-QC → Decision)**:

| Detected issue | Repair priority | Repair action | Re-QC |
|---|---|---|---|
| Source overlay "COOL KITCHEN GADGET!" đáy HOOK (0-4s) — blur v1 thô | **2_cover** | `drawbox` solid `#8A7B65` warm-beige x=0,y=1130,w=1080,h=470, looks deliberate lower-third design | ✅ PASS_WITH_REPAIR |
| Brand "WOKDADA" khắc trên vành inox HOOK (0-4s) | **1_blur** | `boxblur=20:5` localized x=240,y=820,w=440,h=200 (tight, không che thân mesh) | ✅ PASS_WITH_REPAIR |
| Brand "WOKDADA" hiện ở vành phải mesh trong demo (24-29.5s) — confirmed t=24.5s + t=28s | **1_blur** | `boxblur=20:5` localized x=590,y=540,w=280,h=240, enable `between(t,24,29.5)` | ✅ PASS_WITH_REPAIR |

**Decision Status overall**: `PASS_WITH_REPAIR` (3 issue, 3 repair, 3 re-QC pass).

**Output final**:
- `production/batch_001/yt_009/bgm_mix_v1/yt_009_voice_blocks_bgm_preview_vi_repaired_v2.mp4` (binary, gitignored).
- Manifest: `production/batch_001/yt_009/bgm_mix_v1/yt_009_visual_repair_manifest.json` (commit text).
- v1 preview `..._repaired.mp4` giữ làm reference, status `SUPERSEDED_BY_V2`.

**QC kỹ thuật v2**:

| Chỉ số | Giá trị | Nhận xét |
|---|---|---|
| Streams | 2 (h264 + aac) | ✅ |
| Duration | 35.000s | ✅ video ≈ audio |
| max_volume | -2.7 dB | ✅ no clipping |
| mean_volume | -22.6 dB | ✅ balanced |
| Source audio leak | none | ✅ audio reuse từ bgm_mixed |
| File size | 22M | ✅ (v1 23M) |

**Iteration notes (báo trung thực)**:
- Lần render đầu (v2a) WOKDADA box thiếu coverage phía phải, "DA" letters còn đọc được → iterate sang v2b với box rộng hơn (440×200 thay vì 280×160) → fully obscured.
- Bài học toạ độ: chuyển hệ tọa độ từ keyframe 300px-scale lên 1080px-full phải dùng scale factor 3.6, không phải 2.7 (scale factor 2.7 chỉ đúng cho 400px-scale).
- Brand có thể xuất hiện ngắn ở 19-24s (frame 5 lúc hand đưa mesh xuống) và 29-32s (frame 7 lúc lifted) nhưng visibility không clear-cut → v2 chỉ cover 24-29.5s là window confirmed brand visible.

**User feedback (2026-05-22)**: **DUYỆT v2** — "Kết quả tổng thể: nguồn phù hợp hơn yt_008, visual demo rõ, affiliate fit tốt, audio QC ổn." v2 là output final yt_009.

**Threshold 75-85%**: Đạt — GUARD 6 Repair Playbook hoạt động đúng cả 2 lớp (cover #2 cho text overlay foreign + blur #1 cho brand engraving), user duyệt cảm nhận.

**Trạng thái kỹ thuật**: chỉ touch ffmpeg render + 1 file manifest JSON. Không động code pipeline. Binary mp4/jpg gitignored, **không commit**.

**Giới hạn còn lại (KHÔNG mở scope)**:
- Brand visibility ngoài 24-29.5s (frame 5 hand đưa xuống, frame 7 lifted) chưa cover — chấp nhận vì visibility marginal, không xử lý thiếu sẽ là over-engineering.
- v2a → v2b iteration thủ công — chưa có auto verify-and-iterate. Phần 16 đã ghi rõ Repair Playbook v0 vẫn operator-executed.
- GUARD 6 Repair v0 vẫn manual coordinates — chưa có OCR/object-detection auto bounding box.

---

### ✅ Phần 19 — /chay yt_010 generalization test (vòng 2 AUTO-SOURCE RETRY thành công): ĐÃ CHỐT (2026-05-22)

**Mục tiêu**: User chọn hướng "yt_010 củng cố generalization" (sau Phần 18 yt_009 user-approved). Đây là vòng đầu tiên `/chay` thực sự trigger AUTO-SOURCE RETRY (vòng 1 reject, vòng 2 accept) — Phần 16 retry policy được kiểm chứng thật.

**Kết quả thật (không tô vẽ)**:

1. **AUTO-DECISION POLICY hoạt động đúng**: `/chay` no-args đọc memory → tự routing MODE 3 auto-source. KHÔNG hỏi user "chọn ngách". Tự chọn lane_4 organizer/space-saving theo rotation logic (yt_005/007 lane_1, yt_006 lane_2, yt_009 lane_3 → yt_010 lane_4 untouched). User chỉ được hỏi 1 lần ở đầu để chọn strategy (yt_010 vs đổi default model vs Con 2) — sau đó toàn bộ pipeline tự chạy.

2. **AUTO-SOURCE RETRY POLICY trigger và hoạt động đúng — vòng đầu áp dụng thật**:

   | Vòng | Candidate | URL | Reject reason | Action |
   |---|---|---|---|---|
   | 1 | `fBPWqAMg4U8` (LORAfied drawer organizer) | youtube.com/shorts/fBPWqAMg4U8 | Multi-step tutorial format: text overlay "STEP 1/3" + closed captions tiếng Anh suốt video + mặt người phụ nữ rõ frame 004 (PII nhóm 3) + Target store + "RoomEssentials" branding + multiple branded products (Crest, Colgate, Coca-Cola chapstick) frame 007 + content là "đi Target mua organizer" KHÔNG match Shopee VN affiliate + GUARD 7 R1 anti-copy violation (tutorial hack là angle gốc uploader) | Reject GUARD 6 nhóm 1+3 + structural. KHÔNG hỏi user. Retry vòng 2 với keyword cải thiện "single gadget clean demo no person no captions studio shot" |
   | 2 | `Il56I8UU2FQ` (Amazon Finds Hub 3 Tier Drawer Organizer) | youtube.com/shorts/Il56I8UU2FQ | Source threshold đạt: 18.5s, 1080×1920 native portrait. GUARD 6 nhóm 1 phát hiện: top banner "CHECK THE LINK..." throughout + HOOK center text "Amazon Organization Find" 0-3.5s + branded products mid-frame 11-17s (Starbucks logo, Simply Mints tins) | Accepted. Trigger Repair Playbook ưu tiên blur priority 1. |

3. **Pipeline zero-touch trên video accepted**:
   - **Script Writer**: `gpt-4o` + extender enabled. **Pass 1 PASS sạch ngay lần đầu** (40/42 từ target timeline_aware, all blocks within cap, hook/CTA consistent, banned phrases zero). Extender không cần chạy. KHÔNG cần widen scene_input như yt_009 (CTA window 3s đúng từ đầu).
   - **Voice Sync zero-touch**: 5/6 fit + 1/6 underfill (b6 CTA 1.44s/3s, BGM lấp). 0 MAJOR, 0 minor, 0 SILENT skip (scene_input không có OFF_TOPIC vì video 18s không cần filler). Khác yt_009 nhưng vẫn zero-touch.
   - **BGM Mix**: max -2.9 dB, mean -21.6 dB, 2 streams, no clipping, no leak.

4. **GUARD 6 Repair Playbook v0 — 3-region blur priority 1**:

   | Detected issue | Repair action | Re-QC |
   |---|---|---|
   | Top banner source channel CTA "CHECK THE LINK IN Description TO ORDER THE PRODUCT" 0-18s | boxblur 1080×280 @ (0,0), throughout | PASS_WITH_REPAIR |
   | HOOK center text "Amazon Organization Find for small spaces" 0-3.5s | boxblur 900×440 @ (90,740), enable t≤3.5s | PASS_WITH_REPAIR |
   | Branded items mid-frame: Starbucks logos × 2 + Simply Mints tins + (background) AA batteries 11-17s | boxblur 900×1000 @ (90,380), enable between(t,11,17) — wide region phủ toàn drawer interior | PASS_WITH_REPAIR |

   **Iteration**: vòng 1 repair region nhỏ (y=680-1160) — t=14s vẫn lộ Starbucks logo top-right corner. Iterate vòng 2 — widen y=380-1380 — fully obscured. Cùng pattern v1→v2 với yt_009.

   **Decision Status overall**: `PASS_WITH_REPAIR`

5. **Đánh giá đúng — KHÔNG tô vẽ**:
   - ✅ **AUTO-SOURCE RETRY POLICY (Phần 16) verified end-to-end thật** — đây là vòng đầu tiên policy retry chạy thật trên candidate fail. yt_009 đã accept luôn vòng 1, không trigger retry; yt_010 phải retry 1 lần và làm việc đúng quy trình.
   - ✅ **GUARD 6 Repair Playbook generalize trên brand pollution liên tục** — yt_009 chỉ có overlay ở HOOK (4s), yt_010 có overlay throughout (18s) + branded product cluster ở 1 đoạn — wide blur region xử lý được.
   - ✅ **Script Writer + Voice Sync robust trên video 18s** — đây là duration ngắn nhất trong tất cả pilot (yt_007 44s, yt_009 35s, yt_010 18s). Block budget v0 + Reconciliation v0 xử lý đúng (timeline_aware target 42, aggregate cap 47).
   - ⚠️ **Visual quality yt_010 lower than yt_009**: Source 720p (vs yt_009 1080p) ban đầu, sau khi switch sang Il56I8UU2FQ là 1080p — nhưng wide blur region cho t=11-17s (5 giây) obscure phần lớn drawer interior. **Demo narrative chỉ readable qua 0-11s (drawer trước → trays installed → paper clips) + audio voice-over**, đoạn 11-17s viewer chỉ nghe voice "Xếp pin, nút, tag gọn gàng" mà không thấy rõ. Đây là **tradeoff GUARD 6 priority over visual storytelling** — không tô vẽ là perfect, chỉ là acceptable.
   - ⚠️ **yt_010 source brand pollution heavier than yt_009**: top banner throughout + multiple branded products. User feedback Phần 18 từng nói "nguồn yt_009 phù hợp hơn yt_008" — yt_010 có thể được đánh giá kém hơn yt_009 ở source quality dimension. **Báo trung thực**: chấp nhận trade-off để đạt lane_4 generalization, không re-search vòng 3.

6. **Output final yt_010**:
   - `production/batch_001/yt_010/bgm_mix_v1/yt_010_voice_blocks_bgm_preview_vi_repaired.mp4` (binary, gitignored)
   - v1 không có version 2 — wide blur đã đủ ngay lần re-apply

7. **5 video clean qua pipeline confirms generalization**:
   - yt_005 (53s, 5 món kitchen multi-product)
   - yt_006 (59s, 5 đồ gia dụng multi-product)
   - yt_007 (44s, kitchen single hero)
   - yt_009 (35s, cleaning single product + OFF_TOPIC scene + GUARD 6 repair v2 USER-APPROVED)
   - yt_010 (18s, organizer single product + heavy brand pollution + AUTO-SOURCE retry success)

**Threshold 75-85%**: Đạt — pipeline generalize trên 5 video diverse, AUTO-SOURCE RETRY POLICY verified end-to-end. Stop optimizing core pipeline.

**Trạng thái kỹ thuật**: chỉ touch text artifacts (scene_input, script, manifests) + docs. KHÔNG động code pipeline. Binary mp4/jpg gitignored.

**Giới hạn còn lại (KHÔNG mở scope)**:
- Default `OPENAI_MODEL=gpt-4o-mini` vẫn chưa đổi — pre-existing debt từ Phần 17, operator vẫn cần `--model gpt-4o` flag.
- GUARD 6 Repair coordinates vẫn manual operator-estimated — chưa auto-detect bounding box.
- yt_010 wide blur t=11-17s obscure visual demo — acceptable tradeoff v0 nhưng visual quality kém yt_009.
- 5 video không có publish thật lên FB/TikTok — publish vẫn ngoài scope `/chay`.

---

### ✅ Phần 20 — Product-First Lane v0 + GUARD 8 Product Match Guard: ĐÃ CHỐT (2026-05-22)

**Mục tiêu**: Thêm 1 lane mới vào `/chay` — **Product-First Lane** — đảo thứ tự thông thường: chốt **sản phẩm TikTok Shop trước**, sau đó tìm video/demo tương đồng. Là **lane song song**, KHÔNG thay thế Video-First (default cho MODE 1/2/3).

**Vì sao cần**: 5 video pipeline qua (yt_005/006/007/009/010) đều theo Video-First (tìm video rồi cố match affiliate). Pattern này hạn chế khi muốn ưu tiên 1 SKU có hoa hồng tốt / hot TikTok Shop — affiliate target không rõ từ đầu, gây risk bait-and-switch (clip A nhưng link B). Product-First đảo lại: lock affiliate target trước, source chỉ là demo phù hợp.

**Phạm vi cài đặt (KHÔNG sửa code pipeline, KHÔNG chạy video mới)**:
- `.claude/skills/chay/SKILL.md` — thêm:
  - Section **LANE TYPES** (3 framing: Video-First / Product-First / Content-Led overlay).
  - **MODE 4** `/chay product-first [<args>]` trong MODE ROUTING.
  - Section **PRODUCT-FIRST LANE v0** với spec Product Card 6 field + PF-STEP 0–6 workflow + AUTO-DECISION POLICY riêng cho Product-First.
  - **GUARD 8 — PRODUCT MATCH GUARD** (riêng, TÁCH KHỎI GUARD 6 + GUARD 7) với 5 trục tương đồng + 3 decision status.
  - Update SELF-REVIEW (+3 dòng cho Product-First), HARD CONSTRAINTS (+4 dòng), REPORT TEMPLATE (+2 bảng Product Card + GUARD 8 Match).
- `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md` — Phần 20 + Mục 7 + Mục 10.
- `docs/00_DIEU_HANH/VFOS_SHORTFORM_FACTORY_BLUEPRINT_V0.md` — note ngắn về khung đa-lane.

**LANE TYPES — 3 framing song song**:

| Lane | Khởi điểm | Mode mặc định |
|---|---|---|
| **Video-First / Content-First** | Tìm video trước, match affiliate sau | MODE 1/2/3 (default) |
| **Product-First** | Chọn sản phẩm TikTok Shop trước, tìm video/demo sau | MODE 4 (mới) |
| **Content-Led affiliate** | Triết lý nền — nội dung kéo view, CTA gắn mềm | Áp dụng cả 2 lane trên |

**PRODUCT CARD — 6 field bắt buộc** (lưu `product_card.json`):
1. `link_tiktok_shop` — URL (bắt buộc)
2. `product_name` — tên chính thức (bắt buộc)
3. `price_vnd` — giá (ghi `"unknown"` nếu không lấy được — KHÔNG bịa)
4. `commission_pct` — % hoa hồng (`"unknown"` nếu không có)
5. `sales_review_signal` — số bán/review/rating (`"unknown"` nếu không có)
6. `why_worthwhile` — lý do đáng làm gồm 5 điểm: (a) vấn đề giải quyết, (b) ai mua, (c) visual demo có dễ hiểu không, (d) phù hợp content-led affiliate không, (e) tiềm năng chuyển đổi

**GUARD 8 — PRODUCT MATCH GUARD (5 trục)**:
1. Công dụng tương đồng
2. Hình dáng / thiết kế tương đồng
3. Cách dùng tương đồng
4. Bối cảnh sử dụng tương đồng
5. Không khác bản chất sản phẩm

**Decision Status (3 mức)**:
- `MATCH_CONFIRMED` (5/5 đạt) → pipeline chạy
- `MATCH_NEEDS_REVIEW` (4/5 + 1 mơ hồ) → user duyệt
- `MISMATCH_REJECT` (≥2 fail HOẶC trục 5 fail) → tự retry tìm clip khác, max 3 vòng

**Anti-bait-and-switch (HARD RULE)**: clip demo và affiliate link trong Card phải trỏ về **cùng 1 sản phẩm thực tế**. KHÔNG cho clip sản phẩm A gắn link sản phẩm B chỉ vì "cùng ngành". Đây vừa là GUARD 8 trục 5 (khác bản chất) vừa là GUARD 7 R2 ở publish layer.

**Nguồn video/demo cho phép Product-First** (chỉ là nguồn tham khảo demo, KHÔNG phải nguồn để gắn affiliate):
- TikTok, Douyin, AliExpress, Temu, YouTube, nguồn demo khác phù hợp.

**Limitation báo trung thực**: agent có thể KHÔNG có quyền lấy data TikTok Shop trực tiếp (giá, hoa hồng, sales). Trong trường hợp đó:
- Báo limitation cho user.
- Đề xuất user dán link TikTok Shop để parse metadata.
- Ghi `"unknown"` cho field không lấy được — **KHÔNG bịa giá / hoa hồng / số bán / review** (vi phạm sẽ là tô vẽ kết quả).

**Triết lý — KHÔNG mở scope vòng này**:
- KHÔNG sửa code pipeline (Script Writer / Voice Sync / BGM).
- KHÔNG chạy video mới, KHÔNG chạy yt_011.
- KHÔNG tìm sản phẩm thật trong vòng này — chỉ định nghĩa khung.
- KHÔNG publish, KHÔNG mở Con số 2, KHÔNG xóa artifact.
- KHÔNG nhét Product Match Guard vào GUARD 6 (Visual Safety) — TÁCH RIÊNG là GUARD 8.
- KHÔNG để Product-First thay thế Video-First — là LANE SONG SONG.

**Threshold 75-85%**: Đạt cho v0 — khung framework + spec rõ, sẵn sàng cho lần chạy thử thật (ngoài scope vòng này). Stop optimizing.

**Giới hạn còn lại (KHÔNG mở scope vòng này)**:
- GUARD 8 vẫn operator-enforced (chấm 5 trục bằng đánh giá người) — chưa có auto product-match scoring bằng image embedding hoặc OCR product name.
- Product Card data scraping (giá / hoa hồng / số bán) chưa có integration TikTok Shop API — operator dán link manual.
- Chưa test thật Product-First trên 1 sản phẩm cụ thể (sẽ là Phần 21 nếu user duyệt). Khung này là design only.

**Trạng thái kỹ thuật**: chỉ touch `.md`, không động code, không cần typecheck/biome.

---

### ✅ Phần 21 — Auto Product Discovery v0 cho Product-First Lane: ĐÃ CHỐT (2026-05-22)

**Mục tiêu**: Mở rộng Product-First Lane (Phần 20) để agent **tự tìm 1 sản phẩm TikTok Shop tiềm năng** khi user gọi `/chay product-first` **không kèm link**. Trước đó MODE 4 yêu cầu user dán link mỗi lần — Discovery v0 cho phép no-link path.

**Vì sao cần**: Phần 20 chỉ định nghĩa khung Product-First; thực tế operator gọi MODE 4 không có sản phẩm cụ thể trong đầu vẫn cần agent tự sourcing được. Bằng cách thêm Discovery Mode + Product Selection Scoring, agent có capability:
- Tự tìm candidate sản phẩm theo lane (CHANNEL/LANE PROFILE).
- Chấm 6 trục → quyết định `PRODUCT_SELECTED` / `PRODUCT_NEEDS_USER_REVIEW` / `PRODUCT_REJECTED`.
- Tự chọn candidate cao điểm nhất khi đủ threshold (KHÔNG hỏi user lựa chọn nhỏ).
- Báo limitation rõ nếu không có quyền lấy TikTok Shop data trực tiếp.

**Phạm vi cài đặt (KHÔNG sửa code pipeline, KHÔNG chạy video mới, KHÔNG tìm sản phẩm thật vòng này)**:
- `.claude/skills/chay/SKILL.md` — thêm:
  - MODE 4 trigger update: `/chay product-first` = auto discovery (no-link); `/chay product-first <link>` = parse link cụ thể.
  - Section **PRODUCT DISCOVERY MODE v0** — behavior + ưu tiên + HARD RULE limitation truy cập.
  - Section **PRODUCT SELECTION SCORING** — 6 trục thang 0–3, threshold ≥13/18 = `PRODUCT_SELECTED`, auto-tie-breaker.
  - PF-STEP 1 update: branch logic user-dán-link vs Discovery (3 vòng retry search).
  - AUTO-DECISION POLICY Product-First update — thêm rule "KHÔNG hỏi chọn sản phẩm nếu có ≥1 PRODUCT_SELECTED".
  - SELF-REVIEW +3 dòng Discovery Mode.
  - HARD CONSTRAINTS +4 dòng Discovery (cấm bịa link/product, cấm bỏ qua scoring, cấm hỏi khi đã có SELECTED).
  - REPORT TEMPLATE: +2 bảng (Product Selection Scoring 6 trục + Product Discovery Retry log).
- `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md` — Phần 21 + cập nhật Mục 7 (hướng 4 hợp nhất discovery) + Mục 10 (commit pointer).
- `docs/00_DIEU_HANH/VFOS_SHORTFORM_FACTORY_BLUEPRINT_V0.md` — note ngắn Discovery Mode enable.

**PRODUCT SELECTION SCORING — 6 trục (mỗi trục 0–3, total max 18)**:

| # | Trục | Strong (3) |
|---|---|---|
| 1 | Demo clarity | Tự nhìn 3s hiểu công dụng |
| 2 | Affiliate potential | Giá vừa + hoa hồng ≥10% + 1k+ bán |
| 3 | Visual appeal | Trước/sau rõ, satisfying motion |
| 4 | Vietnam audience fit | Đồ dùng phổ thông VN |
| 5 | Source/demo availability | Nhiều clip TikTok/Douyin demo |
| 6 | Risk level (cao=an toàn) | Đồ gia dụng phổ thông, không claim |

**Threshold**:
- ≥13/18 AND không trục 0 AND trục 6 ≥ 2 → `PRODUCT_SELECTED`
- 10–12 HOẶC 1 trục = 0 (trừ trục 6) HOẶC trục 6 = 1 → `PRODUCT_NEEDS_USER_REVIEW`
- <10 HOẶC trục 6 = 0 → `PRODUCT_REJECTED`

**Auto-decision khi Discovery**:
- 1 candidate `SELECTED` → auto chọn.
- ≥2 candidates `SELECTED` → auto chọn cao điểm nhất, tie-break theo trục 1 → trục 5.
- 0 candidate `SELECTED` → retry search 3 vòng đổi keyword, hết retry mới trình shortlist.

**Data policy (KHÔNG đổi từ Phần 20 — củng cố thêm)**:
- `link_tiktok_shop` không lấy được đáng tin cậy → KHÔNG tạo Product Card, BÁO LIMITATION + xin user dán link.
- `price_vnd` / `commission_pct` / `sales_review_signal` không lấy được → ghi `"unknown"`, KHÔNG bịa.
- Nếu ≥2 field unknown trong (price/commission/sales) → báo user, hỏi có dán dữ liệu thêm.

**Tích hợp GUARD 8 (giữ nguyên từ Phần 20)**:
- Sau Discovery → Product Card có link + product_name → vào PF-STEP 3 (tìm video/demo tương đồng).
- GUARD 8 Product Match 5 trục vẫn bắt buộc trước khi chạy pipeline.
- `MATCH_CONFIRMED` → pipeline chạy. `MATCH_NEEDS_REVIEW` → user duyệt. `MISMATCH_REJECT` → retry clip, max 3 vòng.

**Triết lý — KHÔNG mở scope vòng này**:
- KHÔNG sửa code pipeline (Script Writer / Voice Sync / BGM).
- KHÔNG chạy video mới, KHÔNG chạy yt_011.
- KHÔNG tìm sản phẩm thật trong vòng này — chỉ khai báo capability.
- KHÔNG publish, KHÔNG mở Con số 2, KHÔNG xóa artifact.
- KHÔNG nhét Product Selection Scoring vào GUARD 6/7/8 — đây là scoring ở PF-STEP 1 (pre-card), khác guard ở STEP 11 (visual safety) hay GUARD 8 (match guard ở PF-STEP 4).
- KHÔNG để Product-First Discovery thay thế Video-First — vẫn là LANE SONG SONG.

**Threshold 75-85%**: Đạt cho v0 — framework + scoring rubric + decision rules đủ rõ. Sẵn sàng cho Phần 22 (chạy thật Product-First Discovery trên 1 sản phẩm). Stop optimizing v0.

**Giới hạn còn lại (KHÔNG mở scope vòng này)**:
- Product Selection Scoring vẫn operator-enforced (agent chấm tay 6 trục) — chưa có auto-ranking bằng TikTok Shop API scrape.
- Discovery Mode chưa test thật end-to-end (sẽ là Phần 22 nếu user duyệt).
- Threshold ≥13/18 là heuristic v0 — có thể điều chỉnh sau khi test thật.
- Nếu agent không có quyền truy cập TikTok Shop trong môi trường runtime hiện tại → Discovery Mode sẽ luôn dừng ở limitation step, xin user dán link. Đây là **expected behavior** cho v0, không phải bug.

**Trạng thái kỹ thuật**: chỉ touch `.md`, không động code, không cần typecheck/biome.

**⚠️ SUPERSEDED bởi Phần 22**: Phần 21 nói về "Product-First Lane" chung (Shopee + TikTok Shop). Phần 22 (2026-05-22) pivot Product-First → **Shopee-First Only v0**, TikTok Shop defer. Đọc Phần 22 để biết schema/trigger/guard mới nhất.

---

### ✅ Phần 22 — Pivot Product-First → Shopee-First Only v0 (TikTok Shop defer): ĐÃ CHỐT (2026-05-22)

> ⚠️ **Điểm 3 & 4 (TikTok Shop defer) SUPERSEDED bởi Phần 76 (2026-07-16)** — Operator ra lệnh trực tiếp mở lại TikTok-Shop-First: ACTIVE R1 (paste-link manual). Shopee-First vẫn ACTIVE song song.

**Quyết định user**:
1. HỦY hướng làm song song Shopee + TikTok Shop.
2. Chỉ làm **1 hướng trước: Shopee**.
3. TikTok Shop **defer** — chưa thiết kế sâu, chưa tích hợp.
4. Luồng ưu tiên: **Video → Facebook Reels → Shopee Affiliate**.

**Mục tiêu**: Pivot toàn bộ wording "Product-First Lane" (Phần 20+21) thành **Shopee-First Lane v0** — platform cụ thể, không chung chung. TikTok Shop ghi rõ là future/deferred, KHÔNG active lane song song.

**Vì sao pivot**: 
- Tránh dàn trải scope (2 platform cùng lúc → khó verify hiệu quả).
- Shopee có data accessibility tốt hơn TikTok Shop (HTML render, có Affiliate dashboard, scraping/lookup tin cậy hơn).
- Mục tiêu thương mại VFOS North Star (100-200M VND/tháng) cần 1 luồng hoàn chỉnh trước, không 2 luồng dở dang.
- Facebook Reels là target platform ưu tiên user — Shopee phối tốt nhất.

**Phạm vi cài đặt (KHÔNG sửa code pipeline, KHÔNG chạy video mới, KHÔNG tìm sản phẩm thật, KHÔNG code scraper)**:

- `.claude/skills/chay/SKILL.md` — pivot toàn diện:
  - Description frontmatter: "Facebook Reels gắn Shopee Affiliate (TikTok Shop future lane defer)".
  - MÔ TẢ section: "Content-led affiliate Shopee VN", "Platform target Facebook Reels".
  - **LANE TYPES table**: thêm hàng `TikTok-Shop-First` với trạng thái **FUTURE / DEFER** rõ ràng; row `Product-First` đổi thành `Shopee-First` ACTIVE.
  - **MODE 4** rewrite: triggers Shopee-First (`/chay shopee-first`, `/chay product-first shopee`, `/chay facebook shopee`, `/chay làm video Facebook Reels gắn Shopee`). Trigger chung `/chay product-first` → route mặc định Shopee-First.
  - **SHOPEE-FIRST LANE v0** section (thay PRODUCT-FIRST LANE v0).
  - **Shopee Product Card 10 field** (tăng từ 6): `shopee_product_url`, `product_name`, `price_vnd`, `commission_pct`, `sales_count`, `rating`, `review_count`, `shop_name`, `why_worthwhile`, `data_confidence`. Field `data_confidence` mới (high/medium/low) phản ánh trung thực mức độ verify data.
  - **SHOPEE PRODUCT DISCOVERY MODE v0** (thay PRODUCT DISCOVERY MODE v0).
  - **SHOPEE PRODUCT SELECTION SCORING** — 6 trục giữ nguyên, wording cập nhật (trục 2 "Shopee affiliate potential", trục 3 "Visual appeal cho Facebook Reels", trục 4 "Vietnam audience fit (Facebook Reels VN)").
  - **WORKFLOW SHOPEE-FIRST** PF-STEP 1–6 (thay WORKFLOW PRODUCT-FIRST). `affiliate_target` field trong scene_input.json thêm `"platform": "shopee"` + `"shop_name"`.
  - **AUTO-DECISION POLICY trong Shopee-First** — thêm rule **KHÔNG hỏi "Shopee hay TikTok Shop"**.
  - **GUARD 8 — SHOPEE PRODUCT MATCH GUARD** (thay PRODUCT MATCH GUARD). 5 trục giữ nguyên, wording Shopee.
  - **SELF-REVIEW** — đổi entries Product-First → Shopee-First, thêm check `data_confidence`, thêm check "không hỏi Shopee/TikTok Shop platform".
  - **HARD CONSTRAINTS** — thêm 2 rule mới: "× Hỏi user Shopee hay TikTok Shop" + "× Triển khai tool/scraper TikTok Shop trong scope hiện tại".
  - **REPORT TEMPLATE** — bảng Shopee Product Card 10 field, bảng GUARD 8 Shopee Match.
- `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md` — Phần 22 + cập nhật Mục 7 (route 4 đổi từ TikTok Shop test → Shopee test) + Mục 10 (commit pointer).
- `docs/00_DIEU_HANH/VFOS_SHORTFORM_FACTORY_BLUEPRINT_V0.md` — note Phần 22 pivot, mark TikTok Shop là future lane.

**LANE TYPES sau Phần 22**:

| Lane | Platform affiliate | Platform publish | Trạng thái |
|---|---|---|---|
| Video-First (default MODE 1/2/3) | Shopee VN | Facebook Reels | **ACTIVE** |
| Shopee-First (MODE 4) | Shopee VN | Facebook Reels | **ACTIVE (lane chính hiện tại)** |
| Content-Led affiliate (overlay triết lý) | — | — | **ACTIVE (triết lý nền)** |
| TikTok-Shop-First | TikTok Shop VN | TikTok Việt Nam | **FUTURE / DEFER** |

**Shopee Product Card 10 field**:

| # | Field | Mô tả |
|---|---|---|
| 1 | `shopee_product_url` | URL Shopee VN (bắt buộc) |
| 2 | `product_name` | Tên sản phẩm (bắt buộc) |
| 3 | `price_vnd` | Giá VNĐ (unknown nếu không lấy được) |
| 4 | `commission_pct` | % hoa hồng Shopee Affiliate (unknown nếu không có) |
| 5 | `sales_count` | Số đã bán (unknown nếu không có) |
| 6 | `rating` | Rating trung bình (unknown nếu không có) |
| 7 | `review_count` | Số review (unknown nếu không có) |
| 8 | `shop_name` | Tên shop (unknown nếu không có) |
| 9 | `why_worthwhile` | Lý do đáng làm 5 điểm (bắt buộc, agent tự viết) |
| 10 | `data_confidence` | high / medium / low (bắt buộc, phản ánh trung thực) |

**Triggers /chay sau Phần 22**:
- `/chay shopee-first` (primary trigger)
- `/chay product-first shopee` (đồng nghĩa)
- `/chay facebook shopee` (đồng nghĩa, nhấn FB Reels)
- `/chay làm video Facebook Reels gắn Shopee`
- `/chay product-first` (route mặc định → Shopee-First trong giai đoạn này)
- `/chay tìm sản phẩm Shopee trước`

**TikTok Shop defer — KHÔNG triển khai trong scope hiện tại**:
- Không thiết kế sâu TikTok Shop Product Card.
- Không build TikTok Shop scraper/API integration.
- Không cập nhật trigger TikTok Shop là active.
- Không hỏi user "Shopee hay TikTok Shop" — mặc định Shopee.
- Sẽ revisit khi user mở lại scope rõ ràng (eg Phần 25+).

**GUARD policy không đổi**:
- GUARD 6 Visual Safety vẫn là 3 nhóm gốc (logo/brand/watermark, QR/mã vạch, biển số/PII). KHÔNG nhét Shopee Match Guard vào GUARD 6.
- GUARD 7 Affiliate & Content Compliance không đổi.
- GUARD 8 rename thành "SHOPEE PRODUCT MATCH GUARD" (TikTok-Shop-First defer → không có GUARD 8 variant TikTok Shop trong giai đoạn này).

**Triết lý — KHÔNG mở scope vòng này**:
- KHÔNG sửa code pipeline (Script Writer / Voice Sync / BGM).
- KHÔNG chạy video mới, KHÔNG chạy yt_011.
- KHÔNG tìm sản phẩm thật, KHÔNG code scraper Shopee.
- KHÔNG triển khai TikTok Shop bất cứ thứ gì.
- KHÔNG publish, KHÔNG mở Con số 2.
- KHÔNG xóa artifact yt_005..yt_010.

**Threshold 75-85%**: Đạt cho v0 — wording pivot toàn diện, Shopee schema rõ, TikTok Shop ghi defer rõ. Sẵn sàng cho Phần 23 (test Shopee-First Discovery trên 1 sản phẩm Shopee thật). Stop optimizing v0.

**Giới hạn còn lại (KHÔNG mở scope vòng này)**:
- Shopee data accessibility trong runtime hiện tại vẫn chưa verify thật (cần test WebFetch Shopee.vn xem render HTML như nào). Discovery có thể vẫn dừng ở limitation step.
- 4 video đã chạy (yt_005..yt_010) đều dùng wording "Shopee VN" trong scene_input — không cần migrate, đã consistent.
- Phần 20/21 wording "Product-First" trong các Phần đã commit không sửa retroactively — chỉ note SUPERSEDED ở header Phần 21.

**Trạng thái kỹ thuật**: chỉ touch `.md`, không động code, không cần typecheck/biome.

---

### ✅ Phần 23 — Shopee-First Post-Run Hardening v0 (agent-ready boundaries): ĐÃ CHỐT (2026-05-24)

**Bối cảnh**: Sau khi yt_011 chạy end-to-end thành công Shopee-First (commit `791564f`), lộ ra 2 gap về artifact:
1. `shopee_product_card.json` ban đầu **không persist trên disk** — chỉ tồn tại trong chat. Phải fix sau ở commit `791564f` (gap-fix round).
2. `script_ai_v1_extended.json` còn `quality_status: "fail"` **stale** sau khi operator trim 2 block (b2, b4) — không có metadata mô tả việc trim, gây hiểu nhầm script final vẫn là FAIL chưa xử lý.

**Mục tiêu Phần 23**: biến 2 bài học đó thành rule cố định trong SKILL, thêm publish-plan metadata layer, và đặt boundary để sau tách 4 sub-agent dễ.

**Phạm vi cài đặt (KHÔNG sửa code pipeline, KHÔNG chạy video mới, KHÔNG publish, KHÔNG sửa artifact yt_011)**:

- `.claude/skills/chay/SKILL.md` — 4 rule mới + 1 section boundary:
  - **Rule 1 — Shopee Product Card persist HARD GATE**: section `SHOPEE PRODUCT CARD` viết lại. Schema mở rộng từ "10 field" lên **24 field** (thêm audit trail: `video_id`, `lane`, `phase_ref`, `created_at`, `short_url_original`, `canonical_url`, `shopid`, `itemid`, `product_name_short`, `estimated_commission_vnd`, `data_source_notes`, `selection_scoring`, `decision`, `decision_note`). HARD GATE: file PHẢI tồn tại trên disk trước PF-STEP 3, có `data_source_notes` audit trail, `selection_scoring` bắt buộc cả khi user dán link sẵn. Verify persist checklist 6 mục.
  - **Rule 2 — Shopee short link support**: section mới `SHOPEE SHORT LINK SUPPORT v0`. Short link `s.shopee.vn/<code>` là input HỢP LỆ. Pattern resolve: `curl -sILk` HTTP-level redirect (yt_011 reference: `s.shopee.vn/17RASU88W` → `shopee.vn/opaanlp/1820797160/55110800126`). Business fields lấy từ user paste vì SPA + internal API v4 = 403 anti-bot. KHÔNG fail vì user chỉ có short link.
  - **Rule 3 — Operator trim policy**: insert vào STEP 6 (Script Writer) + update GUARD 1. Bắt buộc metadata block `operator_trim` với 9 field (`operator_trim_applied`, `original_quality_status`, `original_word_count`, `trimmed_blocks`, `post_trim_word_count`, `post_trim_reason`, `post_trim_quality_status`, `validator_rerun_status`, `final_used_for_voice_sync`). KHÔNG bịa `PASS` khi không có validator độc lập — dùng `accepted_after_operator_trim` + evidence thật. Operator trim CHỈ áp dụng cho vi phạm rõ ràng (over-claim, banned absolute, block over budget nhỏ), KHÔNG dùng "lách" GUARD 1.
  - **Rule 4 — Facebook Reels + Shopee Publish Plan metadata**: insert STEP 12b vào WORKFLOW + section mới `FACEBOOK REELS + SHOPEE PUBLISH PLAN v0`. Persist `facebook_reels_publish_plan.json` với 15 field (`platform=facebook_reels`, `affiliate_platform=shopee`, `product_card_path`, `final_video_path`, `caption_draft`, `cta_text`, `shopee_affiliate_url`, `publish_status=not_published` HARD, `needs_user_review=true` HARD, `publish_blockers[]`, etc). KHÔNG auto-publish — luôn chuẩn bị metadata để operator manual.
  - **AGENT-READY RESPONSIBILITY BOUNDARIES**: section mới định nghĩa 4 sub-agent tương lai + boundary rules. KHÔNG triển khai multi-agent code trong vòng này — chỉ là kỷ luật viết SKILL.
- `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md` — Phần 23 (block này) + cập nhật Mục 7 + Mục 10.
- `docs/00_DIEU_HANH/VFOS_SHORTFORM_FACTORY_BLUEPRINT_V0.md` — note Phần 23 hardening + agent-ready boundary reference.

**4 sub-agent tương lai (chỉ định nghĩa boundary, KHÔNG implement vòng này)**:

| Sub-agent | Responsibility | Output artifact |
|---|---|---|
| **Shopee Product Agent** | Resolve link, fetch metadata, Selection Scoring, persist Card | `shopee_product_card.json` |
| **Demo Match Agent** | Tìm video/demo, GUARD 8 match scoring, retry candidate | match result + chosen video URL + GUARD 8 table |
| **Script QC Agent** | Script Writer + validator + OPERATOR TRIM + GUARD 1 + GUARD 7 R1/R3/R5 script-layer | `script_ai_v1_extended.json` (+ optional `operator_trim` block) |
| **Facebook Publish Plan Agent** | Draft caption + CTA, persist publish plan, **KHÔNG gọi Graph API** | `facebook_reels_publish_plan.json` |

**Boundary rules HARD**:
- Mỗi sub-agent CHỈ đọc/ghi artifact của mình + đọc artifact upstream. KHÔNG cross-write.
- State sharing qua file JSON (`production/batch_001/<video_id>/`), không qua biến process / message bus toàn cục.
- KHÔNG overlap (eg Demo Match Agent KHÔNG được sửa `shopee_product_card.json`).
- GUARD 7 R5 chia 2: script-layer thuộc Script QC Agent, caption-layer thuộc Facebook Publish Plan Agent.

**Triết lý — KHÔNG mở scope vòng này**:
- KHÔNG sửa code pipeline (Script Writer / Voice Sync / BGM).
- KHÔNG chạy video mới, KHÔNG chạy yt_012.
- KHÔNG tìm sản phẩm Shopee mới, KHÔNG tìm video/demo mới.
- KHÔNG publish thật lên Facebook Reels.
- KHÔNG triển khai code 4 sub-agent — chỉ ghi boundary trong SKILL/docs.
- KHÔNG sửa artifact yt_011 đã commit.
- KHÔNG đụng `.env` / API key / token Facebook.
- KHÔNG `git clean` / `reset` / `stash`.
- KHÔNG mở scope TikTok Shop (vẫn defer từ Phần 22).

**Threshold 75-85%**: Đạt cho v0 — 4 rule hardening rõ ràng, boundary 4 sub-agent đủ chi tiết để sau tách dễ, không phá scope. Sẵn sàng cho Phần 24 (user chọn strategy: Con 2 / yt_012 với hardening mới / split sub-agent thật / etc).

**Giới hạn còn lại (KHÔNG mở scope vòng này)**:
- Chưa có validator độc lập cho script (vẫn rely vào Script Writer self-report + Voice Sync downstream signal).
- Chưa test rule mới end-to-end trên yt_012 — chỉ docs hardening.
- Publish Plan caption draft template chưa định nghĩa pattern cụ thể cho từng ngách (vẫn ad-hoc).
- 4 sub-agent boundaries là spec, chưa có agent file `.claude/agents/*.md` cho từng cái.

**Trạng thái kỹ thuật**: chỉ touch `.md`, không động code, không cần typecheck/biome.

---

### ✅ Round 2A — Facebook Reels Publish Plan Audit v0: ĐÃ CHỐT (2026-05-24)

**Bối cảnh**: Sau Phần 23 hardening đã chuẩn hoá rule tạo `facebook_reels_publish_plan.json`, vòng này audit kỹ phần Facebook Page API integration (commit `6cc2459`) để đảm bảo `/chay` không vô tình publish thật, đồng thời chuẩn hoá schema Publish Plan thêm 1 lớp.

**Phạm vi (read-only audit + minor docs/skill standardization — KHÔNG sửa code Facebook, KHÔNG publish, KHÔNG động token)**:

**Facebook package audit (commit `6cc2459`)**:

| Item | Trạng thái | Risk |
|---|---|---|
| `src/meta-client.ts` (GET-only Graph client, token never logged) | ✅ Safe | — |
| `src/test-page.ts` (`testPageConnection` — GET `/{page_id}`) | ✅ Safe | Read-only |
| `src/post-page.ts` (`publishTextPost` — POST `/{page_id}/feed`) | ⚠️ **Real publish surface** | Text post sẽ thật sự đăng — chưa có `META_MODE=mock` gate |
| `scripts/test-connection.ts` (`pnpm facebook:test`) | ✅ Safe | Read-only |
| `scripts/test-post.ts` (`pnpm facebook:test-post`) | ⚠️ **Risk** | KHÔNG có dry-run / confirm — chạy là đăng thật |
| `scripts/get-page-token.ts` (`pnpm facebook:get-page-token`) | ✅ Safe | Read-only User Token → Page Token |
| `.env.example` | ✅ Safe | Template, `FACEBOOK_PAGE_ID=` + `FACEBOOK_PAGE_ACCESS_TOKEN=` rỗng, có warning "Never commit real tokens" |
| Reels upload code (`POST /{page_id}/videos`) | ✅ N/A | **CHƯA tồn tại** — Reels upload là future scope |
| `.gitignore` bảo vệ `.env` | ✅ Safe | `.env` + `.env.local` + `.env.*.local` đều ignored |

**Risk gap cần fix sau (Round 2A KHÔNG sửa code — chuyển sang Phần 24 / future hardening)**:
- `scripts/test-post.ts` thiếu dry-run flag.
- `publishTextPost` không có `META_MODE=mock` gate (env var `META_MODE=mock` đã có ở `.env.example` nhưng package facebook chưa đọc).
- Khuyến nghị: thêm gate đầu `publishTextPost` — `if (process.env.META_MODE === "mock") return mock`. Code khuyến nghị có ghi trong SKILL.md (KHÔNG triển khai vòng này).

**Schema chuẩn hoá Publish Plan (Round 2A)**:
- Thêm field `lane="shopee_first"` (rõ lane scope).
- Rename `hashtags_suggested` → `hashtags` (chuẩn hơn).
- `publish_blockers` HARD: luôn ≥1 phần tử (tối thiểu `"user_review_required"`); rỗng `[]` KHÔNG cho phép ở artifact `/chay` tạo ra (vì `needs_user_review=true` luôn imply blocker này).
- `phase_ref` chấp nhận `"Round 2A Publish Plan Audit v0"` ngoài các phần cũ.
- Schema giờ có 16 field (từ 15) — thêm `lane`.
- Caption + CTA example cho yt_011 fruit slicer.

**HARD RULE Round 2A bổ sung vào HARD CONSTRAINTS**:
- `/chay` TUYỆT ĐỐI KHÔNG gọi `pnpm facebook:test-post`.
- `/chay` TUYỆT ĐỐI KHÔNG gọi `publishTextPost()` hoặc bất kỳ endpoint `POST /{page_id}/feed` / `/{page_id}/videos`.
- `/chay` TUYỆT ĐỐI KHÔNG triển khai Reels upload code trong scope hiện tại.

**Phạm vi cài đặt (KHÔNG sửa code Facebook, KHÔNG publish thật, KHÔNG động `.env`/token)**:

- `.claude/skills/chay/SKILL.md` — section `FACEBOOK REELS + SHOPEE PUBLISH PLAN v0` mở rộng:
  - Schema thêm `lane` + rename `hashtags_suggested` → `hashtags`.
  - Mới: subsection `Facebook package surface + safety` liệt kê 7 file + risk classification.
  - Mới: default `publish_blockers` policy.
  - Mới: example caption draft cho yt_011.
  - HARD CONSTRAINTS thêm 3 rule mới (× facebook:test-post / × publishTextPost / × Reels upload code).
  - SELF-REVIEW thêm 3 entries (blockers default / field rename / không gọi publish API).
  - REPORT TEMPLATE bảng Publish Plan thêm row `lane` + `hashtags`.
- `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md` — Round 2A block (block này) + cập nhật header date + Mục 10 commit pointer.

**Triết lý — KHÔNG mở scope vòng này**:
- KHÔNG sửa code `packages/facebook/`.
- KHÔNG thêm `META_MODE=mock` gate vào `publishTextPost` (đề xuất, chưa triển khai).
- KHÔNG chạy `pnpm facebook:test` ngay cả khi safe — không cần thiết cho audit doc.
- KHÔNG chạy `pnpm facebook:test-post` (risk — chưa có dry-run).
- KHÔNG động `.env` / token.
- KHÔNG triển khai Reels upload code.
- KHÔNG chạy video mới / yt_012.
- KHÔNG publish thật.
- KHÔNG mở Con số 2.
- KHÔNG `git clean` / `reset` / `stash`.

**Threshold 75-85%**: Đạt cho audit v0 — facebook package risk surface rõ ràng, schema Publish Plan chuẩn hoá xong, HARD CONSTRAINTS bảo vệ `/chay` không gọi publish nhầm. Risk gap (`test-post.ts` không dry-run) đã document, chuyển vào Phần 24 nếu user duyệt fix.

**Giới hạn còn lại (chuyển sang Phần 24+ nếu user duyệt)**:
- `META_MODE=mock` gate chưa triển khai trong `publishTextPost`.
- `scripts/test-post.ts` chưa có `--dry-run` / `--confirm` flag.
- Reels upload code chưa thiết kế (không cần thiết cho Round 2A — phải user duyệt mở scope mới riêng).
- Caption draft template chỉ có 1 example yt_011 — chưa có pattern cho từng ngách (organizer, cleaning, gadget v.v.).

**Trạng thái kỹ thuật**: chỉ touch `.md`, không động code, không cần typecheck/biome.

---

### ✅ Round 2B — Facebook Publish Safety Gate v0: ĐÃ CHỐT (2026-05-24)

**Bối cảnh**: Round 2A audit đã document risk gap (publish_text_post không có META_MODE gate, test-post.ts không có dry-run). Round 2B fix gap đó bằng code thật, vẫn không publish thật, không động token.

**Phạm vi (SỬA CODE `packages/facebook/`, không publish thật, không động token thật)**:

**File đã sửa/tạo**:
- `packages/facebook/src/post-page.ts` — thêm `resolvePublishMode()` + `publishTextPost()` HARD GATE đầu function. Khi `META_MODE` ≠ `"live"` (default), return mock result `{ success: true, postId: "mock_dry_run_<ts>", mode: "mock" }` **KHÔNG gọi Graph API**. Thêm field `mode: "mock" | "live"` vào `TextPostResult`. Tất cả return path live đều set `mode: "live"`.
- `packages/facebook/src/index.ts` — re-export `resolvePublishMode` + `PublishMode` type.
- `packages/facebook/scripts/test-post.ts` — rewrite. CLI flag parse (`--dry-run`, `--confirm-publish`). Effective mode = `live` CHỈ khi ALL: `META_MODE=live` + `--confirm-publish` + non-empty page id + non-empty token. Thiếu bất kỳ điều kiện → fallback mock + log lý do. Banner MOCK/LIVE rõ ràng. Override `process.env.META_MODE="mock"` trước khi gọi `publishTextPost` khi effective mock (double guard).
- `packages/facebook/README.md` — **mới tạo**. Safe usage guide, surface table, 4 điều kiện live publish, integration với `/chay`, future scope.
- `.env.example` — bổ sung doc cho `META_MODE` (mock=default, live=requires manual review). Note Facebook Page section trỏ sang README.

**Test đã chạy (không publish thật)**:
- `pnpm typecheck` (trong `packages/facebook/`) → ✅ pass, no TS errors.
- `META_MODE=mock pnpm facebook:test-post` → ✅ effective mode = MOCK, mock postId returned, NO API call.
- `META_MODE=live pnpm facebook:test-post` (không `--confirm-publish`) → ✅ "LIVE publish was requested but blocked by safety gate. Missing CLI flag: --confirm-publish. Falling back to MOCK MODE." Mock postId returned, NO API call.
- KHÔNG chạy `META_MODE=live pnpm facebook:test-post -- --confirm-publish` (sẽ publish thật — out of scope vòng này).
- KHÔNG chạy `pnpm facebook:test` (read-only API nhưng vẫn là Graph API call thật — không cần thiết cho audit).

**Safety properties đảm bảo**:
1. ✅ Default mode mặc định luôn là MOCK kể cả khi `META_MODE` env var unset hoặc empty.
2. ✅ Code path live publish CHỈ active khi 4 điều kiện ALL true.
3. ✅ Token KHÔNG bao giờ log full — chỉ mask 8 đầu + 4 cuối qua `maskToken()`.
4. ✅ `publishTextPost()` exported nhưng không guarded ở caller — bây giờ guarded ở chính function, nên bất kỳ code tương lai gọi đều an toàn mặc định.
5. ✅ TypeScript types ép caller phải handle `result.mode` để biết mock vs live.

**Tài liệu cập nhật**:
- `.claude/skills/chay/SKILL.md` — cập nhật bảng surface table (✅ HARD GATE thay vì ⚠️ RISK), rewrite "Risk gap" thành "Risk gap đã fix", thêm 2 HARD CONSTRAINT mới (× đổi META_MODE=live không có operator review, × pass --confirm-publish không có user duyệt thủ công).
- `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md` — Round 2B block (block này) + cập nhật header date + Mục 10 commit pointer.

**Triết lý — KHÔNG mở scope vòng này**:
- KHÔNG publish thật.
- KHÔNG upload video.
- KHÔNG dùng `META_MODE=live` để chạy bất kỳ test nào.
- KHÔNG sửa `.env` chứa secret (chỉ `.env.example` template).
- KHÔNG commit token thật.
- KHÔNG triển khai Reels upload code (vẫn là future scope, cần dedicated safety gate `META_REELS_MODE` riêng nếu thiết kế).
- KHÔNG chạy video mới / yt_012.
- KHÔNG mở Con số 2.
- KHÔNG sửa Script Writer / Voice Sync / BGM code.
- KHÔNG `git clean` / `reset` / `stash`.

**Threshold 75-85%**: Đạt cho safety gate v0 — `publishTextPost` và `test-post.ts` cả 2 đều có HARD GATE, dry-run mặc định, không publish nhầm có thể xảy ra với invocation thông thường. Token never logged. README rõ ràng cho operator. Sẵn sàng cho Phần 24 nếu user muốn thiết kế Reels upload.

**Giới hạn còn lại**:
- Live publish path chưa được test end-to-end (vì cần `META_MODE=live` + `--confirm-publish` + token thật + chấp nhận đăng thật). Đây là design intent, không phải gap.
- Reels upload code (`POST /{page_id}/videos`) chưa thiết kế — sẽ cần dedicated `META_REELS_MODE=mock` gate riêng khi triển khai.
- Caption / hashtag template chỉ có 1 example yt_011 (Round 2A); chưa có pattern cho từng ngách.
- Test post message cố định trong source code (`TEST_MESSAGE` const). Operator muốn custom message phải sửa source — chấp nhận cho v0 vì đây là test script, không phải production publish flow.

**Trạng thái kỹ thuật**: SỬA code `packages/facebook/` (2 file source + 1 script + 1 README mới + .env.example), pnpm typecheck pass, 2 dry-run test pass + 1 negative-gate test pass.

---

### ✅ Round 2C — Shopee Session Fetcher v0 (browser session): ĐÃ CHỐT (2026-05-24)

**Bối cảnh**: User chưa có Shopee API public. Shopee SPA + internal v4 API block anonymous request (403 anti-bot). Cách realistic v0 đã chốt 2026-05-22: dùng login session thật của user trong browser headless qua Playwright. Tooling này sẽ là input cho Discovery Mode (Shopee Product Agent boundary).

**Phạm vi cài đặt (TẠO code `packages/shopee/`, KHÔNG auto-install Playwright, KHÔNG auto-run script, KHÔNG fetch sản phẩm thật vòng này)**:

**File đã tạo**:
- `.gitignore` — thêm `.secrets/` + `*.storage_state.json` + `*.session.json` + `*.cookies.json` (HARD security: block cookie/session commit ngay từ git layer).
- `packages/shopee/package.json` — `@vfos/shopee@0.1.0`, devDeps `tsx`/`typescript`/`@types/node`, peerDep optional `playwright`.
- `packages/shopee/tsconfig.json` — extend `tsconfig.base.json` chuẩn workspace.
- `packages/shopee/src/types.ts` — `ShopeeProductCandidate` (13 field, mỗi field optional → `"unknown"`) + `ShopeeFetchManifest` (timestamp, phase_ref, candidates, required_user_action flag).
- `packages/shopee/src/extract.ts` — selector helpers `OFFER_DASHBOARD_SELECTORS` (placeholders cho Shopee Affiliate offer page, sẽ cần recalibrate trong lần chạy đầu), `parsePriceVnd`, `parseCommissionPct`, `estimateCommissionVnd`, `computeDataConfidence`, `emptyCandidate`.
- `packages/shopee/src/index.ts` — public re-exports.
- `packages/shopee/scripts/login-session.ts` — `pnpm shopee:login`. Lazy-import Playwright (clear error nếu chưa cài). Open HEADED Chromium. User login manual + handle captcha/OTP. Save `storageState` vào `.secrets/shopee_storage_state.json` (gitignored). KHÔNG inspect/log cookie value (chỉ gọi Playwright `context.storageState({ path })` — Playwright tự write).
- `packages/shopee/scripts/fetch-offers.ts` — `pnpm shopee:fetch`. Load storageState, headless Chromium. Navigate `https://affiliate.shopee.vn/offer/shopee_offer`. Detect login redirect (= session expired → `required_user_action: true` trong manifest). Wait selector, extract ≤3 cards. Output `production/_commerce/shopee_product_candidates.json` — ZERO cookie/token, chỉ public product data. Selector mismatch → save HTML snapshot `.secrets/last_fetch_dom.html` (gitignored) cho operator inspect.
- `packages/shopee/README.md` — safe usage guide, surface table, security model, calibration flow, integration với `/chay`, future scope.
- `package.json` (root) — thêm pnpm script `shopee:login` + `shopee:fetch`.
- `.claude/skills/chay/SKILL.md` — section mới "SHOPEE SESSION FETCHER v0" trong Shopee-First Lane mô tả tooling + flow operator-driven + HARD RULE "/chay KHÔNG tự chạy". HARD CONSTRAINTS thêm 4 rule mới (× tự chạy login / × tự chạy fetch / × paste raw cookie / × commit thứ trong `.secrets/`).
- `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md` — Round 2C block (block này) + header date + Mục 10.

**Security verification**:
- ✅ `.gitignore` test: `git check-ignore -v .secrets/test.json .secrets/shopee_storage_state.json shopee.storage_state.json` → tất cả 3 path đều ignored (output xác nhận rule `.gitignore:16:.secrets/` + `.gitignore:17:*.storage_state.json`).
- ✅ NO Playwright auto-install — user phải chạy `pnpm add -D playwright -F @vfos/shopee` + `pnpm exec playwright install chromium` thủ công.
- ✅ NO script auto-run — login/fetch chỉ chạy khi operator chủ động gọi pnpm script.
- ✅ Script lazy-import Playwright trong try/catch — fail fast với error message rõ ràng nếu chưa cài, KHÔNG crash hệ thống.
- ✅ Output JSON schema KHÔNG có cookie/token field — chỉ public product data + manifest metadata.
- ✅ Script chỉ log counts + URLs + boolean — KHÔNG log cookie value, KHÔNG log request header.
- ✅ Session expired detection → `required_user_action: true` + báo user re-run login. KHÔNG bypass.

**Test đã chạy (v0 blueprint round)**:
- `git check-ignore -v .secrets/...` → ✅ pass, 3 path đều ignored.
- KHÔNG chạy `pnpm typecheck` cho `@vfos/shopee` vòng này (typecheck cần Playwright types installed; types resolve lazy nên có thể có warning). Sẽ verify khi user install Playwright.
- KHÔNG chạy `pnpm shopee:login` (cần user duyệt + login thủ công).
- KHÔNG chạy `pnpm shopee:fetch` (cần `.secrets/shopee_storage_state.json` từ login + Playwright installed).

**Decision flow Discovery Mode sau Round 2C**:

```
/chay shopee-first (no link, Discovery Mode)
   ↓
Đọc production/_commerce/shopee_product_candidates.json
   ↓ artifact tồn tại?
   ├─ YES → chấm Selection Scoring 6 trục → lập Shopee Product Card
   └─ NO  → báo limitation:
            "Chưa có Shopee candidates. Vui lòng chạy:
             1) pnpm shopee:login (1 lần)
             2) pnpm shopee:fetch
            rồi gọi lại /chay shopee-first."
```

**Triết lý — KHÔNG mở scope vòng này**:
- KHÔNG auto-install Playwright (user duyệt thủ công).
- KHÔNG chạy login/fetch script.
- KHÔNG fetch sản phẩm Shopee thật.
- KHÔNG paste cookie / SPC_EC / SPC_ST / csrftoken vào chat / `.env` / repo.
- KHÔNG bypass captcha / OTP / 2FA — user handle manual.
- KHÔNG sửa code Script Writer / Voice Sync / BGM.
- KHÔNG sửa code Facebook (đã hardened ở Round 2B).
- KHÔNG chạy video mới / yt_012.
- KHÔNG publish Facebook.
- KHÔNG mở TikTok Shop.
- KHÔNG `git clean` / `reset` / `stash`.

**Threshold 75-85%**: Đạt cho session-fetcher v0 — blueprint + scaffold đầy đủ, security HARD ngay từ `.gitignore`, script có lazy-import + fail-fast guard, selectors là placeholders chấp nhận recalibrate lần chạy đầu. Risk gap "không có Shopee API" đã có path workaround end-to-end. Sẵn sàng cho Round 2D (user duyệt install Playwright + test login + fetch + recalibrate selectors).

**Giới hạn còn lại (chuyển Round 2D / Phần 24 nếu user duyệt)**:
- `OFFER_DASHBOARD_SELECTORS` là placeholders. Chưa verify against real DOM. Lần chạy đầu chắc chắn cần recalibrate.
- Search by keyword chưa implement (chỉ đọc default offer dashboard). Discovery Mode cần search để tự tìm sản phẩm theo lane.
- Affiliate link wrapping (UTM source) chưa tự động — operator vẫn copy thủ công từ dashboard.
- Session refresh tự động chưa thiết kế — hiện chỉ detect + báo expired.
- Test typecheck cho `@vfos/shopee` cần Playwright types installed; chưa run vòng này.

**Trạng thái kỹ thuật**: TẠO `packages/shopee/` (7 file: package.json, tsconfig, 3 src, 2 scripts, README) + update `.gitignore` + root `package.json` (thêm 2 pnpm script) + SKILL.md + status doc. KHÔNG install Playwright. KHÔNG run script. KHÔNG fetch thật.

---

### ✅ Round 3A — Shopee Cookie Fetcher (HTTP, no Playwright) + product-item endpoint discovery: ĐÃ CHỐT (2026-05-24)

**Mục tiêu**: thay thế approach Playwright (bị Shopee block) bằng HTTP fetch với cookie từ DevTools. Khám phá endpoint product-item-level thật (không phải campaign-level) qua HAR analysis.

**Đã làm**:
- `packages/shopee/scripts/analyze-har.ts` — HAR analyzer phân loại endpoint (`product_discovery_endpoint`, `dashboard_product_rank_endpoint`, `user_profile_endpoint`, `telemetry_endpoint`, …), redact secret markers + mask numeric IDs / hex tokens / UUIDs.
- `packages/shopee/scripts/probe-product-offer.ts` — HTTP probe confirm `/offer/product_offer` là SPA shell.
- `packages/shopee/scripts/inspect-product-item.ts` — dump first item từ HAR response (đã redact) để biết schema thật.
- `packages/shopee/scripts/fetch-products-cookie.ts` — gọi `GET https://affiliate.shopee.vn/api/v3/offer/product/list?list_type=0&sort_type=1&page_offset=0&page_limit=20&client_type=1`, map item → `ShopeeProductCandidate`. Price divisor 100000 (5 implied decimals). Output `production/_commerce/shopee_product_candidates.json` với 0 cookie/token.
- `package.json` thêm `shopee:fetch-products`.

**Commits**: `96eb5b1` (probe), `dc2de8d` (fetch-products + inspect helper).

**Live test**: HTTP 403 (cookie 13h stale). Cookie refresh = operator step ngoài skill.

---

### ✅ Round 3C — Shopee Affiliate Link Verification v0: ĐÃ CHỐT (2026-05-24)

**Mục tiêu**: thêm bước verify/tạo affiliate link vào Shopee Product Card flow. Round 3A đã cho thấy `long_link` từ `/api/v3/offer/product/list` đã chứa đủ tracking hoa hồng (universal-link path + `gads_t_sig` + `utm_medium=affiliates` + `utm_source=an_<affid>`) — Round 3C wire kiểm chứng đó thành validator + schema enum, KHÔNG cần Custom Link endpoint cho v0.

**Đã làm**:
- `packages/shopee/src/types.ts` — thêm `AffiliateLinkStatus` enum (5 giá trị: `VERIFIED_FROM_LONG_LINK | GENERATED_BY_CUSTOM_LINK | NEEDS_CUSTOM_LINK | NEEDS_USER_REVIEW | FAILED`) + 3 field mới trên `ShopeeProductCandidate`: `shopee_affiliate_url`, `affiliate_link_status`, `affiliate_link_notes`.
- `packages/shopee/src/extract.ts` — `validateShopeeAffiliateLink(link)` check 5 điều kiện (host `shopee.vn`, path `/universal-link/`, `gads_t_sig`, `utm_medium=affiliates`, `utm_source=an_<digits>`); `emptyCandidate()` default 3 field mới (`"unknown" / FAILED / "no link extracted"`).
- `packages/shopee/scripts/fetch-products-cookie.ts` — `mapItem()` gọi validator, set `shopee_affiliate_url = long_link` nếu `VERIFIED_FROM_LONG_LINK`, copy `affiliate_link_notes`.
- `.claude/skills/chay/SKILL.md` — thêm box "Round 3C — Shopee affiliate link verification" mô tả 3 field mới + Publish Plan Agent mapping (status verified/generated → field 11 trực tiếp, no blocker; status needs/failed → `"needs_user_input"` + thêm `"shopee_affiliate_url_pending"` vào `publish_blockers`).

**Test**: 9 fixture case validator (1 VERIFIED + 5 NEEDS_USER_REVIEW variants + 3 FAILED) — 9/9 pass. Typecheck file mới sạch (errors còn lại trong `analyze-har.ts` / `fetch-offers-cookie.ts` / `secret-redaction.ts` là pre-existing, không chạm Round 3C).

**Không làm**: chạy video, publish Facebook, fetch Custom Link endpoint, commit HAR/cookie/session.

---

### ✅ Phần 24 — VFOS Agent Architecture v0 (spec): ĐÃ CHỐT (2026-05-26)

**Mục tiêu**: chuẩn hoá boundary giữa các agent của VFOS Short-form Factory để khi tách multi-agent thật không phải rewire. KHÔNG triển khai code multi-agent trong vòng này — chỉ spec + boundary + Git rule + SoT path.

**Đã làm**:
- `docs/00_DIEU_HANH/VFOS_AGENT_ARCHITECTURE_V0.md` — spec đầy đủ (11 mục):
  - Danh sách **5 agent**: 4 đã spec ở Phần 23 (Shopee Product / Demo Match / Script QC / Facebook Publish Plan) + **Git & Artifact Agent (mới)**.
  - **Artifact source-of-truth mới**: `production/_runs/<run_id>/...` cho mọi run mới sau khi pipeline migrate. Layout subdirectory: `inputs/`, `shopee/`, `demo_match/`, `script/`, `voice/`, `bgm/`, `preview/`, `publish/`, `reports/`. Migration là spec, **chưa thực thi** trong vòng này.
  - **Git & Artifact Agent HARD rule**: chỉ commit/push khi prompt user cho phép rõ ràng (chứa "commit"/"push"/"commit + push"/"commit với message ..."/"đẩy lên git"/"tạo PR"). KHÔNG tự commit cuối turn "vì đã xong việc". KHÔNG đổi commit message user đưa. Verify staging không lẫn binary / `.secrets/` trước commit.
  - **Boundary chéo Guard**: GUARD 6 = pipeline-level; GUARD 7 R1/R3/R5 = Script QC; R5 caption-layer + R2 product match = Publish Plan; GUARD 8 input = Shopee Product, match scoring = Demo Match.
  - **Decision boundary**: KHÔNG implement multi-agent code, KHÔNG tạo `.claude/agents/<name>.md` cho 5 sub-agent, KHÔNG migrate artifact cũ sang `_runs/`, KHÔNG sửa pipeline code.
  - **Roadmap v0–v6**: v0 (spec) → v1 (pipeline migrate ghi vào `_runs/`) → v2..v5 (tách 4 sub-agent) → v6 (tách Git Agent).
- `.claude/skills/chay/SKILL.md` — cập nhật section "AGENT-READY RESPONSIBILITY BOUNDARIES" thêm row Git & Artifact Agent + ràng buộc SoT `production/_runs/<run_id>/`; thêm HARD CONSTRAINTS Phần 24 (3 nhóm: commit-only-when-prompted, không đổi commit message, không tự migrate artifact); thêm link `VFOS_AGENT_ARCHITECTURE_V0.md` vào THAM CHIẾU.
- `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md` — file này, ghi Phần 24 + cập nhật mục 7 (bước tiếp theo) + mục 10 (Git status).

**Không làm**: chạy video, gọi Shopee/Facebook, dùng cookie/token, sửa code pipeline, mở Con số 2, tạo agent file thật, migrate artifact đã có sang `_runs/`.

**Commit**: `docs: define vfos agent architecture v0` (sẽ bump hash khi push).

---

### ✅ Round 25 — /chay Auto-Run Controller v0 + Deterministic Routing Hardening: ĐÃ CHỐT (2026-05-26)

**Mục tiêu**: giảm tối đa số prompt user phải gõ. Sau round này user chỉ cần gõ `/chay`, `/chay <video_id>`, `/chay <video_id> plan`, `/chay status`, `/chay resume`, `/chay commit` — controller tự đọc state, suy `next_agent`, chạy nếu an toàn. KHÔNG hỏi A/B/C, KHÔNG retry vô hạn, KHÔNG rerender, KHÔNG publish thật.

**Đã làm**:
- `.claude/skills/chay/SKILL.md` — chèn section lớn **"AUTO-RUN CONTROLLER v0 (Round 25)"** ngay sau "BƯỚC 0", trước "MODE ROUTING". Gồm 12 sub-section (A–L):
  - **A. Command Aliases (HARD ENUM)** — 15 commands: `/chay`, `/chay status`, `/chay <video_id>`, `/chay <video_id> status`, `/chay plan`, `/chay <video_id> plan`, `/chay resume`, `/chay <video_id> resume`, `/chay commit`, `/chay stop`, `/chay <video_id> --force-retry`, `/chay <video_id> --reset`, `/chay shopee <url>`, `/chay product <url>`, `/chay keywords "<keyword>"`.
  - **B. Active Video Priority** — memory `active_video_id` → scan `production/batch_001/yt_*/` → nhiều candidate = `ERR_AMBIGUOUS_NEXT_STEP` (không hỏi A/B/C). User-specified video_id KHÔNG bị override.
  - **C. Locked State Matrix** — 8 trạng thái deterministic (SUCCESS / SUCCESS_MATCH_CONFIRMED / SUCCESS_MATCH_NEEDS_REVIEW / SUSPENDED / FAILED / publish_plan-DONE / final-video-no-plan / match_result-FAIL). Đọc state theo priority 1–8 (waiting_state → agent report → publish_plan → match_result → script artifacts → product card → state doc fallback). Timeout 30 phút cho SUSPENDED.
  - **D. Artifact Matrix** — fallback infer `next_agent` từ artifact present khi không có latest status rõ (8 row mapping).
  - **E. No Rerender Rule (HARD)** — final video + publish_plan trỏ đúng path → `DONE_WAITING_USER_REVIEW`, KHÔNG render lại. Chỉ rerender với lệnh explicit `/chay <id> rerender` / `final-reels-render`.
  - **F. Infinite Loop Prevention (HARD)** — agent FAILED ở run hiện tại → `ERR_PREVIOUS_RUN_FAILED_LOCKED`. Retry CHỈ khi `--force-retry` + `retry_count < max_retry` + không phải hard-forbidden blocker (secret leak / publish permission / auth required). Retry metadata bắt buộc: `previous_failed_agent`, `previous_reason_code`, `retry_count`, `retry_allowed`, `force_retry_used`.
  - **G. Cold Start Logic** — phân biệt 3 input: có URL Shopee → Commerce Product Agent; có keyword → Discovery Mode; không gì → `ERR_COLD_START_INPUT_MISSING` (không hỏi A/B/C).
  - **H. Permission Boundary mặc định** — allowed (read artifact, run next_agent, create JSON, render preview nếu next, OpenAI cho script/subtitle) vs forbidden (no publish, no cookie misuse, no force push, no commit ngoài /chay commit, no Con số 2).
  - **I. OpenAI Viral Content Style Policy (Script & Claim Safety Agent)** — style hài hước/vui/dí dỏm/hơi bá đạo, câu ngắn 3–7 từ, keyword ngữ cảnh VN ("góc học tập", "dân văn phòng", "dưới 40k"). Blocklist banned phrase: "an toàn tuyệt đối", "không bao giờ kẹt tóc", "mát như điều hòa", "pin trâu cả ngày", "thay thế điều hòa", "trị bệnh/làm đẹp/sức khỏe" không có bằng chứng. Subtitle workflow: log đúng `rejected_count` + `rejection_reasons`, KHÔNG bịa "0 rejected", KHÔNG hợp thức hóa variant rủi ro bằng cách thêm "có thể" / "mình thấy". Ví dụ style tốt: "Ủa quạt gì mà không thấy cánh?", "Test bằng giấy cho khỏi nói điêu", "Dưới 40k mà có trò hay phết".
  - **J. Report Format ngắn** — 8 field default (detected_video_id / detected_next_agent / action_taken / status / reason_code / output_artifacts / next_step_short / git_status_summary). Báo dài chỉ khi FAIL / SUSPENDED / security issue / user yêu cầu chi tiết. `DONE_WAITING_USER_REVIEW` báo thêm final_video_path + caption_draft + affiliate_link.
  - **K. Reason Codes canonical enum** — 4 nhóm (SYSTEM 8 codes, SCRIPT 2, RENDER 2, COMMERCE 5). Bao gồm `ERR_AMBIGUOUS_NEXT_STEP`, `ERR_COLD_START_INPUT_MISSING`, `ERR_NEXT_AGENT_MISSING`, `ERR_PREVIOUS_RUN_FAILED_LOCKED`, `ERR_SYS_EXIT_GATE_TIMEOUT`, `ERR_RETRY_BUDGET_EXHAUSTED`, `ERR_OPENAI_API_KEY_MISSING`, `ERR_USER_APPROVAL_REQUIRED`, `ERR_SCR_MAJOR_TIMING_OVERFLOW`, `ERR_SUBTITLE_CLAIM_RISK`, `ERR_FINAL_VIDEO_EXISTS_NO_RERENDER`, `ERR_RENDER_QC_FAILED`, `ERR_PRODUCT_DATA_INSUFFICIENT`, `ERR_AFFILIATE_OWNER_MISMATCH`, `ERR_AUTH_REQUIRED`, `ERR_SOURCE_NOT_FOUND`, `ERR_SOURCE_DOWNLOAD_FAILED`, `ERR_SHOPEE_THROTTLED`.
  - **L. Self-Apply checklist** — 11 mục controller tự kiểm trước khi báo kết quả.
- `.claude/skills/chay/SKILL.md` — bổ sung **HARD CONSTRAINTS Round 25** (10 bullet × cấm) trong section "HARD CONSTRAINTS": cấm hỏi A/B/C, cấm rerender không lệnh explicit, cấm retry FAILED tự động, cấm retry vô hạn external API, cấm đổi video_id khi user specified, cấm report dài thường, cấm log "0 rejected" giả, cấm hợp thức hóa variant rủi ro, cấm báo "thiếu artifact" sai trong cold start.
- `.claude/skills/chay/SKILL.md` — bổ sung 12 mục Round 25 vào **SELF-REVIEW CHECKLIST** cuối skill (parse args, active video priority, locked state matrix, no rerender, infinite loop, retry metadata, cold start, permission, subtitle log, report format, reason codes).
- `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md` — file này, ghi Round 25 + cập nhật header + Git status.

**Locked State Matrix verify trên yt_014**: artifact hiện có `production/batch_001/yt_014/facebook_reels_publish_plan.json` với `publish_status="not_published"`, `needs_user_review=true`, `final_video_path="production/batch_001/yt_014/final_reels_v1/yt_014_final_reels_v1.mp4"` (tồn tại) → `/chay yt_014` (sau Round 25) PHẢI trả `status=DONE_WAITING_USER_REVIEW`, `action_taken=none`, `next_step_short="User review/manual publish"`, KHÔNG render lại final_reels_v2. `/chay yt_014 plan` PHẢI báo cùng status nhưng không chạy agent.

**Quan hệ với Phần 24**: Auto-Run Controller là layer **kỷ luật parse args + đọc state** đặt phía trên monolithic `/chay`. Vẫn KHÔNG implement code multi-agent — boundary của 5 agent (Shopee Product / Demo Match / Script QC ≡ Script & Claim Safety / Facebook Publish Plan / Git & Artifact) giữ nguyên theo `docs/00_DIEU_HANH/VFOS_AGENT_ARCHITECTURE_V0.md`. Git & Artifact Agent rule (commit-only-when-prompted) tiếp tục áp dụng — Auto-Run Controller `/chay commit` chỉ commit khi prompt user cho phép rõ.

**Không làm**: chạy yt_014 audio/render lại, rerender final video, publish, gọi Shopee/Facebook, dùng cookie/token, gọi OpenAI API, sửa code pipeline, commit media binary, động `production/batch_001/yt_014/final_reels_v2/*.mp4`. Chỉ cập nhật docs/skill.

**Commit**: `docs: add chay auto-run controller v0` (`f0965f9`).

---

### ✅ Round 25B — /chay Auto-Run Controller Hardening Patch: ĐÃ CHỐT (2026-05-26)

**Mục tiêu**: vá 3 edge case còn thiếu của Auto-Run Controller v0 (Round 25) — không mở rộng scope.

**Đã làm** — chèn 3 section mới (G2/G3/G4) vào Auto-Run Controller v0 trong [.claude/skills/chay/SKILL.md](.claude/skills/chay/SKILL.md):

- **Section G2 — Path Resolution / Migration Compatibility**: Controller hỗ trợ ĐỒNG THỜI 2 vùng artifact (`production/_runs/<run_id>/` SoT mới Phần 24 vs `production/batch_001/<video_id>/` legacy). Scan cả 2 vùng cho `/chay`, `/chay <video_id>`, `/chay status`, `/chay plan` và các variant. `_runs` ưu tiên SoT, `batch_001` fallback. Conflict → `ERR_STATE_CONFLICT` + báo path conflict rõ (KHÔNG hỏi A/B/C, KHÔNG merge mù). Report bắt buộc có 3 field mới: `state_source_path`, `artifact_source_path`, `namespace_mode` (`runs_sot` | `batch_legacy` | `mixed_conflict`).

- **Section G3 — Resume Timeout Semantics**: `/chay resume` và `/chay <video_id> resume` PHẢI kiểm timeout theo `expires_at` → `timeout_minutes` → `created_at + 30 phút default`. Quá hạn → `ERR_RESUME_EXPIRED_STATE` (chưa transition) hoặc `ERR_SYS_EXIT_GATE_TIMEOUT` (đã transition FAILED_TIMEOUT). KHÔNG tự reset, KHÔNG tự force-retry để "cứu" state chết. Run đã FAILED_TIMEOUT → chỉ `/chay <video_id> --reset` mới tạo run mới; `--force-retry` không unlock timeout state.

- **Section G4 — Command Precedence / No Rerender Override Rule**: Thứ tự ưu tiên lệnh (cao → thấp) — `--reset` > `rerender`/`final-reels-render`/explicit rerender keyword > `--force-retry` > plan/status > normal `/chay`. `--force-retry` KHÔNG tự bypass No Rerender Rule — trên video `DONE_WAITING_USER_REVIEW` thì `--force-retry` PHẢI báo `ERR_FINAL_VIDEO_EXISTS_NO_RERENDER`. Rerender intent thiếu lệnh explicit → `ERR_RERENDER_REQUIRES_EXPLICIT_COMMAND`. Rerender behavior HARD: (1) KHÔNG xoá final cũ, (2) tạo version mới (v2_3 / v3 / run_id mới), (3) update `publish_plan` chỉ sau QC PASS, (4) QC FAIL → giữ `publish_plan` trỏ final cũ đang pass.

- **Section J Report Format**: tăng từ 8 field lên 11 field (8 core + 3 path field G2). Thêm ví dụ output cho `/chay yt_014 plan` post-Round-25B (`state_source_path = production/batch_001/yt_014/facebook_reels_publish_plan.json`, `namespace_mode = batch_legacy`, `status = DONE_WAITING_USER_REVIEW`).

- **Section K Reason Codes**: thêm 4 code mới — `ERR_STATE_CONFLICT` (Path Resolution), `ERR_RESUME_EXPIRED_STATE` (Resume Timeout), `ERR_RERENDER_REQUIRES_EXPLICIT_COMMAND` (Command Precedence), `ERR_FINAL_VIDEO_EXISTS_NO_RERENDER` (đã có trong Round 25, nay clarify use case).

- **Section L Self-Apply checklist**: bổ sung 8 mục Round 25B (scan cả 2 vùng, ghi 3 path field, kiểm timeout, command precedence, --force-retry không tự rerender, rerender intent → explicit command, rerender giữ history + version mới).

- **HARD CONSTRAINTS**: thêm 7 bullet Round 25B (cấm chỉ scan batch_001, cấm bỏ 3 path field, cấm resume timeout state, cấm resume FAILED_TIMEOUT, cấm --force-retry bypass No Rerender, cấm xoá final cũ khi rerender, cấm rerender ngầm thiếu chữ rõ).

- **SELF-REVIEW CHECKLIST cuối skill**: bổ sung 7 mục Round 25B kiểm path scan, conflict, resume timeout, FAILED_TIMEOUT block, command precedence, --force-retry chặn rerender, rerender version mới + giữ history.

**Quan hệ với Round 25 & Phần 24**: Round 25B là **patch hardening** — không thay đổi 12 section A–L cốt lõi của Auto-Run Controller v0, chỉ chèn G2/G3/G4 và mở rộng J/K/L/HARD/SELF-REVIEW. Phù hợp Phần 24 SoT `production/_runs/<run_id>/` (G2 chính là cầu nối migration). Git & Artifact Agent rule giữ nguyên — Round 25B không thay đổi commit policy.

**Verify trên yt_014**: artifact hiện ở `production/batch_001/yt_014/`, không có `_runs/` entry → Controller phải trả `namespace_mode=batch_legacy`, `state_source_path=production/batch_001/yt_014/facebook_reels_publish_plan.json`. `/chay yt_014 --force-retry` (sau Round 25B) PHẢI bị chặn bằng `ERR_FINAL_VIDEO_EXISTS_NO_RERENDER` vì final + publish_plan đã DONE_WAITING_USER_REVIEW. `/chay yt_014 rerender` mới được phép bypass.

**Không làm**: chạy yt_014, render, publish, gọi Shopee/Facebook/OpenAI, dùng cookie/token, sửa code pipeline, commit media/binary, động `production/batch_001/yt_014/final_reels_v2/*.mp4`, động untracked scripts. Chỉ cập nhật docs/skill.

**Commit**: `docs: harden chay auto-run controller edge cases` (`754b4df`).

---

### ✅ Round 26B — Commerce Product Agent CDP Link Extraction + Dedupe Registry Hardening: ĐÃ CHỐT (2026-05-26)

**Mục tiêu**: chốt CDP attach vào browser user đang dùng (Cốc Cốc/Chrome `127.0.0.1:9222`) thành **PRIMARY** flow lấy Shopee Affiliate link cho Commerce Product Agent. Thêm global dedupe registry + concurrency safety + CDP failure policy + selector resilience. Audit 8 untracked Shopee POC scripts.

**Đã làm**:

- **Module mới**: [packages/shopee/src/link-registry.ts](packages/shopee/src/link-registry.ts) — global dedupe registry với:
  - Schema `v0.1.0` (entries + rejected + expected_affiliate_owner_id)
  - **Concurrency safety HARD**: file lock (`writeFileSync wx` flag atomic create) + bounded retry (default 5000ms timeout / 100ms poll) + stale lock detect (default 60s, KHÔNG tự xoá) + read-after-lock + merge-safe update + atomic rename `.tmp.<pid>.<ts>` → final path
  - **Dedup priority**: `shopid+itemid` > `canonical_url` normalized > `short_link` > normalized `product_name`
  - Public API: `upsertEntry()` / `appendRejected()` / `isDuplicate()` / `findExistingEntry()` / `LinkRegistryError` (typed reason_code)
- **Tests**: [packages/shopee/tests/link-registry.test.ts](packages/shopee/tests/link-registry.test.ts) — **14/14 pass** (cover dedup priority, lock timeout, stale lock, concurrent serialization, lock cleanup on success/fail, atomic write).
- **Export**: thêm vào [packages/shopee/src/index.ts](packages/shopee/src/index.ts) + `"test": "tsx --test tests/*.test.ts"` script trong [packages/shopee/package.json](packages/shopee/package.json).
- **SKILL.md update** [.claude/skills/chay/SKILL.md](.claude/skills/chay/SKILL.md):
  - Section mới **SHOPEE CDP TARGETED-CLICK LINK EXTRACTION v0** — `BROWSER_CDP_TARGETED_CLICK` flow chính + operator pre-req + agent flow 9 bước + tuning defaults (`target_count=2`, `max_clicks_per_batch=5`).
  - Section mới **SHOPEE LINK REGISTRY v0** — schema chính + dedup priority + pre-click check + post-resolve recheck + owner validation.
  - Section mới **REGISTRY CONCURRENCY SAFETY** — 6 rule HARD (lock, stale detect, read-after-lock, merge-safe, atomic write, release in finally).
  - Section mới **CDP CONNECTION FAILURE POLICY** — bảng 3 scenario (browser not found / target tab missing / login wall) với reason_code rõ + KHÔNG fallback tự động.
  - Section mới **SELECTOR RESILIENCE for Targeted Click** — priority text exact > aria > product-card scoped > stable data-* > controlled CSS fallback. KHÔNG random class hash / tọa độ click.
  - Section mới **TARGETED CLICK POLICY** — allowed/forbidden + login/OTP handling.
  - Section K Auto-Run Controller reason codes mở rộng: 6 code CDP (`ERR_CDP_BROWSER_NOT_FOUND`, `ERR_CDP_TARGET_TAB_NOT_FOUND`, `ERR_LINK_BUTTON_NOT_FOUND`, `ERR_AMBIGUOUS_LINK_BUTTON`, `ERR_MODAL_UNRECOGNIZED`, `ERR_DUPLICATE_PRODUCT_LINK`) + 4 code registry (`ERR_LINK_REGISTRY_LOCK_TIMEOUT`, `ERR_LINK_REGISTRY_STALE_LOCK`, `ERR_LINK_REGISTRY_WRITE_FAILED`, `ERR_LINK_REGISTRY_MISSING`).
  - **AGENT-READY RESPONSIBILITY BOUNDARIES** Shopee Product Agent row update: CDP flow là PRIMARY + global registry là output artifact.
  - HARD CONSTRAINTS Round 26B: 16 bullet × cấm (random click, click setting/account/payment, auto password/OTP, log cookie/token, batch >5, tự fallback sang shopee:login, write registry ngoài module, đọc registry trước lock, replace bulk entries, tự xoá stale lock, random CSS class primary, click tọa độ, xoá flow cũ, commit hàng loạt untracked).
  - SELF-REVIEW CHECKLIST cuối skill: +12 mục Round 26B.
- **Architecture doc update** [docs/00_DIEU_HANH/VFOS_AGENT_ARCHITECTURE_V0.md](docs/00_DIEU_HANH/VFOS_AGENT_ARCHITECTURE_V0.md):
  - Mục 3.1 Shopee Product Agent rename → "Shopee Product Agent (Commerce Product Agent)" + bổ sung Round 26B capability: CDP primary, registry artifact, 8 HARD rule (CDP retry 3, selector strategy, max_clicks_per_batch=5, owner validation, KHÔNG fallback tự động…).
- **Audit report mới** [docs/00_DIEU_HANH/ROUND_26B_SHOPEE_CDP_LINK_EXTRACTION_AUDIT.md](docs/00_DIEU_HANH/ROUND_26B_SHOPEE_CDP_LINK_EXTRACTION_AUDIT.md) — audit 8 untracked Shopee scripts + 4 `_commerce` JSON artifacts + flow lifecycle decision matrix + security scan rationale + next step (Round 27 candidate scope).
- **TRANG_THAI** (file này): Round 26B entry + header + Git status bump.

**Audit quyết định** (8 POC scripts):
- `click-and-extract-links.ts`, `resolve-and-validate.ts`, `fetch-coccoc.ts`, `extract-active-coccoc.ts`, `extract-offers-coccoc.ts`, `extract-offers-active.ts`, `get-one-link.ts`: **scratch/POC, KEEP UNTRACKED** — đều hardcode targets, không có dedupe/lock/CLI args/CDP failure handling/selector resilience đầy đủ theo Round 26B spec. Round sau refactor thành 1 production CLI wire vào `link-registry.ts`.
- `load-picks.ts`: **reusable** nhưng không thuộc CDP scope, giữ untracked (có thể commit round riêng).
- 4 JSON artifacts trong `production/_commerce/`: KHÔNG commit (regenerable output mỗi lần chạy).

**Flow lifecycle**:
- `BROWSER_CDP_TARGETED_CLICK` → **PRIMARY** (Round 26B)
- `shopee:login` / `shopee:fetch` (storage_state + Playwright headless) → **DEPRECATED / FALLBACK**
- `fetch-products-cookie.ts` (cookie fetcher Round 3A/3C) → **FALLBACK** (validator Round 3C vẫn dùng được)
- HAR endpoint discovery → **DEPRECATED**
- Shopee Open API GraphQL → **NOT_AVAILABLE** (chưa được cấp AppID/key)
- `load-picks.ts` (operator manual paste) → **REUSABLE** (bypass scrape hoàn toàn)
- **KHÔNG xoá** code flow cũ trong Round 26B — chỉ đánh dấu DEPRECATED/FALLBACK. Xoá là round riêng sau CDP chạy thật ≥3 lần ổn định.

**Verify**:
- Tests: `npx tsx --test packages/shopee/tests/link-registry.test.ts` → 14/14 pass (610ms total).
- Typecheck: `tsc -p packages/shopee/tsconfig.json --noEmit` → clean cho link-registry + index.

**Không làm**: chạy video, publish, gọi Facebook API, dùng Shopee private API/HAR/storage_state, nhập password/OTP, commit secret/media, xoá flow cũ, add hàng loạt untracked scripts, mở yt_015, random click, retry vô hạn, chạy CDP thật trong scope audit này.

**Commit**: `feat: add shopee link registry + cdp extraction docs` (`9a581f1`).

---

### ✅ Round 26 — Promote yt_014 Successful Patterns to Shared Pipeline: ĐÃ CHỐT (2026-05-27)

**Mục tiêu**: chuẩn hoá các pattern đã chứng minh thành công ở yt_014 Shopee-First pilot thành **rule trong SKILL.md** để yt_015+ reuse không phải re-derive. **Output A docs-only** — không promote code helper trong round này (11/11 untracked scripts đều hardcode `yt_014`, vi phạm Round 26 Hardening mục IV.4).

**Đã làm**:

- **SKILL.md update** [.claude/skills/chay/SKILL.md](.claude/skills/chay/SKILL.md):
  - **Section I expanded — OpenAI Viral Subtitle Workflow** (Script & Claim Safety Agent):
    - Blocklist 16 banned phrases (synced với yt_014 generate-subtitles.ts implementation): `an toàn tuyệt đối`, `không bao giờ kẹt tóc`, `không sợ bị kẹt tay`, `mát như điều hòa`, `siêu mạnh nhất`, `pin trâu cả ngày`, `tốt nhất`, `thay thế điều hòa`, claim sức khỏe/làm đẹp/y tế không bằng chứng, etc.
    - Viral keyword whitelist VN context (11 từ): `quạt không cánh`, `dưới 40k`, `test bằng giấy`, `góc học tập`, `dân văn phòng`, `mùa nóng`, `gadget mini`, `món lạ Shopee`, etc.
    - **`subtitle_overlay_plan.json` schema mở rộng** (verified yt_014 pattern): `selected_variants`, `rejected_variants`, `all_variants`, `style_profile`, `model`, `generated_at`, `claim_safety_check.status/details` per block.
    - **Fallback safe template policy**: khi mọi variant cho 1 block reject → dùng pre-approved manual template (observable facts), ghi rõ `"Manual safety fallback — N variants rejected."`. KHÔNG bịa PASS, KHÔNG hợp thức hóa variant rủi ro bằng "có thể"/"mình thấy".
  - **Section I2 mới — Audio & Assembly Agent — Final Reels Render Pattern v0**:
    - Target `1080×1920` (9:16 fill).
    - KHÔNG dùng blurred padding làm layout chính nếu source 16:9 — phải center-crop vertical.
    - Công thức center-crop cho source `1280×720`: `crop=405:720:437:0` → `scale=1080:1920`. Helper PHẢI nhận `source_width/height` qua args/config, KHÔNG hardcode.
    - Decision matrix theo source ratio (portrait/landscape/square/other).
    - QC bắt buộc: width/height target, duration ≤0.5s lệch, max_volume ≤-1 dBFS, 2 streams (H264+AAC).
    - Output path policy (pre-migration batch_001 vs post-migration `_runs/<run_id>/preview/`).
    - Versioning rule: rerender KHÔNG xoá final cũ, tạo `v2`, `v3`, `v2_2`, `v2_3`...
  - **Section I3 mới — Overlay/Subtitle Timing Anti-Overlap Rule v0**:
    - **Failure mode đã verified yt_014**: `b3.end == b4.start = 18.0` → ffmpeg `enable='between(t, start, end)'` render đè frame, gây artefact `"ĐỂ BÀN40K GHÊ"` (text 2 block merge cùng 1 frame).
    - **Layout zones** (frame 1080×1920): overlay `y≈450` (top), subtitle `y≈1450` (bottom), action zone `y∈[600,1350]` TUYỆT ĐỐI không drawtext, Reels UI safe zone `y∈[200,1700]`.
    - **Micro-gap default 0.05s** (range hợp lệ [0.03, 0.08]) tại block transitions `block_A.end == block_B.start`.
    - **HARD hardening**: micro-gap PHẢI là constant top-of-file `const DEFAULT_SUBTITLE_MICRO_GAP_SECONDS = 0.05` HOẶC CLI arg `--micro-gap 0.05`. TUYỆT ĐỐI KHÔNG hardcode `0.05`/`0.03`/`0.08` ẩn rải rác trong logic.
    - Filtergraph pattern + QC scrub timeline tại MỌI block transition mốc.
  - **AGENT-READY RESPONSIBILITY BOUNDARIES table** Round 26 update:
    - Script QC Agent (alias **Script & Claim Safety Agent**) row: bổ sung Round 26 capability (OpenAI viral subtitle rewrite + claim-safe blocklist scan + fallback safe template + persist `subtitle_overlay_plan.json` schema mở rộng) + output artifact `subtitle_overlay_plan.json`.
    - Note dưới table: **Audio & Assembly là pipeline step, KHÔNG phải agent thứ 6**. Tên `"Audio & Assembly Agent"` trong Auto-Run Controller Section C là next_agent label cho routing, không phải agent file thực.
  - **HARD CONSTRAINTS Round 26**: 11 bullet × cấm (blurred padding cho 16:9 Reels, hardcode `crop=405:720:437:0` cho mọi source, drawtext vào action zone, render text ngoài Reels safe zone, không áp micro-gap 2 block kế tiếp, hardcode magic 0.05 ẩn, bịa fallback PASS, ghi "0 rejected" giả, hợp thức bằng "có thể"/"mình thấy", persist plan thiếu field, promote helper còn hardcode yt_014, xóa scratch bằng rm/del không approval, tạo agent thứ 6).
  - **SELF-REVIEW CHECKLIST cuối skill**: +12 mục Round 26.

- **Architecture doc update** [docs/00_DIEU_HANH/VFOS_AGENT_ARCHITECTURE_V0.md](docs/00_DIEU_HANH/VFOS_AGENT_ARCHITECTURE_V0.md):
  - Mục 3.3 Script QC Agent → "Script QC Agent (alias **Script & Claim Safety Agent** sau Round 25)": bổ sung Round 26 capability + 4 HARD rule (rejected_variants log đúng, fallback safe template manual, banned phrases blocklist synced SKILL.md, subtitle ≤12 từ / overlay ≤5 từ).
  - **Mục 3.4b mới** — "Audio & Assembly (pipeline step, KHÔNG phải agent thứ 6)": clarify Voice Sync + BGM Mix + Final Reels Render là STEP 9–11 monolithic `/chay`, tương lai có thể split nhưng KHÔNG thuộc scope hiện tại. Ghi 3 Round 26 pattern đã chốt: Final Reels Render 9:16, Overlay Timing Anti-Overlap (micro-gap), Layout zones.

- **Audit report mới** [docs/00_DIEU_HANH/ROUND_26_YT014_PATTERN_PROMOTION_AUDIT.md](docs/00_DIEU_HANH/ROUND_26_YT014_PATTERN_PROMOTION_AUDIT.md):
  - Audit 3 untracked scripts mới (chưa cover Round 26B): `final-render.ts`, `generate-subtitles.ts` (script-writer), `generate-subtitles.ts` (shopee, wrong package).
  - Tổng kết 11 untracked files (3 Round 26 + 8 Round 26B): 0/11 đủ tiêu chuẩn promote.
  - Pattern promoted table (A-F): A/B/C/D promoted, E/F đã có sẵn từ Phần 23/Round 26B.
  - Hardcoded path verification + micro-gap constant/config verification.
  - Scratch/deprecated/unsafe handling table (22 untracked files) + recommendation cho operator có thể tự xoá thủ công.
  - Next step Round 27 candidate scope (5 task refactor).
  - Self-audit checklist 20/20 pass.

- **TRANG_THAI** (file này): Round 26 entry + header + Git status bump.

**Audit quyết định** (3 file Round 26):

| File | Verdict | Lý do |
|---|---|---|
| `packages/script-writer/scripts/final-render.ts` | **scratch yt_014-specific — keep untracked** | Default `--video-id yt_014`, hardcode `production/batch_001` path, magic `crop=405:720:437:0` cho source 1280×720, hardcode `b4 - 0.05` cho block transition, magic `y=450`/`y=1450` layout. Round 27 refactor: nhận source dimensions + micro-gap + layout y qua args. |
| `packages/script-writer/scripts/generate-subtitles.ts` | **scratch yt_014-specific — keep untracked** | Hardcode `production/batch_001/yt_014` path + `video_id: 'yt_014'` + `b3` fallback string. Pattern logic (BANNED_PHRASES + VIRAL_KEYWORDS + runSubtitleQC + fallback) đã promote vào SKILL Section I expanded. Round 27 refactor: tách blocklist ra module, expose pure function. |
| `packages/shopee/scripts/generate-subtitles.ts` | **scratch yt_014 + WRONG PACKAGE — keep untracked** | Duplicate gần như identical với script-writer version nhưng đặt nhầm package. Subtitle workflow thuộc Script & Claim Safety Agent (`packages/script-writer/`), KHÔNG thuộc Shopee Product Agent. Round 27 sẽ xoá. |

**Pattern promoted vào hệ thống chung**:
- ✅ A. Final Reels Render 9:16 center-crop → Section I2
- ✅ B. Overlay/Subtitle Timing Anti-Overlap + Layout zones + micro-gap constant → Section I3
- ✅ C. OpenAI Viral Subtitle Workflow expanded (blocklist + viral keyword + schema + fallback safe template) → Section I
- ✅ D. Claim Safety blocklist → Section I + GUARD 7 R3 cross-ref
- ✅ E. Publish Plan pattern (đã có Phần 23, Round 26 verify đủ)
- ✅ F. Shopee Commerce targeted-click (đã có Round 26B, Round 26 verify đủ)

**Quan hệ với Phần 24 + Round 25/25B/26B**:
- KHÔNG tạo agent mới (vẫn 5 agent Phần 24 + 1 alias Script & Claim Safety).
- KHÔNG migrate artifact `production/batch_001/yt_014/` (vẫn pre-migration, Phần 24 spec migration là round riêng).
- Auto-Run Controller (Round 25/25B) — Audio & Assembly Agent label trong Section C tham chiếu Section I2/I3 mới cho rule render.
- Shopee Product Agent CDP flow (Round 26B) độc lập — không bị Round 26 đụng vào.

**Không làm**: chạy yt_014 lại, render video, mở yt_015, publish, gọi Facebook/Shopee/OpenAI API, dùng cookie/token, nhập password/OTP, commit media binary, commit 11 untracked scripts, add `production/batch_001/yt_014/demo_match/sources/` hoặc `production/_commerce/*.json`, xóa scratch/deprecated file bằng rm/del, promote helper còn hardcode `yt_014`, hardcode micro-gap ẩn trong logic, tạo agent thứ 6.

**Commit**: `docs: promote yt_014 successful patterns to shared pipeline` (`8bef9fc`).

**Patch 2026-05-27 (post Round 26)**: cập nhật CDP extraction default → `target_count = 1` (single-link default). User explicit không muốn lấy 3–5 link mỗi lần khi không cần. Batch mode CHỈ activate khi user yêu cầu rõ ("lấy N link" / "lấy N sản phẩm" / "tìm nhiều để so sánh") hoặc CLI `--target-count=N`. `max_clicks_per_batch = 5` là **safety ceiling**, KHÔNG phải mục tiêu. Workflow nhắm: 1 link mới hợp lệ → 1 Product Card → 1 scoring → PRODUCT_SELECTED → 1 video_id mới + Source Match Agent. Cập nhật SKILL.md (Default tuning + Batch mode + Stop conditions + 3 HARD CONSTRAINTS + 2 SELF-REVIEW) + VFOS_AGENT_ARCHITECTURE_V0.md (mục 3.1 Shopee Product Agent). Commit: `docs: shopee cdp default to single-link extraction`.

---

### ✅ Round 27 — Shopee CDP Production Extraction CLI: ĐÃ CHỐT (2026-05-27)

**Mục tiêu**: thay thế 6+ POC scratch scripts (`click-and-extract-links.ts`, `cdp-extract.ts` draft, `get-one-link.ts`, etc.) bằng **1 production CLI duy nhất** wire vào `link-registry.ts`, đáp ứng đủ hardening Round 26B + patch single-link default.

**Đã làm**:

- **Module mới** [packages/shopee/src/cdp-extract-helpers.ts](packages/shopee/src/cdp-extract-helpers.ts) — pure helpers testable không cần real browser:
  - `extractShopidItemid(canonical)` — parse 3 path shape (`-i.<shopid>.<itemid>`, `/opaanlp/<shopid>/<itemid>`, `/<slug>/<shopid>/<itemid>`).
  - `resolveShortLink(url, fetcher)` — injectable fetcher; HEAD redirect → fallback GET; KHÔNG đọc request/response cookies.
  - `shouldSkipPreClick(registry, owner, probe)` — pre-click dedup HARD priority: shopid+itemid > canonical > short_link > product_name; trả về `match_field` cho operator log.
  - `classifyResolvedLink(canonical, expectedOwner)` — `ACCEPT` | `REJECT (ERR_AFFILIATE_OWNER_MISMATCH)` | `REVIEW (NEEDS_USER_REVIEW)`.
  - `parseCliValues(values, defaults)` — validate target_count ≥ 1, max_clicks ≥ target_count, owner_id `an_<digits>`, cdp_retries ≥ 1.

- **CLI mới** [packages/shopee/scripts/extract-links-cdp.ts](packages/shopee/scripts/extract-links-cdp.ts) — production CLI `pnpm shopee:extract-links-cdp`:
  - Default `--target-count=1` (single-link), `--max-clicks=5` safety ceiling.
  - **Fresh DOM query mỗi iteration** — không giữ stale index; `Set<string> attemptedNames` chỉ track session tại Node-side để skip card đã thử.
  - **Modal verify** sau click → URL hợp lệ → resolve; URL missing → `appendRejected(ERR_MODAL_UNRECOGNIZED)` → đóng modal Escape → re-query DOM iteration tiếp.
  - **Pre-click dedup** kiểm tra shopid+itemid (nếu đọc được từ card `<a href>`) + product_name từ registry.
  - **Post-resolve dedup MANDATORY** — sau khi resolve short link → kiểm lại bằng shopid+itemid + canonical_url + short_link; nếu trùng → skip không upsert. 3 hit liên tiếp → `SUSPENDED`.
  - **Owner validation** qua `classifyResolvedLink` → `ACCEPT` upsert; `REJECT` → `appendRejected(ERR_AFFILIATE_OWNER_MISMATCH)`; `REVIEW` upsert với `affiliate_link_status=NEEDS_USER_REVIEW`.
  - **CDP failure policy** đúng spec: connect fail 3 retry → `ERR_CDP_BROWSER_NOT_FOUND` (exit 2); tab missing → `ERR_CDP_TARGET_TAB_NOT_FOUND` (exit 2). KHÔNG tự fallback storage_state/cookie/HAR.
  - **No `any`** — dùng `Browser`, `Page` từ playwright + `FetchLike` injectable type cho tests. Triple-slash `/// <reference lib="dom" />` cho DOM body bên trong `page.evaluate`.
  - **`--help` text** đầy đủ option + pre-req operator + KHẲNG ĐỊNH single-link default.
  - **`--dry-run`** — log actions, không write registry, không appendRejected.

- **Tests mới** [packages/shopee/tests/cdp-extract-helpers.test.ts](packages/shopee/tests/cdp-extract-helpers.test.ts) — **20/20 pass**:
  - `extractShopidItemid`: 4 test (opaanlp, `-i.`, unrelated URL, null).
  - `classifyResolvedLink`: 4 test (ACCEPT, REJECT owner mismatch, REVIEW missing gads_t_sig, REJECT null).
  - `shouldSkipPreClick`: 3 test (empty registry, hit by shopid_itemid, hit by normalized product_name).
  - `rerun behaviour`: 1 test (first upsert insert, second upsert same shopid+itemid → duplicate times_seen=2, entries.length=1).
  - `resolveShortLink`: 3 test (Location header, fallback GET .url, fetcher throw → null).
  - `parseCliValues`: 5 test (defaults 1/5, --target-count=3 ok, max < target reject, owner format reject, target<1 reject).
- **Toàn shopee test suite**: **46/46 pass** (20 cdp + 26 link-registry).

- **Package wiring** [packages/shopee/package.json](packages/shopee/package.json): thêm `"shopee:extract-links-cdp": "tsx scripts/extract-links-cdp.ts"`.
- **Export** [packages/shopee/src/index.ts](packages/shopee/src/index.ts): re-export 5 helper + 5 type.
- **Xoá** draft `packages/shopee/scripts/cdp-extract.ts` (untracked, không có git impact).
- **TRANG_THAI** (file này): Round 27 entry + header + commit hash bump.

**Verify**:
- Tests: `npx tsx --test packages/shopee/tests/*.test.ts` → 46/46 pass.
- Typecheck: `tsc -p packages/shopee/tsconfig.json --noEmit` → clean cho `extract-links-cdp.ts` + `cdp-extract-helpers.ts` + tests (errors còn lại đều ở scratch scripts untracked `get-one-link.ts` / `test-single-link-cdp.ts` + pre-existing `secret-redaction.ts` error).
- Smoke `--help` → in đúng option + pre-req.
- Smoke `--target-count=abc` → exit `ERR_INVALID_ARGS`.
- Smoke `--dry-run --cdp-retries=1` (không có tab Shopee mở) → CDP connect OK + `ERR_CDP_TARGET_TAB_NOT_FOUND` exit cleanly. CDP failure policy verified.
- Security scan diff: 0 secret thật — chỉ có guard comment "never log cookies/tokens".

**Không làm**: chạy CDP thật trên Shopee tab live, lấy link production thật, mở yt_015, chạy video, publish, gọi Facebook API, nhập password/OTP, log cookie/token/header, commit POC scratch hàng loạt, commit registry runtime JSON `production/_commerce/shopee_link_registry.json`, xoá scratch khác (`load-picks.ts`, `extract-active-coccoc.ts`, etc. vẫn untracked — operator tự xoá).

**Commit**: `feat: add shopee cdp production extraction cli` (`f99eecc`).

**Patch 2026-05-27 (post Round 27 — alias enrollment)**: thêm 2 alias mới vào Auto-Run Controller Section A HARD ENUM để CLI Round 27 không bị `ERR_AMBIGUOUS_NEXT_STEP`:
- `/chay shopee-cdp-test` (alias #16) — smoke test cô lập cho `pnpm shopee:extract-links-cdp`. KHÔNG tạo video_id, KHÔNG mở video mới, KHÔNG commit mặc định. Spec chi tiết ở SKILL Section A.1 + REPORT FORMAT template.
- `/chay shopee-first` (alias #17) — promote `BROWSER_CDP_TARGETED_CLICK` thành step 1 của MODE 4 Shopee-First Lane cold start. Lấy 1 link mới → tạo Card + scoring → PRODUCT_SELECTED thì assign `video_id` mới kế tiếp + chuyển Demo Match Agent. KHÔNG publish, KHÔNG commit trừ khi prompt cho phép. Spec chi tiết ở SKILL Section A.2 + REPORT FORMAT template.

Patch CHỈ docs/skill. KHÔNG chạy CLI thật, KHÔNG mở yt_015, KHÔNG đổi code production.

Commit: `docs: add chay aliases for shopee cdp extraction`.

---

### ✅ Round 27B — Shopee CDP Browser Auto-Launch + CAPTCHA Human-Assist Guard: ĐÃ CHỐT (2026-05-27)

**Mục tiêu**: Cốc Cốc/Chrome không sẵn ở port 9222 → CLI Round 27 fail `ERR_CDP_BROWSER_NOT_FOUND` đợi 90s. Round 27B đảo hành vi: CLI **tự launch browser có kiểm soát** với profile đã login, đồng thời **chờ operator giải CAPTCHA thủ công** khi gặp guard. KHÔNG nhập password/OTP/CAPTCHA tự động.

**Đã làm**:

- **Module mới** [packages/shopee/src/cdp-bootstrap.ts](packages/shopee/src/cdp-bootstrap.ts) — pure helpers + orchestrator có inject deps để test:
  - `bootstrapBrowser(config, deps)` — probe port → resolve browser path → resolve user-data-dir → profile lock check → `spawn { detached: true }` với `--remote-debugging-port=9222 --user-data-dir=<dir> --no-first-run --no-default-browser-check` → poll port (default 15s, interval 1s) → return `BootstrapResult`.
  - `resolveBrowserPath` — priority: `--browser-path` override → `VFOS_BROWSER_PATH` env → `DEFAULT_BROWSER_PATHS_WIN32` (Cốc Cốc Program Files / Program Files (x86) / `%LOCALAPPDATA%` → Chrome Program Files / Program Files (x86)). Throw `ERR_CDP_BROWSER_NOT_FOUND_ON_DISK` nếu hết candidate.
  - `resolveUserDataDir` — priority: `--browser-user-data-dir` → `VFOS_BROWSER_USER_DATA_DIR` env. BẮT BUỘC một trong hai → throw `ERR_CDP_USER_DATA_DIR_REQUIRED`. KHÔNG tự dùng default profile (mất login session) hoặc spawn profile trống (login wall).
  - `detectProfileLock(dir)` — check `SingletonLock` / `SingletonCookie` / `LockFile` → throw `ERR_CDP_PROFILE_LOCKED`. KHÔNG tự xoá.
  - Stdout/stderr browser child redirect vào `production/_commerce/cdp_bootstrap.log` (gitignored bởi `*.log`).
  - `detectCaptchaGuard(page)` — quét URL (`verify.shopee.vn`/`shopee.vn/security`/`/buyer/login`/`shopee.vn/account/login`) + DOM (`div[class*="captcha"]`, `iframe[src*="captcha"]`, `iframe[src*="security"]`, `.shopee-popup__container`, `div[role="dialog"][class*="login"]`) + body text (`xác minh`, `captcha`, `verify`, `security check`, `đăng nhập`).
  - `waitForCaptchaResolution(page, opts)` — poll mỗi 1s trong `waitSeconds`. `cleared=true` ngay khi tín hiệu biến → continue. Quá hạn → `cleared=false, reason_code=ERR_CAPTCHA_TIMEOUT`.
  - Constants top-of-file: `DEFAULT_CAPTCHA_WAIT_SECONDS=20`, `MIN_CAPTCHA_WAIT_SECONDS=10`, `MAX_CAPTCHA_WAIT_SECONDS=60`. `clampCaptchaWaitSeconds(raw)` apply ở `parseCliValues` + `waitForCaptchaResolution`.

- **CLI mở rộng** [packages/shopee/scripts/extract-links-cdp.ts](packages/shopee/scripts/extract-links-cdp.ts):
  - Args mới: `--captcha-wait-seconds=N`, `--browser-path=PATH`, `--browser-user-data-dir=PATH`, `--no-auto-launch`.
  - Trước `chromium.connectOverCDP`: gọi `bootstrapBrowser`. Nếu bootstrap launched mới → giảm Playwright retries xuống 1 (port đã verified open) — tránh 3×30s timeout. Nếu `--no-auto-launch` + port đóng → fail `ERR_CDP_BROWSER_LAUNCH_FAILED` ngay không spawn.
  - Sau khi locate tab Shopee Affiliate: gọi `detectCaptchaGuard` + `waitForCaptchaResolution`. Phát hiện → in `⚠️ VFOS WARNING` + countdown 5s tick. Operator giải xong → continue. Quá hạn → exit 2 `ERR_CAPTCHA_TIMEOUT`, KHÔNG đóng browser.
  - `parseCliValues` validate `captcha-wait-seconds ∈ [10, 60]`, owner format, target/max-clicks.

- **Tests mới** [packages/shopee/tests/cdp-bootstrap.test.ts](packages/shopee/tests/cdp-bootstrap.test.ts) — **27/27 pass**:
  - `expandEnvPath`: 3 test (LOCALAPPDATA replace, missing var, no placeholder).
  - `resolveBrowserPath`: 4 test (override, env, default fallback, no exe → `ERR_CDP_BROWSER_NOT_FOUND_ON_DISK`).
  - `resolveUserDataDir`: 4 test (override, env, missing → `ERR_CDP_USER_DATA_DIR_REQUIRED`, blank env).
  - `detectProfileLock`: 2 test (no lock null, SingletonLock found).
  - `bootstrapBrowser`: 7 scenario (already_running, auto-launched + spawn args verified, no exe, profile locked, port timeout, `--no-auto-launch`, missing user-data-dir).
  - `clampCaptchaWaitSeconds`: 4 test (clamp low, clamp high, in-range, undefined → 20).
  - `waitForCaptchaResolution`: 3 test (cleared immediately, cleared mid-wait at tick 5, timeout → ERR_CAPTCHA_TIMEOUT).
- **Toàn shopee test suite**: **73/73 pass** (27 bootstrap + 20 cdp-extract-helpers + 14 link-registry + 12 extract).

- **SKILL.md update** [.claude/skills/chay/SKILL.md](.claude/skills/chay/SKILL.md):
  - **Section A.1** mở rộng — hành vi auto-launch + scope exception + CAPTCHA guard chi tiết.
  - **Section H** Permission Boundary — bổ sung "Allowed" entry cho Round 27B auto-launch (CHỈ trong Commerce Product Agent Shopee CDP flow, KHÔNG cho Facebook/publish/payment/shopee:login/shopee:fetch/OTP).
  - **Section K** Reason Codes — thêm group "COMMERCE — CDP Bootstrap (Round 27B)": `ERR_CDP_BROWSER_NOT_FOUND_ON_DISK`, `ERR_CDP_PORT_TIMEOUT_AFTER_LAUNCH`, `ERR_CDP_PROFILE_LOCKED`, `ERR_CDP_USER_DATA_DIR_REQUIRED`, `ERR_CDP_BROWSER_LAUNCH_FAILED`, `ERR_CAPTCHA_TIMEOUT`.

- **TRANG_THAI** (file này): Round 27B entry + header + commit hash bump.

**Verify**:
- Tests: `npx tsx --test packages/shopee/tests/*.test.ts` → 73/73 pass (~580ms).
- Typecheck: `tsc -p packages/shopee/tsconfig.json --noEmit` → clean cho cdp-bootstrap.ts + extract-links-cdp.ts + tests (errors còn lại đều ở scratch scripts untracked + pre-existing `secret-redaction.ts`).
- Smoke `--help` → in đúng options mới + bootstrap behaviour + operator env.
- Smoke `--captcha-wait-seconds=5` → exit `ERR_INVALID_ARGS` (out of `[10, 60]`).
- Smoke `--no-auto-launch --cdp-retries=1` (port 9222 đóng) → exit `ERR_CDP_BROWSER_LAUNCH_FAILED` ngay (~1s), spawn không gọi.

**Operator setup mới** (one-time):
- Set env `VFOS_BROWSER_USER_DATA_DIR` trỏ vào profile Cốc Cốc/Chrome đã login Shopee Affiliate. Ví dụ Windows PowerShell: `[Environment]::SetEnvironmentVariable("VFOS_BROWSER_USER_DATA_DIR", "C:\Users\Admin\AppData\Local\CocCoc\Browser\User Data", "User")`. Nếu skip → CLI sẽ throw `ERR_CDP_USER_DATA_DIR_REQUIRED` rõ ràng.
- Optional: set `VFOS_BROWSER_PATH` nếu cài Cốc Cốc/Chrome ở path không chuẩn.
- Optional: `--no-auto-launch` để giữ hành vi attach-only Round 27 cũ.

**Không làm**: chạy CDP thật trên browser sản xuất, lấy link production thật, mở yt_015, chạy video/audio/render, publish, gọi Facebook API, nhập password/OTP/CAPTCHA, log cookie/token/header, commit POC scratch hàng loạt, commit registry runtime JSON, commit `cdp_bootstrap.log`, xoá `SingletonLock` tự động.

**Commit**: `feat: add cdp browser auto-launch and captcha human-assist to shopee flow` (hash sẽ bump khi push).

---

### ✅ Round 29 — VFOS Operator/Safety Hardening Suite: ĐÃ CHỐT LOCAL (2026-05-29 state-sync)

> **Ngữ cảnh phiên sync**: Phiên 50 phút ngày 2026-05-29 phát hiện file điều hành stale so với code thực — từ commit mốc `15c2210` (Round 27B) tới HEAD local `9921431` có **50+ commit hardening** đã chốt local nhưng chưa ghi vào file điều hành. Phiên sync này KHÔNG mở feature mới; chỉ visibility + state sync + hygiene map.

**Mục tiêu chung của cụm Round 29**: đưa VFOS từ "pipeline chạy được + operator phải nhớ command rời rạc" lên "Operator chỉ cần `pnpm vfos:daily` để biết trạng thái + bước kế tiếp", đồng thời hardening safety boundary cho Git / Facebook / Shopee.

**Cụm 1 — Run/Pipeline framework foundation** (`3a5a3cd → 03b4d5e`):
- VFOS run status foundation, step runner + artifact gate, retry policy + health checks.
- Guard runner, script guard, product match + visual guards.
- Pipeline plan builder, review product lane config + run manifest.
- Auto-pipeline dry run, offline production-like pipeline steps (first + second).
- Run manifest operator CLI, offline script/voice/render/preview/manifest steps.
- Run report export, human approval gate, `READY_FOR_OPERATOR_REVIEW` state.
- Publish safety manifest, local preview render bridge, local media fixture render bridge.
- `chay` orchestrator command (`pnpm chay`).

**Cụm 2 — Script writing prompt upgrade** (`7018f4d`):
- Upgrade script writing prompt sang Vietnamese youth slang style (khớp với memory `vfos-script-style`: hài hước/táo bạo vừa phải/giới trẻ + guardrails không phóng đại).

**Cụm 3 — BGM library v0 (20 bài rotation)** (`cc73f68 → e28de7e`):
- Background music library + selector, ElevenLabs BGM generator controlled batch 20.
- Wire BGM selector + mix vào main pipeline, BGM fade treatments + audio limiter.
- Khớp memory `vfos-bgm-rotation`: 20 bài xoay vòng, ưu tiên bài ít dùng, không tự gọi API generator.

**Cụm 4 — Shopee CDP integration** (`2530762 → e9e4716`):
- Shopee CDP preflight check, CDP link extraction, product card builder.
- Wire selected product card vào review pipeline.

**Cụm 5 — Facebook Reels publish preflight** (`486ec63 → 0069a9c`):
- Facebook Page connection preflight test.
- Facebook Page Reels publish preflight validation.
- Facebook multi-page category routing preflight.
- **KHÔNG có live publish** — chỉ preflight validation/readiness report.

**Cụm 6 — Operator workflow polish + Git safety** (`5a7e863 → 9921431`):
- Operator review pack + operator publish command.
- Shopee affiliate link auditor + audit gate wire vào product pipeline.
- Commerce intake orchestrator (`pnpm commerce:intake` + `--confirm-targeted-click`).
- VFOS daily operator dashboard (`pnpm vfos:daily`) — one-command visibility.
- Daily workflow runbook export → `data/temp/vfos_daily_runbook.md`.
- Operator checkpoint export → `data/temp/vfos_operator_checkpoint.{json,md}`.
- VFOS git sync guard (`pnpm vfos:sync-check`) — multi-machine safety.
- Supervised Git sync action hooks + daily git command handoff.
- Unified publish readiness report.
- Production reel archive packager.

**Trạng thái runtime hiện tại theo `pnpm vfos:daily` (2026-05-29 14:03Z)**:
- Commerce Intake: Preflight `NOT_READY` 🔴 (browser CDP chưa kết nối — chấp nhận, không sửa trong phiên sync).
- Product Card: `FOUND` 🟢 — "Quạt Cầm Tay Mini T10" với short link `https://s.shopee.vn/W3nOHwfl1`, audit owner `an_17376660568` PASS.
- Review pack: `READY_FOR_FINAL_OPERATOR_APPROVAL` 🟢 ở folder `data/temp/pipeline-p9-demo/run_review_product_p9/`.
- Publish manifest + page route + Reels validation: tất cả PASS, status `READY FOR SUBMISSION` 🟢.
- Production pack: `PACKED` 🟢.
- Safety locks: tất cả ENGAGED 🔒 (`browser_clicked=false`, `fb_api_called=false`, `auto_publish=false`, `read_only=true`).
- Git sync: `WARN` 🟡 — ahead origin 1, dirty tree (untracked đã phân loại bên dưới).
- Last completed stage: `PUBLISH_REQUEST_READY` → Next stage: `MANUAL_INSPECTION`.
- Recommended next command (dashboard tự đề xuất): `pnpm publish:facebook --confirm-final-approval --run run_review_product_p9` — **chưa thực thi trong phiên sync, vẫn cần Operator review preview MP4 trước**.

**Phân loại 23 untracked files** (phiên sync 2026-05-29 — chỉ map, KHÔNG bulk-commit):

*Nhóm A — Source code utility/legacy, cần audit case-by-case round sau*:
- `packages/shopee/scripts/click-and-extract-links.ts` — Playwright CDP extractor, ghi vào `_commerce/`.
- `packages/shopee/scripts/download-and-verify-yt014.ts` — utility 1-batch `yt_014`, có thể stale sau Round 26 promote.
- `packages/shopee/scripts/extract-active-coccoc.ts`, `extract-offers-active.ts`, `extract-offers-coccoc.ts`, `fetch-coccoc.ts` — series Cốc Cốc CDP extractor experiments.
- `packages/shopee/scripts/generate-subtitles.ts`, `packages/script-writer/scripts/generate-subtitles.ts` — 2 subtitle generators (trùng tên cross-package, cần dedupe).
- `packages/shopee/scripts/get-one-link.ts` — đơn giản, có thể throwaway.
- `packages/shopee/scripts/load-picks.ts`, `resolve-and-validate.ts` — Shopee pick/resolve tooling.
- `packages/shopee/scripts/test-single-link-cdp.ts` — **explicit docstring "scratch — keep untracked"** → giữ untracked.
- `packages/script-writer/scripts/final-render.ts` — render utility CLI.

→ **Hành động khuyến nghị**: round sau audit từng file: (a) đã được supersede bởi CLI promoted (Round 26/27) → xóa; (b) còn dùng → move sang `packages/*/src/` hoặc commit có chủ đích; (c) explicit scratch → giữ untracked + thêm `.gitignore` pattern.

*Nhóm B — Runtime/artifacts KHÔNG commit*:
- `production/_commerce/shopee_link_registry.json` — **CẢNH BÁO SENSITIVE: chứa `credential_token=...` + `gads_t_sig` trong canonical URLs**. Đề xuất round sau bổ sung `.gitignore` pattern `production/_commerce/*.json` và move registry sang `.secrets/` hoặc `data/`.
- `production/_commerce/shopee_product_candidates.json`, `*_with_links.json`, `*_selection_report.json`, `*.last_error.json` — runtime extraction state.
- `production/archive/` — output zip từ reel archive packager.
- `production/batch_001/yt_005/voice_sync_v0_preset1/`, `production/batch_001/yt_006/`, `production/batch_001/yt_012/voice_sync_v0/`, `production/batch_001/yt_014/demo_match/sources/` — runtime artifacts batch (`.gitignore` đã cover media `.mp4/.mp3/.wav/...` nhưng JSON manifest chưa).

→ **Hành động khuyến nghị**: round sau bổ sung `.gitignore` pattern `production/**/*.json` (hoặc allowlist cụ thể nếu vài JSON cần commit làm reference).

*Nhóm C — Cần user quyết*: kết quả audit Nhóm A — script nào còn giá trị, script nào đã chết.

**Commit/Push trong phiên sync này**:
- Phiên sync chỉ cập nhật `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md`.
- KHÔNG commit runtime artifacts. KHÔNG commit untracked scripts. KHÔNG push.
- HEAD local sau khi user duyệt commit doc-only sẽ là `9921431 + 1`.

---

### ✅ Round UI-01 — VFOS Studio Multi-Channel Dashboard UI Shell: ĐÃ CHỐT (2026-06-02)

**Ngữ cảnh**: Cung cấp giao diện dashboard (UI shell) đa kênh cho VFOS Studio để Operator dễ dàng theo dõi, biên tập kịch bản, quản lý kênh, sản phẩm, và publish trạng thái của các chiến dịch.

**Mục tiêu**: Thiết lập cấu trúc giao diện Dashboard/Studio với đầy đủ các view chức năng (Overview, Channels, Products, Script, Raw Visual, Render, QA, Publish, Schedule, Analytics, Create).

**Files đã commit**: `apps/studio/`, `biome.json`, `pnpm-lock.yaml`.

**Kết quả verify**:
- `pnpm --filter @vfos/studio typecheck` -> PASS
- `pnpm --filter @vfos/studio build` -> PASS
- `biome check apps/studio/src` -> PASS (với các warning style `noDefaultExport` được định nghĩa trong `biome.json` cho các page/layout Next.js).
- Web App chạy thành công tại `http://localhost:3002`.

**Commit mốc**: `335aef0` (`feat: add VFOS Studio multi-channel dashboard UI shell`). UI Strategy 01 (Operator Overview Dashboard cho lane Review sản phẩm) chốt ở `dc07090`.

---

### ✅ Round UI-02 — Wire Operator Dashboard với job thật (read-only): ĐÃ CHỐT (2026-06-02)

**Ngữ cảnh**: Sau UI Strategy 01 (dashboard UI shell + Operator Overview, chốt ở `dc07090`), toàn bộ dashboard vẫn chạy mock data. UI-02 nối Operator Dashboard với **dữ liệu job thật** theo chế độ **read-only**, giữ nguyên giao diện đã duyệt.

**Mục tiêu**: Operator Dashboard đọc job thật từ hệ thống `scripts/vfos-job-manager.ts` (registry + manifest + cleanliness/ffprobe report) qua Next route handlers `/api/studio/*`, dùng adapter map vào component hiện có. Không side effect, không approve/reject thật, không publish, không gọi API ngoài.

**Đã làm**:
- Adapter server-only `apps/studio/src/lib/studio-data/` (`paths.ts`, `types.ts`, `jobs.ts`) — đọc `data/temp/vfos_jobs_registry.json` + `data/temp/jobs/<id>/job_manifest.json` + `runs/<id>/source/ffprobe.json` + product card. Chỉ đọc JSON nhỏ, fallback an toàn, **không expose raw path/URL/token**.
- 4 GET route handler `force-dynamic`: `/api/studio/overview`, `/api/studio/jobs`, `/api/studio/jobs/:jobId`, `/api/studio/jobs/:jobId/preview` (media stream, Range-aware, chống path traversal).
- Wire 3 component overview: `operator-job-queue.tsx` (job thật + loading/empty/error + preview thật + badge map state thật + pipeline checklist), `product-queue.tsx` (product thật, **chỉ owner id + cờ valid, không expose URL affiliate**), `mock-banner.tsx` (phân biệt real vs mock).
- Owner validation `an_17376660568` giữ nguyên. Analytics/cluster/weekly/KPI/publish-readiness **vẫn mock** (đánh dấu rõ).

**Kết quả verify**:
- `pnpm --filter @vfos/studio typecheck` → PASS. `build` → PASS (4 route ƒ Dynamic). `biome check` file đổi → clean.
- Secret/path leak scan trên API JSON + DOM (credential_token, token, secret, `C:\`, `data/temp`, `runs/`, shopee URL) → **= 0**.
- Preview media: full 200 video/mp4 (5.5MB), Range 206, job không preview 404. Traversal id → 400.
- Browser review `http://localhost:3002`: dark dashboard (không HTML thô), 8 job thật render, 5 preview video thật, 0 console/page error, 0 failed request.

**Commit mốc**: `ee19e1c` (`feat(studio): wire operator dashboard to real job data (read-only, UI-02)`) — 10 files, không kèm docs/runtime/binary.

**Master Plan**: `docs/00_DIEU_HANH/VFOS_STUDIO_UI_MASTER_PLAN.md` (đã được Operator duyệt) — bản đồ UI tổng thể 7 phòng ban + roadmap 10 phase.

**Bước tiếp theo dự kiến (CHƯA làm nếu Operator chưa ra lệnh)**: **Phase 3 theo Master Plan — Approve/Reject an toàn**: POST `/api/studio/jobs/:id/approve|reject` gọi lại command `job:approve`/`job:reject` (không reimplement gate), approve chỉ khi `READY_FOR_OPERATOR_REVIEW` + QA PASS, reject bắt buộc notes, **không publish thật**. Kích hoạt nút Approve/Reject (hiện disabled placeholder).

---

### ✅ Facebook Affiliate Hub Integration Track (Hub 02–06): ĐÃ HOÀN TẤT (2026-06-04)

**Mục tiêu**: Đưa mô hình **multi-touch CTA** (Facebook Affiliate Hub native CTA + caption/comment/reply) vào Growth OS dashboard (`apps/studio`) như một lớp **kế hoạch CTA theo job**, giúp Operator nhìn 1 chỗ biết mỗi video sẵn bao nhiêu CTA, vai trò gì, readiness ra sao. Toàn track **read-only/mock/manual**.

**Đã có (data + UI)**:
- **`AffiliateCtaPlan`** (entity neo `jobId`) + `LinkRole` (HUB_NATIVE / CAPTION_LINK / PINNED_COMMENT / REPLY_LINK) + `computeCtaReadiness`, với **`ctaMode`** quyết định readiness rule:
  - `SINGLE_PRODUCT_REVIEW` — review 1 sản phẩm, **1 Primary CTA hợp lệ là đủ**.
  - `MULTI_TOUCH_NICHE` — ngách nhiều sản phẩm (câu cá, rửa xe…), dùng multi-touch đầy đủ.
  - `CONTEXTUAL_CONTENT` — content theo bối cảnh, linh hoạt.
- **`/publish`**: CTA Readiness card (Primary/Caption/Pinned/Reply + fallback).
- **`/comments`**: Reply CTA trong Draft Reply Assistant — `AffiliateCtaPlan` quyết link nào, `shouldIncludeLink` (intent-gated) vẫn quyết có gắn hay không.
- **`/analytics`**: CTA-role analytics **mock** breakdown (4 role + per-job table).
- **`/schedule`**: manual Hub tagging guide (Operator) + CTA readiness badge theo posting plan.

**Chiến lược đã chốt (KHÔNG ép cứng 2–3 link)**:
- Facebook Affiliate Hub là **native CTA chính nếu có**; caption/comment/reply vẫn là **fallback / lớp phụ**, không bị thay thế.
- **Review 1 sản phẩm không bị ép 2–3 link** — `secondaryCtas` được phép rỗng vẫn `ready`.
- **Ngách nhiều sản phẩm mới dùng multi-touch đầy đủ** (Primary + secondary + reply).

**Ranh giới an toàn (đã verify từng round)**: read-only/mock/manual — **không gọi Meta/Shopee/tracking API**, không publish/upload/reply/auto-reply, không browser automation gắn tag, **không dùng runtime link thật** từ `data/temp/jobs` trong fixtures, **không token/secret** (summary transport-safe, UI không dùng chữ "token"), không POST route, không DB. Affiliate owner giữ `an_17376660568`.

**Commit history Track (remote HEAD `b6bddd9`)**:

| Round | Nội dung | Commit |
|---|---|---|
| Hub 02 | `AffiliateCtaPlan` + `LinkRole` + `CtaMode` data model + fixtures + loader + validate + smoke | `1517083` |
| Hub 03 | CTA Readiness card ở `/publish` | `3e2206b` |
| Hub 04 | Reply CTA vào Draft Reply Assistant `/comments` | `53f9452` |
| Hub 05 | CTA-role analytics mock breakdown `/analytics` | `ec3cc3f` |
| Hub 06 | Manual Hub tagging guide + CTA readiness badge `/schedule` | **`b6bddd9`** |

---

### ✅ Real API 02A & 02B & 03 & 04A & 04B — Facebook Connector, Report Generator & Scheduler Automation Guide: ĐÃ HOÀN TẤT (2026-06-04)

**Mục tiêu**:
1. Triển khai Facebook API Preflight Capability Check (`Real API 02A`) và Facebook Insights Read-only Connector (`Real API 02B`) để truy xuất an toàn dữ liệu bài đăng Facebook thực tế.
2. Triển khai bộ sinh báo cáo tuần Weekly Growth Review Report (`Real API 03`) từ dữ liệu runtime/manual/API snapshots hiện có, xuất báo cáo `.json` và `.md` vào runtime gitignored.
3. Thiết lập chế độ `META_MODE=mock` bảo mật cao: không gọi Graph API, không ghi runtime API snapshot, không sinh random metrics và không lưu vào `api-performance-snapshots.json`.
4. Thiết lập UI cho phép tạo báo cáo trực tiếp từ giao diện Analytics (`Real API 04A`) và hiển thị lịch sử báo cáo cũ (Archives) với tính năng xem trước và sao chép Markdown trực tiếp.
5. Cung cấp hướng dẫn lập lịch Windows Task Scheduler vào sáng thứ Hai hằng tuần (`Real API 04B`) cùng script kiểm tra, xác thực an toàn `pnpm growth:weekly-report:verify`.

**Files đã commit/thêm**:
- `apps/studio/src/app/analytics/page.tsx`
- `apps/studio/src/app/api/studio/analytics/facebook-preflight/route.ts`
- `apps/studio/src/app/api/studio/analytics/facebook-insights/fetch/route.ts`
- `apps/studio/src/components/analytics/facebook-insights-fetch-card.tsx`
- `apps/studio/src/lib/growth-data/runtime-store.ts`
- `apps/studio/src/lib/growth-data/types.ts`
- `apps/studio/scripts/generate-weekly-report.ts`
- `apps/studio/src/lib/growth-data/weekly-report-generator.ts` (mới - 04A)
- `apps/studio/src/app/api/studio/analytics/weekly-report/generate/route.ts` (mới - 04A)
- `apps/studio/src/app/api/studio/analytics/weekly-report/archive/route.ts` (mới - 04A)
- `apps/studio/src/components/analytics/weekly-report-card.tsx` (mới - 04A)
- `apps/studio/scripts/verify-weekly-report-scheduler.ts` (mới - 04B)
- `docs/00_DIEU_HANH/HUONG_DAN_LAP_LICH_BAO_CAO_TUAN_VFOS.md` (mới - 04B)

**Kết quả verify**:
- `pnpm --filter @vfos/studio typecheck` -> PASS
- `pnpm growth:smoke` -> PASS
- `pnpm growth:weekly-report --dry-run` -> PASS
- `pnpm growth:weekly-report:verify` -> PASS
- `biome check` -> PASS
- Báo cáo tuần JSON và MD sinh thành công tại `data/growth/runtime/reports/weekly/` (đã gitignored). Giao diện Analytics hiển thị chính xác. Hướng dẫn lập lịch được thiết lập an toàn, không tự động tạo tác vụ bên ngoài.

---

### ✅ Real API 05A — TikTok API Capability Preflight: ĐÃ HOÀN TẤT + PUSHED (2026-06-04)

**Commit**: `8d18c9d` `feat(growth): add TikTok API capability preflight` — remote HEAD, đã push (origin/master = `8d18c9d`, sync 0/0).

**Mục tiêu**: Thêm **TikTok API Preflight/Capability check (read-only)** trong `/analytics`, song song Facebook Preflight (02A). Chỉ kiểm cấu hình TikTok dạng boolean, KHÔNG gọi API live, KHÔNG fetch metrics.

**Files đã commit (đúng 3 file)**:
- `apps/studio/src/app/analytics/page.tsx` — mount `<TikTokPreflightCard />`
- `apps/studio/src/app/api/studio/analytics/tiktok-preflight/route.ts` (mới) — GET local-only, sanitized boolean response
- `apps/studio/src/components/analytics/tiktok-preflight-card.tsx` (mới) — UI card, wording an toàn (KHÔNG dùng chữ secret/token)

**Ranh giới an toàn đã xác nhận (verify thật, không suy đoán)**:
- Route **local-only** (host không phải localhost → 403) + `force-dynamic`.
- Chỉ đọc `process.env.TIKTOK_*` để trả boolean `*Configured` — **KHÔNG log/return raw/masked** TikTok client key / private value (secret) / access value.
- Mode `disabled`/`mock` **KHÔNG gọi external TikTok domain** (Playwright verify: 0 request ra ngoài).
- Route response **chỉ boolean/sanitized**: `mode`, `clientKeyConfigured`, `clientSecretConfigured`, `accessConfigured`, `openIdConfigured`, `businessAccessConfigured`, `capabilityStatus`, `blockedReasons`, `checkedAt`.
- KHÔNG fetch metrics · KHÔNG upload/publish/comment · KHÔNG unofficial API/scraping/bypass.
- KHÔNG commit runtime/env/secret.

**Kết quả verify**:
- `pnpm --filter @vfos/studio typecheck` → PASS
- `pnpm growth:smoke` → PASS
- `pnpm --filter @vfos/studio build` → PASS (route = `ƒ Dynamic`)
- `biome check` 3 file → PASS
- Browser review (dev server sạch): HTTP 200, console error 0, page error 0, network failed 0, external TikTok 0, DOM không lộ secret/token.

**Bước tiếp theo đề xuất**:
- **Real API 05B — TikTok read-only connector**: CHỈ triển khai sau khi Operator xác nhận `TIKTOK_MODE=display` hoặc `business` + quyền/scope đủ. Nếu chưa chắc scope TikTok → làm **planning/checklist trước**, KHÔNG code connector.

---

### ✅ Real API 05C — TikTok Display API Read-only Connector (safe list-only foundation): ĐÃ HOÀN TẤT + PUSHED (2026-06-04)

**Commit**: `53ceea5` `feat(growth): add TikTok Display API read-only connector` — remote HEAD, đã push (origin/master = `53ceea5`, sync 0/0). Trước đó 05B = planning-only (không tạo commit).

**Mục tiêu**: Thêm **TikTok Display API read-only connector foundation** theo hướng an toàn list-only; đồng thời sửa weekly report để KHÔNG đánh giá sai clicks/conversions khi TikTok không cung cấp các metric đó.

**Files đã commit (đúng 6 file)**:
- `apps/studio/src/app/analytics/page.tsx` — mount `<TikTokInsightsFetchCard />`
- `apps/studio/src/app/api/studio/analytics/tiktok-insights/fetch/route.ts` (mới) — route local-only fetch
- `apps/studio/src/components/analytics/tiktok-insights-fetch-card.tsx` (mới) — UI card read-only
- `apps/studio/src/lib/tiktok/tiktok-client.ts` (mới) — module server-only, read-only `/v2/video/list/`
- `apps/studio/src/lib/growth-data/types.ts` — mở rộng `ApiPerformanceSnapshot` (source `tiktok_api`, `tiktokVideoId`/`platformPostId`, nullable jobId/postId)
- `apps/studio/src/lib/growth-data/weekly-report-generator.ts` — fix tách nguồn + availability-aware CTR/CVR + dedup key + decision guards

**Ranh giới an toàn đã xác nhận (verify thật)**:
- Chỉ **TikTok Display read-only**; thêm **TikTok Insights Fetch card** trong `/analytics`; route **local-only** `/api/studio/analytics/tiktok-insights/fetch`; module server-only `tiktok-client.ts`.
- Mode `disabled`/`mock`: **KHÔNG gọi TikTok API** và **KHÔNG ghi runtime snapshot** (verify: POST mock → file runtime vẫn absent, external TikTok request = 0).
- Mode `display`: chỉ read-only khi Operator bật env/mode đủ. `source=tiktok_api` **chỉ tạo khi live display fetch thật**.
- KHÔNG upload/publish/comment · KHÔNG unofficial API/scraping/bypass · **KHÔNG log/trả raw/masked** TikTok client key / private value / access value.
- `clicks/conversions/saves/impressions` của TikTok Display đánh dấu **unavailable** bằng `rawMetricAvailability=false` (không phải 0 thật).
- **Weekly report đã sửa**: tách `facebookApiSnapshots` vs `tiktokApiSnapshots`; CTR/CVR ra **N/A** khi clicks/conversions unavailable (không "0% giả"); dedup key gồm post id (TikTok unmapped không gộp nhầm); decision engine không kết luận TikTok CTR/CVR thấp khi metric unavailable.
- Runtime `data/growth/runtime/api-performance-snapshots.json` vẫn **gitignored**; KHÔNG commit runtime/env/secret/docs tạm.

**Kết quả verify**:
- `pnpm --filter @vfos/studio typecheck` → PASS
- `pnpm growth:smoke` → PASS
- `pnpm --filter @vfos/studio build` → PASS (route = `ƒ Dynamic`)
- `biome check` 6 file → PASS
- `pnpm growth:weekly-report --dry-run` → PASS (dữ liệu manual có click vẫn hiển thị đúng — không regression)
- Browser review (dev server sạch): HTTP 200, console 0, page 0, network 0, external TikTok 0, DOM không lộ secret/token.

**Bước tiếp theo đề xuất — TikTok Mapping Round**:
- Gắn `tiktokVideoId ↔ jobId / PublishedPost` để weekly report biết video TikTok nào thuộc job nào.
- **Operator-provided mapping trước** (không heuristic đoán bừa).
- Sau khi có mapping → dùng `/v2/video/query/` refresh chính xác theo `video_id` đã map.
- KHÔNG làm Business API/demographics trong bước tiếp theo.

---

### ✅ Phần 25 — Product Image 04B (capture ảnh tại extraction source): ĐÃ CHỐT + PUSHED (2026-06-05)

**Commit**: `963bc2a feat(shopee): capture product image through product card flow` (pushed, remote HEAD).

**Mục tiêu**: Để từ các lần Shopee CDP extraction sau, ảnh sản phẩm được capture ngay tại DOM card, chảy qua registry → Product Card → render trên `/create`. Phục vụ Operator so sánh sản phẩm khi đi tìm nguồn video Trung Quốc/Douyin/TikTok.

**Data flow đã thêm**:
```
DOM card img
→ registry.product_image_url
→ artifact.productImageUrl
→ selected_product_card.productImageUrl
→ API current-product-card productImageUrl
→ /create preview image
```

**Helper (single source of truth)**: `sanitizeProductImageUrl()` trong `packages/shopee/src/url-sanitize.ts` — trim, `//`→https, chỉ http(s), reject 12 chuỗi credential/tracking (credential_token, mmp_pid, utm_source, gads_t_sig, session, cookie…), validate URL. Có test trong `packages/shopee/tests/url-sanitize.test.ts`. Dùng ở extraction (Node boundary) + bridge + builder; route Studio có guard local defense-in-depth.

**Capture an toàn**: trong `discoverProductCards` (`extract-links-cdp.ts`) chỉ capture **raw** image URL trong `page.evaluate` (self-contained, KHÔNG closure Node helper theo DOM-helper contract), sanitize ở **Node** sau khi trả về.

**UI**: `/create` panel "Xem trước sản phẩm" dùng `<img>` **thường** (KHÔNG `next/image` — tránh cấu hình external `remotePatterns`), có `onError` fallback. Product Card thiếu ảnh → fallback **"Chưa có ảnh sản phẩm"**.

**Finding 04B-1 (HTTP no-auth image spike — FAIL an toàn)**:
- Public product page (`shopee.vn/product/<shopid>/<itemid>`, `-i.<shopid>.<itemid>`): HTTP 200 nhưng là **SPA shell/anti-bot**, KHÔNG có `og:image`/`twitter:image` (không server-render, không nhắc itemid, có captcha markers).
- No-auth `api/v4/item/get?itemid=&shopid=`: HTTP **403**.
- → Ảnh Shopee KHÔNG lấy được bằng HTTP no-auth từ ngoài session. Đã loại đường CDP re-attach riêng (rủi ro chạm session thật + dedupe skip + upsert không merge).

**Giới hạn trung thực**:
- **BABYJOY hiện CHƯA có ảnh** vì là Product Card cũ (extract trước khi có logic ảnh) → `/create` hiện fallback "Chưa có ảnh sản phẩm". **Đúng kỳ vọng.**
- Code path capture đã thêm nhưng **chưa chứng minh ảnh thật cho BABYJOY** (dedupe skip entry cũ + upsert không merge field vào duplicate).
- **Ảnh thật chỉ proof được ở lần Shopee extraction MỚI cho sản phẩm MỚI** khi DOM card có image URL hợp lệ.

**Test (báo trung thực)**:
- `@vfos/shopee test` PASS · `@vfos/studio typecheck` PASS · `@vfos/studio build` PASS · builder smoke (`--output data/temp/debug/card_test.json`) PASS (`productImageUrl: null` cho BABYJOY, registry + `selected_product_card.json` KHÔNG đổi).
- `@vfos/shopee typecheck` và `biome`: còn **baseline đỏ pre-existing** (lỗi ở code không thuộc round này: `extract-links-cdp` bubble-sort, `fetch-offers-cookie`, `secret-redaction`, `noExplicitAny` builder + CRLF môi trường repo-wide). Verify bằng git stash: **changeset thêm 0 lỗi/0 violation mới**. KHÔNG sửa baseline (ngoài scope).

**Bước tiếp theo (KHÔNG cần làm lại)**:
- KHÔNG chạy lại spike 04B-1 (đã biết kết quả FAIL).
- KHÔNG dùng CDP re-attach chỉ để backfill ảnh BABYJOY.
- Proof ảnh thật để dành lần Operator chạy Shopee extraction cho sản phẩm mới.

---

### ⚠️ Phần 26 — MILESTONE M1: Reels publish THẬT `job_20260609_001` lên Page "Review Nhà bạn": VISIBILITY_UNCONFIRMED (đính chính 2026-06-11)

**API publish thành công qua Graph readback = PASS kỹ thuật ĐÃ ĐẠT (chuẩn 2026-06-12, xem Phần 27). Public visibility là kiểm tra bổ sung của Operator/nền tảng — đang UNCONFIRMED. Tick M1 (mốc kinh doanh) do Operator quyết khi xác nhận public.**

**Bằng chứng API publish (thật, không fake, không mock)**:

| Hạng mục | Giá trị |
|---|---|
| Job | `job_20260609_001` (địu EMOON, productId `53954087529`) |
| Page | "Review Nhà bạn" (xác thực qua Graph precheck read-only) |
| postId/videoId | `1028983246151885` |
| Permalink | `https://www.facebook.com/reel/1028983246151885/` |
| Graph readback | `GET /{video_id}?fields=id,permalink_url,published,privacy,status` → id + permalink thật, published=true, privacy=EVERYONE, status=ready, `verifiedByGraphReadback: true` |
| Nằm trong endpoints | `/video_reels`, `/videos`, `/published_posts`, `/feed` |
| Affiliate link trong description | `https://s.shopee.vn/LkjNhcNaD` (owner `an_17376660568`) |
| Video | `preview_with_captions_v2.mp4` (28.08s, 9:16, QA PASS, có audio) |
| Publish lúc | 2026-06-11T07:24:36Z |
| **apiPublishConfirmed** | **true** |
| **publicVisibilityConfirmed** | **false** |
| **publishVisibility** | **UNCONFIRMED** |

**Vấn đề phát hiện**: Operator dùng nick ngoài (không phải admin) mở permalink trực tiếp **không thấy** Reel. Mọi field Graph API đều xanh, nhưng Facebook có thể hold distribution (ví dụ: review chất lượng, policy check nội bộ, new Page restriction) mà không expose qua API.

**Đính chính commit `4ddb643`**: trước đó ghi "M1 ĐÃ ĐẠT" — premature vì chỉ dựa Graph readback mà chưa xác nhận bằng nick ngoài. Bằng chứng Graph readback vẫn hợp lệ, không xóa; nhưng KHÔNG đủ để tick M1.

**Đường đi của vòng publish**:
1. Uploader Reels thật `packages/facebook/src/publish-reels.ts` (commit `6548b4a`): 3-phase start → rupload binary → finish, poll processing, **readback verify bắt buộc** trước khi claim success. KHÔNG mock-success, KHÔNG random ID (hậu quả sự cố fake publish 2026-06-11 sáng — file fake đã cách ly `.bak`).
2. Dry-run 14/14 preflight gates PASS (PACKAGED + APPROVED + QA PASS + package manifest + captioned preview + audio + affiliate link + readiness + safety locks false + credentials + staged-risk clean).
3. Lần LIVE đầu fail an toàn ở precheck: token hết hạn (OAuthException 190) — đúng thiết kế, 0 byte upload, manifest giữ nguyên. Operator refresh token (monitor hash `.env` tự phát hiện, không đọc/log token).
4. Lần LIVE thứ hai: upload + processing + readback verify thành công → manifest `PUBLISHED`, safety locks `facebookApiCalled/uploaded/published = true` (chặn double-publish).

**Artifacts runtime (gitignored, không commit)**:
- `data/temp/jobs/job_20260609_001/facebook_publish_status.json` — postId + permalink + verifiedByGraphReadback + `publishVisibility: UNCONFIRMED`.
- `production/archive/job_20260609_001/facebook_publish_result.json` — caption, hashtags, affiliate link, verification incl. `publicVisibilityConfirmed: false`.
- `data/temp/jobs/job_20260609_001/job_manifest.json` — state PUBLISHED, `publishVisibility: UNCONFIRMED`.

**Lưu ý vận hành cho lần sau**:
- `FACEBOOK_PAGE_ACCESS_TOKEN` là token ngắn hạn theo session (hết hạn ~1-2h) → cân nhắc long-lived token (~60 ngày) trước đợt publish kế.
- Mọi publish kế tiếp vẫn đi qua đủ cổng: PACKAGED + APPROVED + QA PASS + `--confirm-live-publish` + `META_MODE=live`. Safety lock per-job chặn đăng lại.
- **KHÔNG publish lại job_20260609_001.** Safety locks giữ nguyên.

**Phân định trách nhiệm (chuẩn 2026-06-12 — "Graph xanh = API publish")**:
- **PASS kỹ thuật (VFOS/Claude)**: videoId/postId + permalink + Graph readback verify — **ĐÃ ĐẠT** cho reel này. Không fake success.
- **Kiểm tra bổ sung (Operator/nền tảng)**: nick ngoài xem được công khai → Operator nâng `publishVisibility` lên `PUBLIC_CONFIRMED` và tick M1. Việc này KHÔNG phải điều kiện PASS mà Claude tự chịu trách nhiệm và KHÔNG chặn các vòng kỹ thuật kế tiếp.

**Bước tiếp theo**: Operator theo dõi public visibility reel `1028983246151885` (kiểm tra bổ sung). Pipeline kỹ thuật tiến tới M3 (click affiliate đầu tiên qua `https://s.shopee.vn/LkjNhcNaD`) theo lệnh Operator.

---

### ✅ Phần 27 — Chuẩn publish Facebook mới: "Graph xanh = API publish" — bỏ public visibility khỏi điều kiện PASS chính: ĐÃ CHỐT (2026-06-12)

**Quyết định Operator**: PASS kỹ thuật của Claude/VFOS cho publish Facebook chỉ cần **API publish có bằng chứng thật** — videoId/postId + permalink + Graph readback verify. Public visibility (nick ngoài xem được) là **kiểm tra bổ sung của Operator/nền tảng**, không phải điều kiện PASS mà Claude tự chịu trách nhiệm — Facebook có thể hold distribution không expose qua API, nằm ngoài tầm kiểm soát kỹ thuật của VFOS.

**Những gì KHÔNG đổi (chống fake success vẫn nguyên)**:
- `success`/`verified` trong `publish-reels.ts` vẫn CHỈ true khi Graph readback trả id + permalink thật. KHÔNG mock-success.
- `publishVisibility` (UNCONFIRMED/PUBLIC_CONFIRMED/NOT_PUBLIC) vẫn được track riêng trong manifest/status/result — chỉ Operator nâng cấp.
- Safety locks job_20260609_001 giữ nguyên. KHÔNG publish/retry/upload lại.

**Wording/status đã sửa (không đổi logic gate, không đổi data schema)**:
- `scripts/job-facebook-publish-command.ts` — message LIVE success: "PASS kỹ thuật — đã đăng qua API"; visibility ghi rõ là kiểm tra bổ sung của Operator.
- `apps/studio/.../lanes/product-review/page.tsx` — PUBLISHED hiển thị "Đã đăng (API)" (green, PASS kỹ thuật) thay vì amber "chờ public"; nút kết quả luôn success khi API publish confirmed; note visibility chuyển thành kiểm tra bổ sung, không còn câu "chưa coi là đăng thành công".
- `apps/studio/.../publish-facebook/route.ts` — comment GET preflight cập nhật semantics.
- `docs/VFOS_NORTH_STAR.md` — bảng M1 + box Phần 5: tách PASS kỹ thuật (VFOS/Claude) vs kiểm tra bổ sung (Operator/nền tảng); tick M1 là quyết định Operator.
- File này — header + Phần 26 đồng bộ chuẩn mới.

**Giới hạn trung thực**: M1 (mốc kinh doanh) vẫn CHƯA tick — `publishVisibility=UNCONFIRMED`, chờ Operator xác nhận bằng nick ngoài. Chuẩn mới chỉ phân định trách nhiệm, không tự nâng trạng thái visibility.

> **Cập nhật 2026-06-12 chiều**: runtime `facebook_publish_status.json` của job_20260609_001 đã ghi `publishVisibility=PUBLIC_CONFIRMED` (phát hiện qua preflight GET). Tick M1 chính thức trong North Star chờ Operator xác nhận nguồn gốc nâng cấp này.

---

### ✅ Phần 28 — Token Facebook dài hạn + Command Center loop fixes + UI Architecture V1 Phase A–D: ĐÃ CHỐT (2026-06-12)

**1. Token Facebook DÀI HẠN (~59 ngày) — ĐÃ CHẠY THẬT**:
- `pnpm facebook:get-page-token` (commit `781cc42`) nâng cấp: debug_token → `fb_exchange_token` dài hạn → verify type/Page ID/hạn TRƯỚC khi tự ghi `.env`. Guard chặn ghi nếu token vẫn ngắn hạn (<7 ngày) hoặc sai Page.
- Kết quả thật: Page token "Review Nhà bạn" hạn **2026-08-10 (~59 ngày)**, verify `pnpm facebook:test` PASS. `.env` cần `META_APP_ID`/`META_APP_SECRET` (đã có hướng dẫn trong `.env.example` + operator guide mục 10).
- Sự cố trong vòng: Operator dán nhầm token/App ID vào `.env.example` (file commit được) — **đã gỡ sạch bằng git restore TRƯỚC khi có commit nào**, không lộ gì lên remote. Bài học: secrets CHỈ dán vào `.env`.

**2. Command Center loop fixes (commit `691146a`)**: per-job state reset khi đổi job (chống fake success video #2), preflight cho job PUBLISHED + map publishStatus (khôi phục permalink/visibility sau reload), timeout 15s cho load(), auto-resume preparePost chỉ chạy đúng state APPROVED (hết race), Action 3 nhất quán cho job đã đăng, banner/wording stale sửa hết. Dev server crash worker (mọi route `[jobId]` 500) xử lý bằng `pnpm studio:dev:clean`.

**3. UI Architecture V1 (spec: `docs/00_DIEU_HANH/VFOS_UI_ARCHITECTURE_V1.md`, Operator duyệt)**:
- **Phase A+B (commit `ca7ee16`)**: Tổng quan chỉ data thật (gỡ 7 panel mock), wording content-led, CTA về lane; sidebar 9→6+1 mục (gộp 2 stub vlog thành lane "Nội dung / Giải trí" roadmap, gỡ /publish + /schedule mock khỏi nav); stepper vòng lặp 9 bước + Completion panel "Bắt đầu video mới" trong lane.
- **Phase C (commit `dccdcbb`)**: màn `/history` "Lịch sử & Evidence" — read-only, đọc job thật + publish evidence sanitized (postId/permalink/visibility), filter theo vòng đời, deep-link về lane. 0 POST.
- **Phase D (đang chờ Operator duyệt UI + commit)**: `config/channels.json` (Niche → Channel THẬT đầu tiên: Review Nhà bạn, không secret) + loader real-first (fixture chỉ khi config trống, không trộn) + API GET `/api/studio/channels` + trang "Ngách & Kênh" banner nguồn thật/bỏ nút giả + channel context chip trong lane.
- Còn lại: **Phase E** (Hiệu suất M3–M6 manual import) → **Phase F** (lane 2 thật).

**Bước tiếp theo duy nhất**: ~~Operator duyệt UI Phase D → chọn (a) Phase E, hoặc (b) video #2 end-to-end~~ Operator đã chọn (b) — xem Phần 29.

---

### ✅ Phần 29 — WAITING_FOR_OPERATOR auto-resume cho commerce:intake + Video #2 intake THẬT (job_20260612_001): ĐÃ CHỐT (2026-06-12 tối)

**1. Điều tra "regression" cơ chế chờ CAPTCHA (kết luận: không phải regression)**:
- Cơ chế "chờ Operator giải CAPTCHA rồi tự tiếp tục" (Round 27B human-assist, `waitForCaptchaResolution` + `detectCaptchaGuard` trong `packages/shopee/src/cdp-bootstrap.ts`, budget clamp 10–60s) nằm **bên trong extractor** (`extract-links-cdp.ts` guard trước extraction + guard sau click) — còn nguyên vẹn, không commit nào gỡ.
- `commerce:intake` orchestrator (sinh sau, Round P39) đặt **preflight gate không-có-wait** chắn TRƯỚC extractor: gặp login/captcha là exit SUSPENDED ngay → extractor (nơi có wait) không được chạy. Gap đường chạy, không phải mất code.

**2. Fix đã chốt (commit `13f7a13`, 1 file `scripts/commerce-intake-orchestrator.ts`)**:
- Preflight BLOCKED vì login/captcha → `WAITING_FOR_OPERATOR`: poll preflight read-only 8s/lần, budget 10 phút, chỉ tin artifact tươi (`generatedAt` check chống FATAL transient), tự resume flow cũ khi Operator xử lý xong. CDP đứt hẳn vẫn SUSPENDED env-fault như cũ; hết budget GIỮ WAITING_FOR_OPERATOR (không hạ FAIL). Status JSON ghi `waitingReason/waitingSince/lastPollAt/pollCount` (UI đọc được).
- Core extractor / preflight script / UI route **không đổi**. Typecheck file: 8 lỗi baseline → 1; biome 8 → 7 (0 vi phạm mới).

**3. Vá kèm (commit `ed7dfe3`, 1 file `scripts/vfos-job-manager.ts`)**:
- `saveManifest()` gọi `syncManifestArtifacts()` từ commit `f467f44` nhưng **thiếu import** → mọi lần save manifest qua CLI sẽ crash ReferenceError. Đã thêm import + narrow `videoUrl` (2 lỗi type mới từ `66b8920`). Được kiểm chứng bằng job creation thật ngay trong vòng này.

**4. Video #2 intake THẬT — chạy end-to-end với cơ chế chờ mới (bằng chứng thật)**:
- Flow: login wall → Operator đăng nhập → captcha `shopee.vn/verify/captcha` → Operator giải → tab về catalog (lúc đầu kẹt ở `/dashboard`, 0 card; Operator đưa về Product Offer, 20 cards) → **poll 9 tự resume, không chạy lại lệnh**.
- Extraction: 1 click/5 → short link `https://s.shopee.vn/8fPwCYXwlg` — "Ghế hơi tập ngồi cao cấp phong cách Hàn Quốc (bé 4 tháng+)", shopid `1604253006` / itemid `27143940355`, owner `an_17376660568` ✅ verified, registry inserted (không duplicate), ảnh sản phẩm CHƯA capture (DOM không cho URL sạch — fallback đúng thiết kế).
- Card builder PASS → Audit PASS (0 mismatch, 0 duplicate) → **Job `job_20260612_001`** (run `run_job_20260612_001`), state `WAITING_FOR_SOURCE_VIDEO`.

**Giới hạn trung thực**: phần UI Command Center cho trạng thái chờ ("Đang chờ anh xử lý trong Cốc Cốc" + auto re-check + nút "Kiểm tra lại") CHƯA làm — là round riêng sau khi Operator duyệt. Ảnh sản phẩm job này chưa có.

**Bước tiếp theo duy nhất**: Operator tìm/tải source video phù hợp sản phẩm ghế hơi tập ngồi → thả vào `data/operator/video-downloads/` → `pnpm job:run-review --job job_20260612_001 --file "<video>.mp4" --confirm-ai` → xem preview → approve → package → dry-run (live publish là cổng duyệt riêng).

---

### ✅ Phần 30 — Phase 1: Channel→Job binding (Niche → Channel → Job hoàn chỉnh mắt xích Job): ĐÃ CHỐT (2026-06-13)

**Bối cảnh**: Vòng 12-Outcome Audit (cùng ngày, 5 sub-agent song song + orchestrator) xác định gap nhỏ-leverage lớn nhất: job manifest không có `channelId` → chuỗi Niche→Channel→Job đứt ở mắt xích Job, `suggestedChannel` trên DTO là mock string, gate `target_channel` pass vô điều kiện với tên kênh bịa "Kênh Review Sản Phẩm #1". Operator duyệt Phase 1 làm trước (giá trị cao nhất/rủi ro thấp nhất trong roadmap 8 phase).

**Commit**: `f6569fd` `feat(studio): bind channel to job` (6 file, +281/−36).

**Thiết kế đã chốt**:
- `scripts/vfos-job-manager.ts` — manifest thêm `channelId` (optional, null = job legacy); `job:create --channel <id>` validate kênh active lane product-review trong `config/channels.json`, sai → exit 2 `INVALID_CHANNEL`; không truyền → auto-bind khi lane có ĐÚNG 1 kênh active (default tường minh từ config, không floating), 0/≥2 kênh → null + warning yêu cầu `--channel`.
- `job-draft/route.ts` — nhận `channelId` optional, validate server-side CHỈ nhận kênh thật (`loadChannelsWithSource().source === 'real'`, không nhận fixture) → 400 `INVALID_CHANNEL`; response trả `channelId` đọc lại từ manifest.
- `jobs.ts` + `types.ts` — DTO thêm `channelId`; `suggestedChannel` = tên kênh thật từ manifest+config, job legacy = `(chưa gán kênh)` (gỡ mock string); gate `target_channel` check thật: kênh bind theo job → pass, legacy → kênh mặc định lane có ghi chú, không kênh → fail; gỡ hằng `FALLBACK_CHANNEL` bịa.
- Lane UI `page.tsx` — gửi `channelId` khi tạo job (cả 2 đường prep + CREATE JOB), chỉ nhận channel `source === 'real'`; chip "kênh: Review Nhà bạn" (blue) / "chưa gán kênh" (amber) ở khu chọn Job; success box hiện channel; banner kênh lane ghi "job mới sẽ bind vào kênh này".
- `publish-command-center.tsx` — fallback tên kênh bịa → `(chưa gán kênh)`.

**Evidence thật (không suy đoán)**:
- typecheck PASS · build PASS · biome 5 file studio: baseline HEAD 10 lỗi → 9 lỗi (0 vi phạm mới, giảm 1 nhờ gỡ mock hack; lỗi còn lại = CRLF/lint baseline repo-wide).
- CLI dry-run 3 case: auto-bind `ch_fb_review_nha_ban (Review Nhà bạn)` exit 0 ✓; `--channel` explicit exit 0 ✓; kênh giả exit 2 `INVALID_CHANNEL` ✓.
- API bad path: POST channelId giả → HTTP 400 `INVALID_CHANNEL`, không tạo job ✓.
- **UI proof end-to-end (Playwright drive UI thật, Operator yêu cầu trước commit)**: tạo job qua lane UI → `job_20260612_002` manifest có `"channelId": "ch_fb_review_nha_ban"` ✓; chip "kênh: Review Nhà bạn" hiển thị cho job mới ✓; console 0 error, 0 page error ✓. Screenshot: `data/temp/debug/phase1_proof_*.png` (runtime, không commit).
- Publish queue legacy jobs: gate "Target Channel Selected" pass với tên kênh THẬT "Review Nhà bạn" (kênh mặc định lane, có ghi chú job chưa gán kênh).

**Ghi chú vận hành**:
- `job_20260612_002` là **proof job** (sourceVideoUrl = `https://example.com/vfos-phase1-ui-proof`, state WAITING_FOR_SOURCE_VIDEO) — KHÔNG chạy production trên job này; source gate chặn sẵn. Operator có thể giữ làm evidence hoặc bỏ qua.
- Job legacy (kể cả video #2 `job_20260612_001`) KHÔNG backfill channelId — hiển thị trung thực "(chưa gán kênh)"; backfill là quyết định Operator round sau nếu cần.
- Selector nhiều kênh chưa làm (lane mới 1 kênh active — tránh YAGNI, ra đời cùng kênh thứ 2).

**Bước tiếp theo**: (a) Operator tiếp tục video #2 end-to-end (`job_20260612_001`, xem Phần 29), hoặc (b) chọn phase kế từ roadmap: P2 Batch queue v0 / P3 Tracking M3–M6 manual import thật. Operator quyết.

> **2026-06-13: Operator chọn (b) → làm P3 trước (xem Phần 31). Phase 1 đã push lên remote `fix/shopee-modal-read`.**

---

### ✅ Phần 31 — P3: Tracking M3–M6 Manual Import THẬT (evidence click/đơn theo kênh): ĐÃ CHỐT (2026-06-13)

**Bối cảnh**: Roadmap 12-Outcome Audit chọn P3 sau Phase 1. Mục tiêu: biến outcome 5 (Evidence & Tracking M3–M6) từ PARTIAL → có đường nhập số THẬT để Operator ghi click/đơn từ Shopee dashboard + Meta Business Suite, breakdown theo kênh (dùng channelId bind từ Phase 1).

**Phát hiện audit (đính chính báo cáo Agent C vòng audit)**: form CSV nhập số (`ManualInputPreview`) + save route guarded ĐÃ tồn tại từ round Real Analytics 02B. Gap thật là: (1) section "Evidence" đọc **fixture** thay vì runtime store → Operator lưu xong không thấy số; (2) save route hardcode `channelId: null` + `facebookPostId: null`; (3) `knownJobIds` từ fixture (sai cảnh báo cho jobId thật); (4) chưa breakdown per-channel.

**Commit**: `8266c47` `feat(studio): real M3-M6 evidence from runtime with channel breakdown` (3 file, +159/−27).

**Đã làm**:
- `manual-performance/save/route.ts` — `resolveJobBinding(jobId)` server-side: **channelId** từ `job_manifest.json` (Phase 1) + **facebookPostId** public từ `facebook_publish_status.json` (block `facebook.postId` — chỉ id công khai, không token). Job legacy → null trung thực, không đoán.
- `analytics/page.tsx` — section đọc `readRuntimeStore()` (số Operator đã lưu) thay vì fixture; `knownJobIds` thêm job thật từ registry; map tên kênh chỉ từ config thật (`source === 'real'`).
- `manual-performance-section.tsx` — đổi tên card "Evidence M3–M6 — Số liệu Operator đã lưu (local runtime)"; bảng mới "Theo kênh (M3–M6)" (Views / Clicks M3 / CTR / Đơn M4 / CVR per channel); cột Kênh + postId thật trong bảng post-level; gỡ nút chết "Nhập số liệu (sắp có)".

**Evidence thật (test, không suy đoán)**:
- typecheck PASS · build PASS · biome 3 file: baseline 3 lỗi → 1 lỗi = 0 vi phạm mới.
- UI proof (Playwright drive form thật): paste CSV 2 dòng → Validate → Save → reload → section hiện data + breakdown kênh; **0 console error**. `job_20260612_002` resolve `channelId=ch_fb_review_nha_ban`; `job_20260609_001` resolve `facebookPostId=1028983246151885` (Reel publish thật). Bug shape lồng `facebook.postId` phát hiện qua proof lần 1, đã fix.
- Runtime store sau proof đã **restore** về demo gốc rồi **dọn sạch** (Operator chọn (a)): `data/growth/runtime/manual-performance-snapshots.json` giờ `snapshots: []`. Backup demo: `data/temp/debug/mps-demo-backup-20260613.json` (runtime, gitignored). Empty-state UI verified: hiện "Chưa có dữ liệu thật", 0 console error (sau `pnpm studio:dev:clean` fix 500 chunk corruption — không phải lỗi code).

**Flow nhập số thật của Operator từ giờ**: Shopee Affiliate dashboard (clicks/đơn link `s.shopee.vn/LkjNhcNaD`) + Meta Business Suite (views) → `/analytics` → paste CSV 1 dòng cho `job_20260609_001` → Validate → Save → số hiện ở card Evidence với postId thật + kênh. Đây là đường ghi evidence M3 (click) / M4 (đơn) đầu tiên.

**Giới hạn trung thực**: doanh thu M5 chưa có cột riêng (ghi vào note khi nhập, field sau); job legacy chưa backfill channelId (hiện "(chưa gán kênh)"); chỉ Facebook (TikTok tracking là roadmap).

**Bước tiếp theo**: (a) Operator nhập evidence thật khi có click/đơn từ Shopee dashboard, hoặc (b) tiếp video #2 `job_20260612_001`, hoặc (c) phase kế P2 Batch queue v0 / P4 Publish safety scale. Operator quyết.

---

### ✅ Phần 32 — P4: Publish Safety Scale (token expiry check + retry-verify-only): ĐÃ CHỐT (2026-06-13)

**Bối cảnh**: Roadmap 12-Outcome Audit chọn P4 sau P3. Mục tiêu: cứng hóa publish lặp lại khi scale nhiều video/kênh, đóng 2 gap an toàn THẬT mà không đổi Core Action 1 (publish flow đang tốt).

**2 gap thật được đóng**:
1. **Token Page hết hạn giữa chừng**: trước P4 chỉ lộ khi precheck connection fail (chậm, mơ hồ). Giờ preflight đọc OFFLINE file meta → LIVE mode CHẶN ngay trước upload nếu token đã hết hạn (exit 17), cảnh báo nếu sắp hết hạn/chưa rõ. Token thật hạn ~10/08/2026 (~59 ngày) → "healthy".
2. **Job kẹt `uploaded=true/published=false`** (Graph readback fail/timeout): trước P4 bị safety-lock chặn vĩnh viễn. Giờ persist `pendingVerifyVideoId` + `--retry-verify` chỉ chạy LẠI readback của đúng video đó (KHÔNG re-upload); verified → flip PUBLISHED qua helper `finalizePublishSuccess` dùng chung với LIVE success (chống divergence).

**Commits** (2, chưa push — Operator chỉ 1 máy):
- `f8b29d5` `feat(facebook): token expiry health check + verify-only readback` (6 file, +358/−4)
- `172ae3a` `feat(publish): retry-verify-only path + token gate for stuck uploads` (1 file, +252/−51)

**Đã làm**:
- `packages/facebook/src/token-health.ts` (MỚI) — module PURE (no fs/network): `classifyTokenExpiry()` → expired/expiring_soon/healthy/never/unknown + cờ `block`; `buildTokenExpiryMeta()`/`parseTokenExpiryMeta()`. `tests/token-health.test.ts` (MỚI, 11 test).
- `packages/facebook/scripts/get-page-token.ts` — sau khi refresh token thành công, ghi `data/temp/facebook_token_meta.json` (gitignored; CHỈ pageId công khai + expiry + verifiedAt — **KHÔNG token/secret**).
- `packages/facebook/src/publish-reels.ts` — `verifyReelPublished(token, videoId)` read-only, chỉ Graph readback phase-5, gated META_MODE=live, không re-upload. `index.ts` export token-health + verifyReelPublished. `package.json` thêm script `test`.
- `scripts/job-facebook-publish-command.ts` — token gate (LIVE: expired→exit 17 block, expiring_soon/unknown→warn; PREFLIGHT: hiển thị health), `pendingVerifyVideoId` persist khi partial upload fail, `--retry-verify` branch, helper `finalizePublishSuccess`. Exit code mới: 17 TOKEN_EXPIRED · 18 RETRY_VERIFY_NEEDS_LIVE · 19 NOTHING_TO_VERIFY · 20 NO_PENDING_VIDEO_ID · 23 RETRY_VERIFY_FAILED.

**Evidence OFFLINE (test thật, KHÔNG live API, KHÔNG publish)**:
- facebook typecheck EXIT 0 · build EXIT 0 · token-health **11/11 pass** · biome 4 file modified = baseline (0 vi phạm mới) · 2 file mới clean sau import-sort.
- Guard paths: `--retry-verify` thiếu `--confirm-live-publish` → exit 18 (không API); `--retry-verify --confirm-live-publish` + META_MODE=mock → exit 15 "KHÔNG có API call" (không API); `--dry-run` job PACKAGED → exit 0 (full import graph load).
- Token health display: meta file ghi bằng Node (no-BOM) → phân loại đúng cả 4 trạng thái unknown / healthy(~59d) / expiring_soon(3d) / expired; meta giả đã dọn sạch.

**Giới hạn trung thực — 3 path CHỈ Operator live-test được (cần live Facebook API, CHƯA chạy theo lệnh Operator)**: (1) LIVE token block exit 17 (cần META_MODE=live + token hết hạn thật); (2) retry-verify happy path (cần job kẹt thật + live readback); (3) get-page-token ghi meta (cần live `debug_token` — sẽ tự chạy lần tới Operator refresh token). Logic đã unit-test + compile; chưa quan sát trên API thật.

**Bước tiếp theo**: (a) Operator live-test 3 path trên khi muốn (`pnpm facebook:get-page-token` → `pnpm job:publish-facebook --job <id> --refresh-facebook-preflight` xem token "healthy"), hoặc (b) tiếp video #2 `job_20260612_001`, hoặc (c) phase kế P2 Batch queue v0. Operator quyết.

---

### ✅ Phần 33 — Fix gốc Source Intake demo/fallback (No-Go: cấm demo lọt clean-source approval): ĐÃ CHỐT (2026-06-13)

**Bối cảnh phát hiện**: Trong Product Review Command Center, job `job_20260612_002` (Ghế hơi tập ngồi) hiển thị Bước 2 "Rà soát hình ảnh (5 frame)" bằng **video người ăn căng tin** không liên quan sản phẩm + chip rose "Demo / Fallback Source", nhưng vẫn ở trạng thái có thể bấm "Duyệt nguồn sạch". Đây là vi phạm No-Go #6 (cấm dùng fallback/demo source để approve nguồn sạch job thật).

**Root cause** (trong `scripts/vfos-job-manager.ts` → `cmdIntakeClean`, URL mode):
- Khi browser download URL **fail**, code cũ **copy video mẫu `runs/job_20260602_003/source/clean_source_video.mp4`** vào job rồi `downloadSuccess = true`, `isFallback = true` → giả vờ thành công.
- Hệ quả: ffprobe pass → trích 5 frame từ demo → `state = SOURCE_READY` với `sourceMode: "fallback"` → **demo lọt thẳng vào bước duyệt nguồn sạch**.
- `job_20260612_002` dính vì mang **URL bogus `https://example.com/vfos-phase1-ui-proof`** (rớt lại từ lần Phase 1 create-job UI proof) → download fail → fallback demo. `job_20260606_011` (nước giặt) dính tương tự từ download douyin fail trước đó.

**Fix commit**: `d7a39e1` `fix(intake): stop demo fallback source entering clean-source approval` (1 file `scripts/vfos-job-manager.ts`, +31/−31, **chưa push** — Operator 1 máy).
- Bỏ hẳn nhánh copy demo trong catch của intake-clean: download fail = phân loại errorCode → `downloadSuccess` giữ false → `SOURCE_FAILED` → `state = FAILED` (exit 3). Bỏ biến `isFallback`; nguồn khi SOURCE_READY luôn `sourceMode: "direct"`.
- Thêm gate trong `cmdApproveCleanliness`: nếu `status=pass` và (`sourceMode === 'fallback'` hoặc `productionAllowed === false`) → chặn, exit **13** `SOURCE_IS_FALLBACK`. (Defense cho job cũ đã nhiễm.)
- Giữ nguyên defense downstream sẵn có: `isFallbackSource`, production gate (block khi fallback), publish gate `not_fallback_source`, UI chip cảnh báo.

**Invariant mới (BẮT BUỘC) cho Source Intake**:
1. **Download fail ⇒ FAILED / SOURCE_FAILED rõ ràng** — KHÔNG bao giờ fallback sang video mẫu.
2. **Demo / fallback / mock / fixture source KHÔNG được vào bước approve nguồn sạch** của job thật.
3. **KHÔNG tạo `clean_source_video.mp4` từ demo** khi job thật download fail (chỉ ghi khi có nguồn THẬT: download/file thành công).
4. **Production phải bị chặn** nếu source provenance là fallback/demo (`sourceMode==='fallback'` / `productionAllowed===false`) — gate ở intake→production, approve-cleanliness, và live publish.

**Remediation (runtime, gitignored — không commit)**:
- `job_20260612_002`: reset khỏi demo → `state = WAITING_FOR_SOURCE_VIDEO`, `source = {productCardPath, sourceVideoPath:null}`, URL bogus example.com đã xóa, demo artifacts `runs/job_20260612_002/source/` đã dọn.
- `job_20260606_011`: reset tương tự, **giữ URL douyin thật** để Operator nạp lại đúng nguồn.
- Registry sync; quét lại **0 job `sourceMode=fallback` còn lại**. (Lưu ý: `job_20260612_001` là job THẬT cùng sản phẩm ghế hơi đang chờ source; `_002` là bản test dư từ Phase 1 proof.)

**Proof (test thật, không production/publish)**:
- **UI (Playwright, dev server :3002)** chọn `job_20260612_002`: `Demo / Fallback Source` chip = ẩn; khối "Rà soát hình ảnh (5 frame)" = ẩn; `frame_img_count=0`; nhãn job = "Chờ Operator chọn nguồn"; hiện "Video nguồn chưa được tải" + RUN SOURCE INTAKE; **console_errors=[]**, page_errors=[]. Screenshot `data/temp/debug/proof_intake_002.png`.
- **Fail-path (job TEST riêng, URL bogus, fallback template `job_20260602_003` vẫn còn trên đĩa)**: intake-clean → `PROVIDER_RESULT_TIMEOUT` → `state=FAILED`, exit 3; `clean_source_video.mp4` **không tạo**; thư mục frames **không tạo** (0 frame); `report status=SOURCE_FAILED`, `sourceMode=(none)`. Test job đã dọn sạch.
- Biome `vfos-job-manager.ts`: baseline 65 → 64 (0 vi phạm mới); approve-cleanliness gate live-test trên job nhiễm trả đúng exit 13 (return trước khi ghi, không approve).

**Bước tiếp theo**: Operator nạp **source video THẬT** cho `job_20260612_001`/`_002` (ghế hơi): dán URL douyin/tiktok đúng sản phẩm → "Tải & clean nguồn" (giờ fail = báo lỗi rõ, không demo) → (sau Phần 34) mở thẳng Bước 3 production, Operator duyệt ở preview.

---

### ✅ Phần 34 — Bỏ human gate "Duyệt nguồn sạch" (Operator chọn hướng A — mô hình 5 bước): IMPLEMENT LOCAL, CHỜ OPERATOR DUYỆT UI + COMMIT (2026-06-13)

**Bối cảnh**: Operator chốt Product Review chuẩn = **5 bước**; Operator là người kiểm duyệt gắt nhất → bỏ hẳn human gate "Duyệt nguồn sạch / APPROVE SOURCE" giữa Bước 2–3. Cổng kỹ thuật DUY NHẤT ở nguồn = tải được video + clean logo TikTok (provider no-watermark). Operator duyệt hình ảnh/nội dung ở **preview (Bước 4)**.

**5 bước chuẩn**: (1) Chọn sản phẩm · (2) Dán link + "Tải & clean nguồn" · (3) Chạy production (script→voice→BGM→render→caption→QA) · (4) Xem preview (Operator duyệt) · (5) Đóng gói + publish. Ánh xạ vào 3-Action cũ: Action 2 = Bước 2+3+4.

**Phát hiện trung thực (đã ghi trong code/skill)**: KHÔNG có dò-logo tự động (khớp mục 5 "Watermark detection tự động — Chưa làm"). "Clean" = download qua provider no-watermark + trích frame **tham khảo**. Bỏ human gate ⇒ cam kết sạch logo dựa vào provider; bắt lỗi hình ảnh dời về preview. `cleanlinessStatus=WATERMARK_NOT_DETECTED` set tự động ở intake = "đã tải & clean (download-based)", **KHÔNG phải vision-verified**. Operator đã xác nhận ngữ nghĩa này.

**Đã sửa (CHƯA commit)**:
- `scripts/vfos-job-manager.ts` (`intake-clean`): success set `cleanlinessStatus='WATERMARK_NOT_DETECTED'` (was `'NEEDS_REVIEW'`) → production mở thẳng. Gate kỹ thuật = download + ffprobe (frame extraction = best-effort reference, không block). `cmdApproveCleanliness` đánh dấu DEPRECATED (chỉ còn CLI recovery, không wire UI).
- `apps/studio/.../product-review/page.tsx`: xóa UI gate (frames + APPROVE SOURCE + Duyệt/Từ chối nguồn) + handler `handleApproveCleanliness` + state `approveConfirmInput/cleanlinessNotes/submittingApprove`; Bước 2 còn 2 case (chưa clean → intake / đã clean → mở Bước 3); reword copy bỏ "duyệt nguồn sạch".
- `apps/studio/.../jobs/[jobId]/source-approve/route.ts`: **KHÔNG xóa** (Operator chốt giữ lại) — gỡ wiring khỏi UI + thêm banner **DEPRECATED**; chỉ còn recovery/debug-only, KHÔNG phải gate main-path.
- `vfos-product-review-workflow-skill/SKILL.md`: gỡ "Cleanliness approval gate" + state `WAITING_OPERATOR_SOURCE_APPROVAL` khỏi đường chính.

**Guard giữ nguyên**: không fallback demo/mock (Phần 33 intact) · URL persist vào manifest trước intake · download/clean fail = lỗi rõ, không success giả · production gate Rule 1/3/5 (clean-file/binding/owner/anti-fallback) giữ nguyên · không auto-publish.

**Verify (static, KHÔNG production/publish)**: `tsc -p` PASS; Biome page.tsx + job-manager **0 lỗi mới** (chỉ nợ pre-existing); route `/lanes/product-review` trả 200. **CHƯA browser-review tay + CHƯA commit** — chờ Operator duyệt UI :3002.

**Bước tiếp theo**: Operator mở `http://localhost:3002/lanes/product-review` duyệt UI 5 bước (không còn APPROVE SOURCE) → nếu OK, cho phép commit scoped (page.tsx + vfos-job-manager.ts + SKILL.md + source-approve route [deprecated banner, không xóa] + state doc).

---

### ✅ Phần 35 — Source Subtitle Scrub (tự động detect → XÓA phụ đề Trung → phụ đề Việt canh giữa dải): ĐÃ CHỐT + COMMIT (2026-06-16)

**Bối cảnh**: Video reup TQ thường có phụ đề Trung burned-in. Cần tự động nhận diện + xóa, rồi burn phụ đề Việt đúng vùng đã xóa, tích hợp vào pipeline render caption — KHÔNG làm demo rời.

**Kiến trúc (logic thuần, có test, không IO ở core)**:
- `scripts/subtitle-mask/detect-core.ts` — lọc CJK, gộp word-box→dòng, cluster theo thời gian, `consolidateBands` (phủ liên tục + bắc cầu gap OCR).
- `scripts/subtitle-mask/cover-filter.ts` — (A) lọc "dòng phụ đề" bằng **aspect-ratio** (rộng & thấp) + trần chiều cao 0.16 (phân biệt logo/khối, KHÔNG dùng chiều cao tuyệt đối); (B) `toUnifiedBands`: gom theo dải y, cover = **bề rộng phủ hết dòng thật (≈ dòng dài nhất) + pad nhỏ, CANH GIỮA theo tâm box OCR, kẹp ≤ `maxBandWidth` 0.88 (KHÔNG full-frame)**, Y/H median ổn định (mỏng, không nhảy). Đoạn OCR hẹp dùng chung width chuẩn → hết lòi 2 bên. delogo default, blur/solid fallback.
- `scripts/source-subtitle-detector.ts` — CLI `pnpm subtitle:detect` (ffmpeg sample frame → tesseract.js chi_sim → mask chuẩn hoá 0–1). Chỉ network = tải traineddata.
- `scripts/kinetic-caption-renderer.ts` — opt-in `--cover-mode`; canh phụ đề Việt giữa dải đã che (`centerPresetOnBand`); args `cover-max-h/min-aspect/band-mode/band-maxw/band-pad`.
- `scripts/review-video-orchestrator.ts` — **STEP 2.7 detect default-ON cho job mới**; guard tắt: `--skip-scrub-subtitle` HOẶC manifest `scrubSourceSubtitle=false`; best-effort (detect lỗi → render tiếp KHÔNG che). **Preview vẫn là cổng duyệt cuối; KHÔNG publish.**

**Đã verify thật (offline, không API ngoài)**:
- job_20260616_002 (gậy selfie, 576×1024): detect 43/44 frame → 11 đoạn delogo `x=43 w=477` (≈82.8% khung, dưới clamp 88%, KHÔNG full-frame), `y=756 h=85` (~8.3% mỏng, y hệt mọi đoạn), phủ 1s→21.5s. Operator xem preview 3 lần → **"Đạt yêu cầu"**: đầu video hết sót, giữa hết lòi 可/节, cuối không bỏ sót, không full màn hình, phụ đề Việt canh giữa dải.
- job_20260616_001 (áo chống nắng): bản scrub delogo full-pipeline (recover 429 — Vision skip) cũng READY_FOR_OPERATOR_REVIEW.
- Self-review: `pnpm test` **16/16 PASS** (detect-core + cover-filter); tsc 2 file code sửa 0 lỗi; biome chỉ `noNonNullAssertion` (baseline repo); detect-core không bị đụng ở vòng B-revised.

**Commit `74fc0c2`** (9 file, +1365/-44): 3 file mới (detect-core, cover-filter, source-subtitle-detector) + test + 2 script sửa + package.json/pnpm-lock/pnpm-workspace (tesseract.js, build script disabled). **KHÔNG commit**: runtime (data/temp, runs/, mask, mp4 demo), `source-intake/route.ts`, `source-url/`, `production/_media/bgm_library.json`, `implementation_plan.md`.

**Bước tiếp theo**: push branch `fix/shopee-modal-read` (commit `74fc0c2` + commit doc này). Sau push: (a) Operator chạy thêm job mới có phụ đề Trung để kiểm độ bền detect trên video khác, hoặc (b) chỉnh tinh (clamp %, pad, vị trí dải) nếu gặp ca lệch. Lưu ý ca biên: video chữ Trung trải gần hết khung → dải chạm trần 88% (vẫn không full-frame); delogo trên nền rối có thể để vệt mờ → cân nhắc fallback blur.

---

### ✅ Phần 36 — Nâng engine detect phụ đề Trung sang PaddleOCR text-detection (paddle 2.6 + mkldnn): ĐÃ CHỐT + PUSH (2026-06-16)

**Vì sao**: Phần 35 dùng tesseract.js (word-box) suy hình học → OCR **rớt ký tự mép** + lấy mẫu thưa → dải che hụt, **lòi 就/夹** ở 2 bên; phải chỉnh tay theo từng video (Operator bác). Cốt lõi: sai công cụ đo kích thước.

**Giải pháp (Operator chọn hướng B → B1 PaddleOCR)**: dò **VÙNG chữ** (DBNet text-detection) → polygon **ôm trọn cả dòng** (không rớt mép). Geometry (Y/H, width, tâm, thời gian) suy từ detection chính xác → **bỏ hẳn hằng số pad chỉnh tay**, tự thích nghi mọi cỡ/vị trí.

**Quyết định kỹ thuật (đo thật)**:
- paddle **3.x trên CPU buộc tắt mkldnn** (lỗi `onednn×PIR` — tắt PIR cũng không cứu) → ~3s/frame, video 60s ~6 phút. **Không scale.**
- → hạ xuống **paddlepaddle 2.6.2 + paddleocr 2.7.3 + mkldnn ON** (numpy<2 bắt buộc theo ABI) → ~0.3s/frame, **nhanh ~7-10×** (003: 102s→**15s**; ước 60s video ≈ **40s**).
- Frame OCR hạ 384px + 2fps (số box detect không đổi).

**Kiến trúc**: `tools/subtitle-detect-paddle/` (venv Python: `detect.py` PP-OCR det+rec lang ch → JSON polygon; venv/model/log **gitignored**, setup 1 lần ở README). `source-subtitle-detector.ts`: `--engine paddle` (default) gọi detect.py, **fallback tesseract.js** nếu thiếu venv/lỗi; `--det-width`, `--fps`. Mask schema giữ nguyên → cover-filter/detect-core **không đổi** (box paddle chính xác feed thẳng band-unify + clamp).

**Verify offline (KHÔNG OpenAI/ElevenLabs, KHÔNG publish) — 4 video**:
- 615_003 kẹp tóc (có phụ đề): dải `[0.229–0.810]` → render **sạch, hết lòi 就/夹** ✅
- 616_002 selfie (có phụ đề): 1 dải sạch, không hồi quy ✅
- 615_002 hộp/tủ lạnh (chữ CẢNH trên màn hình sản phẩm): **0 dải → không che → không phá sản phẩm** ✅
- 615_001 tiktok VN (không phụ đề Trung): **0 dải → không che nhầm** ✅

**Commit `43ab827`** (5 file, +315/-31): `source-subtitle-detector.ts` + `.gitignore` + `tools/subtitle-detect-paddle/{detect.py,requirements.txt,README.md}`. **KHÔNG commit**: `.venv/`, model cache, `_install*.log`, runtime mask/frame; và (ngoài scope) `source-intake/route.ts`, `source-url/`, `bgm_library.json`, `implementation_plan.md`. Self-review: tsc 0 lỗi · biome chỉ baseline · test 16/16 · preview vẫn là cổng duyệt.

**Bước tiếp theo**: (a) test thêm video mới (giờ ~15–40s/video), hoặc (b) nếu cần nhanh hơn cho scale lớn: cache model thường trú / giảm fps-zone, hoặc cân nhắc ONNX (B2) bỏ Python. Operator quyết.

---

### ✅ Phần 37 — Lane Giải trí (Entertainment / Fishing-Vlog) + TÁCH BRANCH CLEAN `feat/entertainment-lane-clean`: ĐÃ MERGE VÀO MASTER (PR #1, squash `e2d0a55`) (2026-06-23)

> **Vì sao mục này tồn tại**: toàn bộ lane Giải trí được phát triển trên nhánh `feat/entertainment-lane` SAU Phần 36 nhưng **chưa từng ghi vào file trạng thái trung tâm** (chỉ nằm ở memory `project_vfos_entertainment_lane_e1.md` + `VFOS_ENTERTAINMENT_LANE_SPEC.md`). Vòng này lấp lỗ hổng đó + chốt việc tách branch clean để các vòng sau KHÔNG quên.

**Lane Giải trí là gì** (North Star: reup vlog câu cá Trung Quốc → bản địa hóa tiếng Việt → đóng gói sẵn đăng TikTok VN):
- Engine `scripts/ent-vlog/` — pipeline `produce` (orchestrator `20-pipeline`) = **full chain**: `01-fetch-source → 02-asr-zh → 03-clip-mine → 03b-vision-anchor → 03c-moneyshot-coverage (GATE) → 10-montage-v2 → 12-voice-render → 13-source-bound (script v2 + Humor Layer) → 15-audio-ambient-full → 16-package`. (Legacy 04/05/07/08/09/11/11b/14 KHÔNG nằm trong produce chain.)
- UI Studio `/lanes/content` (E-UI-7/8/9): **đúng 4 nút** (Tải link · Sản xuất · Duyệt · Đăng), **1 cổng duyệt duy nhất** = Duyệt video (gộp cổng script), video chỉ hiện khi render XONG. Audio policy strict (bỏ giọng Trung/giữ ambient, `audioPolicyApplied` chặn GATE2+package nếu chưa apply). Anchors money-shot THẬT từ `catch_moments` + coverage gate.
- ElevenLabs `/with-timestamps` (caption sync): **opt-in qua env `ENT_TTS_PROVIDER`, default edge**; quota gate + per-chunk content-hash cache; FAIL honest (không fallback edge khi đã chọn elevenlabs). Script v2 (câu đủ ý 8–14 từ, giữ+localize meme Trung) + **auto Humor Reaction Layer** (whitelist, 3–5 reaction/video, chỉ ở money-shot) → QA gate 13/13 PASS. VO giảm −20% (`VO_VOL=0.8`).

**Việc vòng này — TÁCH BRANCH CLEAN** (nhánh dev `feat/entertainment-lane` đi **102 commit ahead master** + lẫn churn ngoài scope → không gọn để review/merge):
- Tạo `feat/entertainment-lane-clean` từ **master `bb683a1`** bằng **git worktree** (`../vfos-ent-clean`, không đụng working tree dev).
- **COPY-BY-PATH** (`git checkout feat/entertainment-lane -- <paths>`) → blob **byte-identical** feature (verify bằng SHA, KHÔNG cherry-pick).
- **6 commit**: `6dfa643` engine ent-vlog+caption/subtitle · `d921883` ElevenLabs client · `646d067` Studio UI/API/lib+nav · `48c621d` docs · `faa348f` chore (tests+niche config+tesseract.js dep) · `a4991f5` **fix nav** (repoint sidebar item 3 `/lanes/fishing-vlog`→`/lanes/content`, label "Nội dung / Giải trí" — khôi phục surgical repoint bị mất khi `reset --hard` ở vòng xử lý CRLF; KHÔNG lấy restructure channels/history của feature vì ngoài scope).
- **62 file, +11011/-58** vs master. Push origin → `a4991f5` → **PR #1 squash-merge vào master `e2d0a55`** (no conflict; review reviewer MERGE_OK).

**Tách sạch (verify diff + SHA)**: 0 file Product Review / Shopee / Facebook / job-manager / publish / growth / commerce / cn-search. 0 secret / runtime / media / binary. `pnpm-workspace.yaml` có `tesseract.js: false`.

**Validation (state đã commit)**: tsc `packages/voice` exit 0 · tsc `@vfos/studio` 0 error · node:test `source-subtitle` **16/16 PASS** · biome: lane code sạch, còn 3 format pre-existing ở legacy `11/11b/14` (non-produce, mang từ source). Lưu ý: repo norm là **CRLF** (master cũng CRLF, biome PASS trên CRLF) — `grep -cU $'\r'` trên Git Bash Windows KHÔNG đáng tin, dùng SHA blob để so byte-identity.

**Defect đã sửa trước khi push**: nav.ts trong worktree ban đầu bị trả về bản master (item 3 → stub `/lanes/fishing-vlog`) → lane thật `/lanes/content` mất link sidebar; commit `a4991f5` khôi phục.

**ĐÃ XONG (2026-06-23)**: PR #1 mở tay trên web (`gh` chưa cài) → squash-merge → master `e2d0a55`. Worktree `../vfos-ent-clean` đã `git worktree remove`. Branch clean merged (xoá được trên GitHub + local `git branch -D` vì squash).

**Còn lại (CHƯA xử lý)**: (1) 5 file dirty NGOÀI SCOPE trên dev branch (`source-intake/route.ts`, `source-url/`, `package.json`, `bgm_library.json`, `implementation_plan.md`) — quyết giữ/commit riêng/bỏ. (2) Nhánh dev `feat/entertainment-lane` (đa-lane) đã sau master — nếu dùng tiếp phải rebase/đối chiếu (lane Giải trí giờ đã ở master, tránh đưa lại). (3) Local master còn ở baseline cũ — `git fetch` đã cập nhật `origin/master`; sync local master khi cần checkout.

---

### ✅ Phần 38 — Phase 3 lane Giải trí: Đăng TikTok tự động — ROUND 1 (nền+mock) + ROUND 2 (ĐĂNG THẬT) HOÀN TẤT (2026-06-23 → 2026-06-24)

> **Mục tiêu Phase 3**: card 3 "Đăng lên TikTok" tự lấy video đã duyệt + caption + hashtag → gọi **TikTok Content Posting API** đăng thật, ghi proof/status vào job. **DoD** = đăng thật thành công 1 video qua API + proof + UI báo thành công. ✅ **DoD ĐÃ ĐẠT (Round 2, 2026-06-24)** — job `ent_squid_001` đăng thật 1 video, state `TIKTOK_POSTED`. Round 1 (dưới) là nền kỹ thuật + mock; Round 2 (cuối mục) là đăng thật.

**Branch / discipline**: nhánh MỚI `feat/entertainment-tiktok-publish` từ **`origin/master`** qua **git worktree** `../vfos-ent-tiktok` (không đụng dev branch + 5 file dirty + master). Commit `f9a2fa6` (8 file, +1274/−94) **đã push origin**, CHƯA merge/PR. KHÔNG `git add .`, không commit `.env`/runtime, không render/ElevenLabs/live TikTok.

**Kiến trúc (3 lớp, isolation)** — phát hiện nền: caption+hashtag ĐÃ tự sinh sẵn ở `16-package` → Phase 3 tái dùng; client cũ chỉ là Display read-only → cần Content Posting mới:
- `apps/studio/src/lib/tiktok/tiktok-publish-client.ts` (MỚI, additive — không sửa `tiktok-client.ts`/analytics/growth): Content Posting `init → upload(FILE_UPLOAD) → poll status` + `createMockTikTokPublishClient`. Pure (no alias `@/`).
- `apps/studio/src/lib/entertainment/publish.ts` (MỚI, PURE/dependency-injection): `publishToTikTok(deps,id,input)` + `computeReadiness` + toàn bộ guard — test nạp trực tiếp bằng mock deps/client, KHÔNG gọi live/không cần env.
- `apps/studio/src/lib/entertainment/jobs.ts` (sửa): states `TIKTOK_POSTING/POSTED/FAILED` + field `tiktok` + `getTikTokReadiness`/`setTikTokStatus`/`saveCaptionToPackage`/`buildPublishDeps` (đọc env server-side, **KHÔNG log/return token**) + reconcile bám `manifest.tiktok`.
- Routes (MỚI): `POST /jobs/[id]/tiktok-publish` · `GET /jobs/[id]/tiktok-readiness` (local-only, response **không token**).
- UI (sửa): `package-panel.tsx` → card "Đăng lên TikTok": readiness 5 đèn + caption preview/edit + nút **"Tạo caption"** (POST package hiện có) + **"Đăng lên TikTok"** + hiện `TIKTOK_POSTED`/thời gian/postId/shareUrl, lỗi sanitize. **Operator duyệt UI mock 2026-06-23.**

**Guard (11, chặn thật, no fake success)**: `NO_PREVIEW_GATE` (chưa duyệt GATE 2) · `NO_FINAL` · `NO_CAPTION` · `TIKTOK_DISABLED`/`TIKTOK_NOT_CONFIGURED`/`LIVE_NOT_ENABLED` · `ALREADY_POSTED` (cần `confirmRepost`) · `PUBLISH_BUSY` · `BUSY` (pipeline chạy) · `TIKTOK_API_ERROR` · `TIKTOK_AUTH_EXPIRED`. Client lỗi → ghi `TIKTOK_FAILED`, KHÔNG ghi POSTED.

**Manifest** (`ent_job.json.tiktok`, runtime gitignored, no token): `status·mode·publishId·postId?·shareUrl?·captionUsed·hashtagsUsed·startedAt·postedAt·error?` + trace `montage_v2/tiktok_publish.json`.

**Validation**: node:test **23/23 PASS** (guards/success/fail/isolation) · tsc `@vfos/studio` **0** · biome **lint 0** (line-ending là noise repo-wide: `core.autocrlf=true`, blob commit là LF — biome `check` sau `--write` cũng 0) · isolation: **0 import** Product Review/Shopee/Facebook/commerce/growth/job-manager/review-orchestrator · secret: **không log/commit token**, chỉ đọc `process.env`, message chỉ chứa TÊN biến · **KHÔNG gọi TikTok thật** (mock 100%, live chặn 2 lớp env).

**✅ ROUND 2 — ĐĂNG THẬT (DoD ĐẠT, 2026-06-24)**: job `ent_squid_001` đăng thật thành công 1 video lên TikTok qua Content Posting API.
- **Proof**: `ent_job.json` state=**TIKTOK_POSTED**, `tiktok.status=POSTED`, `publishId=v_pub_file~v2-1.7654841036543494165`, postedAt `2026-06-24T06:14:46Z`; trace `montage_v2/tiktok_publish.json` status POSTED, error null. Caption + 10 hashtag tự sinh. Video 70MB → 6 chunk × 10MB.
- **Privacy**: đăng **SELF_ONLY (chỉ mình xem)** vì app TikTok **chưa audit** → `postId`/`shareUrl` trống (bài private không có link công khai). Đúng kết quả mong đợi. Đăng **công khai** cần submit app cho TikTok audit (việc riêng, sau).
- **Setup TikTok thật**: App **Sandbox** (chưa audit), Login Kit + Content Posting API (**Direct Post ON**), scope `video.publish`, redirect_uri `https://khoakr1405-crypto.github.io/tiktok/callback`, Target User `chuyenvuidoday10`. OAuth do Operator tự login+consent (No-Go #4); helper `scripts/tiktok-oauth-helper.ts` (`pnpm tiktok:oauth url|exchange --code|refresh`) chỉ dựng URL + đổi code → ghi token vào `.env` (gitignored, KHÔNG log/commit token).
- **BLOCKER đã giải**: init trả `403 unaudited_client_can_only_post_to_private_accounts` DÙ đã ép `privacy_level=SELF_ONLY`. Nguyên nhân THẬT (không phải lỗi code): app chưa audit chỉ đăng được lên **tài khoản đang để Private**. Fix = Operator bật **Private account** trên app TikTok → đăng OK.
- **Code Round 2** (commit `3eb6788` worktree, +207/−31, CHƯA push/merge): `tiktok-publish-client.ts` thêm (0) `creator_info/query` lấy `privacy_level_options` trước init + **multi-chunk upload** (`CHUNK_SIZE_BYTES=10MB`, Content-Range mỗi chunk); runner `scripts/ent-vlog/tiktok-publish-run.ts` (MỚI) wire FS deps → `publishToTikTok` thật + client thật, không cần Next/`@/`, chạy bằng plain `node`. Validation: biome lint **0**, node:test **30/30**.
- **Token**: access_token = **24h** (TikTok không cho tự đặt 30/60/90 ngày); refresh_token = **365 ngày** → `pnpm tiktok:oauth refresh` lấy access mới, không cần login lại ~1 năm.

**Bước tiếp theo**: Commit `3eb6788` ĐÃ push origin. Nối nút UI thật → **Phần 39**. Đăng công khai cần submit app TikTok audit (việc riêng, sau).

---

### ✅ Phần 39 — Phase 3 lane Giải trí: NỐI NÚT "ĐĂNG TIKTOK" TRÊN UI STUDIO THẬT (2026-06-24)

> **Mục tiêu**: nút "Đăng lên TikTok" trên UI Studio đăng THẬT (UI → route → `publishToTikTok` → TikTok client thật), thay vì chỉ đăng được qua CLI runner. **DONE** — commit `9322f9f` trên `feat/entertainment-lane`.

**Vì sao cần round này**: Round 2 đăng thật qua **CLI runner** (chạy từ main repo lấy `.env`+data, *import* code worktree). Nút UI chưa đăng thật được vì **2 nhánh diverge, mỗi nhánh thiếu một nửa**: worktree `feat/entertainment-tiktok-publish` có code Phase 3 nhưng thiếu `.env`+data; main repo `feat/entertainment-lane` (nhánh chạy Studio, có `.env`+data+14 cải tiến lane) lại **thiếu code Phase 3**. → Operator chọn **đưa code Phase 3 về `feat/entertainment-lane`**.

**Đã làm (commit `9322f9f`, +1714/−92, KHÔNG đụng 5 file dirty WIP / package.json / spec)**:
- Mang **11 file** từ `3eb6788`: `publish.ts`, `tiktok-publish-client.ts`, 2 route (`tiktok-publish`/`tiktok-readiness`), `jobs.ts` + `package-panel.tsx` (áp SẠCH — giống hệt clean-master), oauth helper + CLI runner + 2 test. `jobs.ts`/`package-panel.tsx` parity với `e2d0a55` = no-conflict.
- **BUG phát hiện khi route chạy qua Next/webpack lần đầu** (trước chỉ test node:test + CLI runner): `instrumentation.ts` đọc `node:fs` → Next bundle instrumentation cho **edge runtime** → `UnhandledSchemeError "node:fs"` → mọi route **500**. **FIX**: bỏ `instrumentation.ts`, chuyển nạp `.env` gốc monorepo (`../../.env`) sang **`apps/studio/next.config.ts`** (chạy ở Node, KHÔNG qua webpack; additive, no-overwrite, không in giá trị).
- ⚠️ next.config đổi → Next **KHÔNG hot-reload** → **phải restart `next dev`** (Studio cổng 3002) thì env mới nạp.

**Xác minh qua Next dev THẬT** (port phụ 3009, KHÔNG đụng server 3002 của Operator):
- `GET tiktok-readiness` → **200**, `tiktokApiReady:true` (env nạp OK qua next.config) + data thật (`TIKTOK_POSTED`, publishId).
- `POST tiktok-publish` (không `confirmRepost`) → **409 ALREADY_POSTED** (guard chặn đăng trùng trên data thật) — **KHÔNG đăng video thứ 2**.
- Job không tồn tại → **404 NOT_FOUND**.
- biome lint **0** · tsc `@vfos/studio` **0** · node:test **30/30**.

**Để đăng video MỚI qua nút UI**: restart Studio 3002 → `/lanes/content` → chọn job **APPROVED mới** (ent_squid_001 đã POSTED nên guard chặn, phải `confirmRepost`) → "Tạo caption" → đèn "TikTok API sẵn sàng" sáng → "Đăng lên TikTok".

**Bước tiếp theo**: (1) Đăng **công khai** (hiện SELF_ONLY) → submit app TikTok audit (việc riêng, sau). (2) **Consolidation lớn về master**: gộp 14 cải tiến lane (`feat/entertainment-lane`) + Phase 3 vào master clean — cần **Step Inventory** (No-Go #9), để vòng riêng. (3) Worktree `feat/entertainment-tiktok-publish` vẫn còn `instrumentation.ts` lỗi — đồng bộ fix next.config nếu còn dùng.

---

### ✅ Phần 40 — POC scrub chữ Trung (Evidence Gate) → giữ delogo + recall tune ĐÃ ÁP (2026-06-29)

> **Mục tiêu**: trả lời bằng SỐ THẬT "scrub chữ Trung lane câu cá đã đủ tốt chưa, có cần nâng cấp (inpaint AI) không" — KHÔNG xây mới khi pipeline đã có. Operator duyệt chạy POC; quyết theo bằng chứng (Evidence Gate).

**Bối cảnh đã verify**: detect (PaddleOCR DBNet venv `tools/subtitle-detect-paddle/.venv` + tesseract fallback) + cover (`delogo`/blur/solid/auto) ĐÃ CÓ SẴN production (Phần 35/36), wire trong `10-montage-v2.ts` step 7. Lỗ hổng: CHƯA từng ĐO chất lượng output trên footage thật (`scrubApplied` chỉ đếm số vùng mask, không xác minh chữ đã sạch/không lem).

**Đã làm (POC cô lập `data/temp`, không publish/commit; harness throwaway đã xóa sau khi xong)**:
- **POC-SCRUB-QUALITY** (6 clip câu cá/mực thật): residual sót chữ TB **3.1%**, 5/6 clip ≤5% (giảm chữ 87-99%). Smear: giả định "delogo lem mặt nước" → **SAI**; nền trời sạch tuyệt đối, chỉ băng phụ đề dưới trên nền texture có vệt mờ nhẹ (panel 24 vision-rater TB 2.83/5 trên ảnh TĨNH — khắt khe; motion đỡ lộ).
- **TUNE mode**: `delogo` vs `delogo-tight` vs `solid` (blur render lỗi filtergraph nhiều đoạn) → tight ≈ delogo, solid để thanh đen xấu → **giữ `delogo`**.
- **RECALL tune** (clip vấn đề 222949 sót 12.5%): `--fps 3 --min-score 0.5` kéo **12.5% → 5.4%** (sót giảm 57%), cover đoạn giữ **36** (KHÔNG tăng FP), clip sạch 0621 0.8%→0% (không regress), không phạt thời gian.

**ĐÃ ÁP production (scoped, Operator chọn "áp ngay")**: thêm `--fps 3 --min-score 0.5` vào lời gọi detector trong `10-montage-v2.ts` step 7 — **CHỈ lane câu cá**; Product Review giữ default 2fps/0.6. Mode vẫn delogo. **ĐÃ commit `413e0ac` + PUSH** `origin/feat/ent-multichannel` (xem Phần 42).

**Quyết định**: Option C (delogo hiện tại) = đủ tốt. **Inpaint AI (video-subtitle-remover, Option D, ~2-4 ngày) DEFER** — chỉ mở nếu Operator xem motion thật và thấy smear băng dưới không chấp nhận được. Chi tiết memory `project_vfos_chinese_subtitle_scrub`.

**Bước tiếp theo**: (1) Khi render thật 1 clip montage end-to-end → xác nhận recall tune không hồi quy. (2) Có thể đẩy `fps4/min-score0.45` nếu muốn ép 222949 <5%. (3) ✅ ĐÃ commit `413e0ac` + push (xem Phần 42); round story-flag wiring per-job đã xong ở **Phần 44** (`bd30edb`) — story-flag thực ra đã commit từ `8e20424`.

---

### ✅ Phần 41 — Caption lower-third + verify deliverable end-to-end lane câu cá (2026-06-30)

> **Mục tiêu**: caption Việt phải nằm lower-third (vùng phụ đề gốc), KHÔNG bay lên dải scrub title trên; rồi render deliverable thật xác nhận 2 commit chạy trong pipeline đầy đủ. Operator duyệt ĐẠT.

**Bug + fix**: `centerPresetOnBand` (`scripts/kinetic-caption-renderer.ts`) lấy MEDIAN tâm-y của MỌI dải cover → có cả dải title TRÊN nên caption rơi ~0.2 (upper-middle, sai layout). Fix: chỉ lấy **dải THẤP NHẤT nửa dưới** (filter c≥0.55, max) + **kẹp 0.74–0.86**. **Commit `19ed0ba` (pushed origin `feat/ent-multichannel`)**. KHÔNG đụng scrub/detector/cover-filter; KHÔNG làm branded panel (yêu cầu #4 tùy chọn — defer).

**Verify end-to-end (clip 222949, render thật, KHÔNG publish)**:
- Caption deliverable ở lower-third ~0.80, center (3 frame 12/40/70s) ✅
- POST-SCRUB QA **0 frame CJK** + `17-hook-verify` **PASS** (0 title Trung toàn 2760 frame) ✅
- DỪNG GATE 2 → Operator duyệt video **ĐẠT**.
- `413e0ac` (scrub recall tune) cũng chạy trong pipeline (montage step hoàn tất) ✅.

**⚠️ Phát hiện cần round riêng (KHÔNG do 2 commit này)**: `produce` full-chain bị chặn **2 lần liên tiếp ở step 13 (`13-source-bound`, script writer gpt-5.5)** — flaky content QA, mỗi lần trượt 1 cổng KHÁC nhau (lần 1 `hook 14>13 từ`; lần 2 `reaction đúng money-shot 3/5`). Cổng QA chặn ĐÚNG (No-Go "không báo pass giả"). Vòng qua bằng `--step render` với VO đã PASS từ produce lần đầu. → mở round: **script writer/repair-loop ỔN ĐỊNH, KHÔNG nới QA bừa**. → **ĐÃ XỬ LÝ ở Phần 42** (self-repair loop, commit `0f2924a` pushed; 15 cổng giữ nguyên; verify 5/5 PASS).

**Lưu ý kiến trúc**: scrub bản ship do **step 12 (stable-band 5fps)** quyết; `413e0ac` cải thiện scrub trung gian step 10. Memory: `project_vfos_chinese_subtitle_scrub`.

---

### ✅ Phần 42 — Khóa sổ round lane câu cá: scrub + caption + self-repair step 13 (2026-06-30)

> **Mục tiêu**: chốt sổ trạng thái lane câu cá sau 3 thay đổi đã verify + push. KHÔNG sửa code, KHÔNG render, KHÔNG publish — chỉ ghi state.

**Đã push `origin/feat/ent-multichannel` (local == origin, đã verify sync):**
- **Scrub recall tune** `--fps 3 --min-score 0.5` (lane câu cá, `10-montage-v2.ts` step 7) — commit **`413e0ac`** ĐÃ PUSH.
- **Caption lower-third** (`centerPresetOnBand` kẹp 0.74–0.86, `kinetic-caption-renderer.ts`) — commit **`19ed0ba`** ĐÃ PUSH.
- **Self-repair loop step 13** (`13-source-bound.ts`: tách `runAttempt()` + loop tối đa 4 lần, fail → feed cổng trượt + gợi ý từng cổng + bản trước cho gpt-5.5 temp 0.6, giữ best, hết lượt fail → `exit(5)`; **GIỮ NGUYÊN 15 cổng QA byte-identical, KHÔNG fake pass**) — commit **`0f2924a`** ĐÃ PUSH. Verify `--step script` 5 lần: **5/5 PASS**, 2 ca attempt-1 trượt 1 cổng được repair cứu (base ~60% → ~100% invocation, chưa chạm trần 4 lần).

**Deliverable**: `montage_v2_short_ambient.mp4` (clip `ent_fishing_20260625_222949`, render thật KHÔNG publish) — caption lower-third + 0 CJK + hook-verify PASS → **Operator duyệt ĐẠT** (xem Phần 41).

**Branch**: `feat/ent-multichannel` — **local HEAD `0f2924a` == origin** (đã `git fetch` verify sync).

**⛔ Publish CHƯA chạy — vẫn là cổng duyệt riêng** (No-Go #2/#3: render/production/publish cần lệnh rõ; READY ≠ được đăng). Round này không chạm publish.

**Ngoài scope (lúc đó CHƯA xử lý)**: 3 file dirty `production/_media/bgm_library.json`, `_hookframes/`, `implementation_plan.md` — giữ nguyên, không stage. → **ĐÃ DỌN ở Phần 43**.

**Bước tiếp theo**: chờ Operator quyết — (a) đăng deliverable (mở cổng publish riêng), hoặc (b) round mới (vd story-flag wiring / multichannel).

---

### ✅ Phần 43 — Round hygiene: dọn 3 file dirty out-of-scope (2026-06-30)

> **Mục tiêu**: dọn sạch working tree `feat/ent-multichannel`. CHỈ phân loại + xử lý 3 mục dirty; KHÔNG sửa code feature, KHÔNG render, KHÔNG publish, KHÔNG đụng commit đã push.

**Xử lý (Operator duyệt từng mục):**
- `production/_media/bgm_library.json` — chỉ drift runtime (`usageCount`/`lastUsedAt`/`updated_at` do BGM rotation selector ghi), không phải source → **REVERT về seed** (`git restore`; No-Go #5 không commit runtime state). Hết dirty, KHÔNG commit.
- `_hookframes/` — 6 ảnh jpg debug (root throwaway, không script nào tham chiếu, regenerable) → **DELETE + gitignore** (thêm `_hookframes/` vào `.gitignore`). Commit **`d92db11`** (`chore: gitignore root _hookframes debug thumbnails`, đúng 1 file `.gitignore`).
- `implementation_plan.md` — scratchpad RCA bug "Lưu nháp persist URL nguồn", thuộc nhóm việc của branch `feat/entertainment-lane` (không phải branch này) → **DELETE**.

**Kết quả**: branch `feat/ent-multichannel` **local HEAD `d92db11` == origin** (đã push, verify sync) — **working tree CLEAN** (`git status --short` trống).

**⛔ Publish vẫn CHƯA chạy — cổng duyệt riêng**. Round này không chạm publish/render/code feature.

---

### ✅ Phần 44 — Story-flag wiring per-job + surface story metadata (2026-06-30)

> **Mục tiêu**: biến story-flag từ hard-code always-on thành ĐIỀU KHIỂN ĐƯỢC per-job + cho UI thấy phân loại story. CHỈ sửa `jobs.ts` + 1 test; KHÔNG render/publish, KHÔNG đụng pipeline/step 13/anchors.

**Đính chính 2 fact stale (điều tra workflow read-only xác minh):**
- ❗ Story-flag **KHÔNG phải "chưa commit"** — đã commit `8e20424` (2026-06-29), set cứng `ENT_MONTAGE_ENGINE='story'` always-on lane-scoped ở `apps/studio/src/lib/entertainment/jobs.ts`.
- ❗ Multichannel **KHÔNG phải "chưa code"** — R1 DONE+PUSH `43e65d6` (registry + guard G1–G7 + account-store), R2 (UI) DONE+PUSH `cf3cb83`.

**Đã làm (commit `bd30edb` ĐÃ PUSH `origin/feat/ent-multichannel`, 2 file +165/−4):**
- **Per-job `storyEngine`** field trong manifest `EntJob` (`'story'|'anchors'`), `createJob` default **`'story'`** → self-documenting, sẵn cho per-channel/UI toggle sau.
- **`resolveMontageEngine(job)` DEFENSIVE**: chỉ `storyEngine === 'anchors'` tường minh mới ra `anchors`; thiếu field / manifest cũ / giá trị lạ → `'story'`. `startStep` dùng nó thay hard-code → **hành vi hiện tại KHÔNG đổi** (luôn story).
- **Surface story metadata**: `readStorySummary` đọc `story_arc.json` → `story.{confidence,sourceType}` vào manifest qua `getJobDetail` (diff-check, chỉ write khi đổi → không bẩn manifest) cho UI đọc story vs highlight.

**Verify:** typecheck studio `tsc -p` **PASS** (exit 0) · test mới `tests/entertainment-story-engine.test.ts` **9/9 PASS** · Biome **PASS**. KHÔNG render, KHÔNG publish.
> ⚠️ Test-infra (reference): node:test ở root import code studio qua alias `@/` + studio biên CJS (no `"type":"module"`) → chạy bằng `TSX_TSCONFIG_PATH=apps/studio/tsconfig.json npx tsx --test <file>` + dynamic-import/default. Test multichannel có sẵn fail y hệt do hạn chế NÀY (không phải do field mới); field mới cô lập (`publish.ts` không import `jobs.ts`).

**DEFER (chưa làm round này):** anchors engine (mồ côi từ `8e20424` — default story, **chưa mở/smoke-test**) · per-channel `storyEngine` config (`channels.ts`) · UI toggle/indicator (`production-panel.tsx`) · sửa `13-source-bound.ts:641` storyMode (không đụng step 13).

**Bước tiếp theo**: chờ Operator quyết — (a) per-channel `storyEngine`, (b) UI toggle/indicator, hoặc (c) smoke-test + mở anchors engine.

---

### ✅ Phần 45 — UI indicator story engine / story metadata (read-only) (2026-06-30)

> **Mục tiêu**: cho Operator THẤY engine + phân loại story ngay trên Production Panel. CHỈ hiển thị read-only — KHÔNG toggle, KHÔNG mutation, KHÔNG gate.

**Đã làm (commit `136b209` ĐÃ PUSH `origin/feat/ent-multichannel`, 1 file +51):**
- CHỈ sửa `apps/studio/src/components/entertainment/production-panel.tsx`: mở rộng interface local `JobDetail` (`storyEngine` + `story`) + component **`StoryEngineBadge`** read-only render đầu panel.
- Badge 3 chip: **Engine: Story/Anchors** (default Story khi thiếu field — khớp defensive server) · **Phân loại: Story/Highlight** (từ `story.sourceType`) · **Độ tin: cao/vừa/thấp** (từ `story.confidence`). Job thiếu metadata → chip mờ **"Chưa phân loại"**. KHÔNG tô đỏ (không phải gate).
- Dữ liệu có sẵn từ `getJobDetail` (Phần 44) — KHÔNG đụng server/route/`jobs.ts`/context/pipeline.

**Verify:** typecheck studio `tsc -p` PASS · `biome check` PASS · data-path probe `getJobDetail` (story thật) · **VISUAL UI THẬT** (localhost:3003 — server riêng, KHÔNG đụng 3002 của thư mục/branch khác): 2 job — `ent_fishing_20260625_222949` → *Engine: Story · Phân loại: Story · Độ tin: vừa*; `ent_fishing_20260621_003719` → *…Độ tin: cao*; default job thiếu metadata → *Chưa phân loại*. Proof PNG ở `data/temp/` (gitignored). KHÔNG render video, KHÔNG publish.

**DEFER (chưa làm):** per-channel `storyEngine` config (`channels.ts`) · **UI toggle đổi engine per-job (mutation — cần gate cẩn thận)** · smoke-test + mở anchors engine (mồ côi từ `8e20424`).

**Bước tiếp theo**: chờ Operator quyết — (a) per-channel `storyEngine`, (b) UI toggle mutation (có gate), (c) smoke-test anchors, hoặc (d) đăng deliverable (cổng publish riêng).

---

### ✅ Phần 46 — Per-channel storyEngine wiring (safe-mode) (2026-06-30)

> **Mục tiêu**: channel config quyết engine montage per-kênh; `createJob` copy vào job manifest. SAFE-MODE: config toàn `story`, KHÔNG bật anchors thật.

**Đã làm (commit `53aace2` ĐÃ PUSH `origin/feat/ent-multichannel`, 4 file +58/−3):**
- `config/entertainment_channels.json`: thêm field `storyEngine` — `ch_fishing` = **`story`** (không kênh nào để anchors).
- `channels.ts`: `EntChannel` += `storyEngine?: 'story' | 'anchors'`; `coerceChannel` parse defensive.
- `jobs.ts`: helper export `jobStoryEngineFor(channel)` + `createJob` copy `storyEngine: jobStoryEngineFor(channel)` (thay hard-code).
- `tests/entertainment-story-engine.test.ts`: +6 case.

**Guard 2 lớp (thiếu/sai/null → `story`):**
- Config: `coerceChannel` → chỉ `'anchors'` tường minh; còn lại `story`.
- Job: `jobStoryEngineFor` → channel null / value sai → `story`.

**Verify:** typecheck studio `tsc -p` PASS · `biome check` 4 file PASS · node:test **15/15 PASS** (`jobStoryEngineFor` 5 case + `getChannel('ch_fishing').storyEngine === 'story'`). KHÔNG gọi `createJob` (tránh download). KHÔNG render, KHÔNG publish.

**SAFE-MODE:** config toàn `story` → không job nào nhận anchors; code hỗ trợ per-channel nhưng anchors engine (mồ côi) vẫn defer.

**DEFER (chưa làm):** UI toggle đổi engine per-job (mutation, cần gate) · Channel Overview hiển thị engine (read-only) · smoke-test + mở anchors engine.

**Bước tiếp theo**: chờ Operator quyết — (a) UI toggle mutation (gate), (b) Channel Overview read-only engine, (c) smoke-test anchors, hoặc (d) đăng deliverable (cổng publish riêng).

---

### ✅ Phần 47 — Channel Overview hiển thị storyEngine (read-only) (2026-06-30)

> **Mục tiêu**: cho Operator THẤY engine mặc định của từng kênh ngay trên Channel Overview. Read-only hoàn toàn.

**Đã làm (commit `39590be` ĐÃ PUSH `origin/feat/ent-multichannel`, 4 file +23/−2):**
- Surface `storyEngine` qua chuỗi UI: `EntChannelUi` (jobs.ts) += field · `listChannelsForUi` map `c.storyEngine ?? 'story'` · `EntChannelLite` (context) pass-through · `ChannelCard` (channel-switcher.tsx) chip read-only **`Engine: Story` / `Engine: Anchors`** (default story).
- Test +1: `listChannelsForUi` ch_fishing storyEngine === 'story'.

**Verify:** typecheck `tsc -p` PASS · `biome check` PASS · node:test **16/16 PASS** · **VISUAL UI THẬT** (dev 3003 riêng, KHÔNG đụng 3002): card `Vlog Câu cá` hiển thị chip **`Engine: Story`** (cạnh active · 14 job · token sẵn sàng). Proof PNG `data/temp/` (gitignored). KHÔNG render/publish.

**Ràng buộc giữ:** read-only · KHÔNG sửa config/createJob · KHÔNG toggle/mutation · KHÔNG đụng anchors engine · KHÔNG render/publish. (jobs.ts chỉ `listChannelsForUi` + type — surfacing, không createJob/guard.)

**Story-engine giờ có 4 TẦNG:**
1. Per-job storyEngine + surface metadata — `bd30edb`
2. Production Panel badge (read-only) — `136b209`
3. Per-channel config → job (safe default story) — `53aace2`
4. Channel Overview chip (read-only) — `39590be`

Config vẫn toàn `story`; **anchors engine vẫn DEFER** (mồ côi từ `8e20424`).

**DEFER (cổng riêng):** UI toggle đổi engine per-job (mutation, cần gate) · smoke-test + mở anchors engine · đăng deliverable lane câu cá (publish).

**Bước tiếp theo**: chờ Operator quyết — (a) UI toggle mutation (gate), (b) smoke-test anchors, hoặc (c) đăng deliverable.

---

### ✅ Phần 48 — Smoke-test anchors data layer (unit-test, no render) (2026-06-30)

> **Mục tiêu**: chứng minh anchors engine (đường non-story, mồ côi từ `8e20424`) còn SỐNG ở tầng dữ liệu — bằng unit-test thuần, KHÔNG render, KHÔNG mở engine cho job/channel thật.

**Đã làm (commit `90f8933` ĐÃ PUSH `origin/feat/ent-multichannel`, 1 file mới +171):**
- Test mới `tests/entertainment-anchors-engine.test.ts` (ESM thuần, import thẳng `scripts/ent-vlog/lib/anchors.ts` — KHÔNG cần `TSX_TSCONFIG_PATH`).
- **`deriveAnchors`** (6 case, dữ liệu THẬT từ `ent_fishing_20260625_222949`): 5 catch_moments → đúng `[199.5,318.5,353.5,437.5]` (cluster gộp 353.5+367.5 gap14≤minGap23 giữ score cao) · số anchors ∈[3,6] · tăng dần/không âm/max<449.17 · ≠ `FALLBACK_ANCHORS` · >6 moments → giữ top-6 theo score rồi sort thời gian · empty → `[]`.
- **`readAnchorPlan`** (5 case, fixture hermetic): có anchors.json → đọc đúng KHÔNG fallback · chỉ catch_moments → derive `source=catch_moments` · không file → `FALLBACK_ANCHORS`/`fallback-hardcoded` · anchors.json rỗng → fallthrough · anchors.json hỏng JSON → fallthrough.

**Verify:** anchors-engine test **11/11 PASS** · story-engine regression **16/16 PASS** (không vỡ) · `biome check` PASS (sau `biome format --write`). Fixture viết dưới `data/temp/ent/` (gitignored) + `rmSync` dọn sạch trong `after()` — git status chỉ `?? tests/entertainment-anchors-engine.test.ts`.

**Kết luận:** anchors data layer **SỐNG — verified**; `deriveAnchors` cluster+pick-best đúng money-shot, `readAnchorPlan` đúng thứ tự ưu tiên, **không rơi fallback hardcode khi có artifact thật**. KHÔNG phát hiện lỗi engine → không cần fix.

**Ràng buộc giữ:** KHÔNG sửa `anchors.ts`/`jobs.ts`/`channels.ts`/config/step 10/12/13/15 · KHÔNG createJob/pipeline/render/publish · KHÔNG `git add .`.

**DEFER (cổng riêng):** end-to-end montage smoke `ENT_MONTAGE_ENGINE=anchors` trên job scratch — **CÓ render**, round riêng cần Operator duyệt, **CHƯA chạy** · UI toggle đổi engine per-job (mutation, cần gate) · đăng deliverable lane câu cá (publish).

**Bước tiếp theo**: chờ Operator quyết — (a) end-to-end montage smoke anchors (round có render), (b) UI toggle mutation (gate), hoặc (c) đăng deliverable.

---

### ✅ Phần 49 — End-to-end montage smoke anchors trên scratch job (CÓ render, no publish) (2026-06-30)

> **Mục tiêu**: chứng minh anchors engine sống KHÔNG chỉ ở data layer (Phần 48) mà cả **montage render thật** — chạy `ENT_MONTAGE_ENGINE=anchors` trên job scratch, KHÔNG đụng job/channel thật, KHÔNG publish.

**Đã chạy (round CÓ render, Operator duyệt từng bước; KHÔNG commit code/config):**
- Scratch id **`ent_scratch_anchors`** (copy từ job thật **`ent_fishing_20260625_222949`**); dọn output cũ + `steps/`; **xóa `story_arc.json`** trong scratch (để chứng minh anchors không phụ thuộc story); sửa `source_meta.path` trỏ về scratch `source.mp4` (cô lập tuyệt đối khỏi job thật).
- Command: `ENT_MONTAGE_ENGINE=anchors pnpm tsx scripts/ent-vlog/10-montage-v2.ts --id ent_scratch_anchors 2>&1 | tee data/temp/ent/_anchors_smoke.log`. Env key tự nạp qua `loadEnv()` (không can thiệp tay).

**Proof paths:**
- Output: `data/temp/ent/ent_scratch_anchors/montage_v2_short.mp4` — **47,145,226 bytes · duration 92.00s**.
- Log: `data/temp/ent/_anchors_smoke.log`.

**Verify (6/6 ĐẠT):**
- ✅ Output tồn tại, size>0, duration 92.00s (≈ 4 seg × ~23s — đúng dự kiến).
- ✅ Route THẬT qua anchors: log dòng 1 `[10] Anchors (catch_moments): 199.5, 318.5, 353.5, 437.5`.
- ✅ **Không** có dòng `[10] STORY engine`.
- ✅ **Không** fallback hardcoded: source `catch_moments` (≠ `fallback-hardcoded`); anchors `[199.5,318.5,353.5,437.5]` ≠ `FALLBACK [3.5,136.5,227.5,290.5,346.5]`.
- ✅ **Không phụ thuộc story_arc**: đã xóa `story_arc.json` khỏi scratch mà montage vẫn render xong (exit 0).
- ✅ Job thật **không bị đụng**: `ent_fishing_20260625_222949/montage_v2_short.mp4` mtime/size không đổi (01:39:17 · 48,497,310); `story_arc.json` job thật còn nguyên.
- ✅ **Git status clean** (0 tracked dirty); scratch + log đều gitignored.

Pipeline anchors chạy đầy đủ (từ log): cắt 4 money-shot → vision hook (1 call) → gpt-4o VO sạch → edge-tts + caption từ voice timing → **HASH AUDIT voice==caption MATCH** → scrub chữ Hán (57 vùng) → render voice+BGM (bgm_001). Hook: *"Cá lớn vừa lên khỏi mặt nước!"*

**Kết luận:** anchors engine **SỐNG end-to-end ở montage render** — đúng route, đúng anchors thật, không story_arc, không fallback hardcode. **KHÔNG phát hiện lỗi engine → không cần fix.** Anchors giờ verified 2 tầng: data layer (Phần 48, unit-test) + render thật (Phần 49, smoke).

**Ràng buộc giữ:** KHÔNG sửa code/config/channel · KHÔNG UI toggle · KHÔNG bật anchors cho channel thật (chỉ env per-spawn trên scratch) · KHÔNG publish · KHÔNG commit code.

**Proof đang GIỮ (chưa cleanup):** `data/temp/ent/ent_scratch_anchors/` + `data/temp/ent/_anchors_smoke.log` (gitignored) — **cleanup để round riêng**.

**Bước tiếp theo**: chờ Operator quyết — (a) cleanup scratch + log, (b) UI toggle đổi engine per-job (mutation, cần gate), hoặc (c) đăng deliverable lane câu cá (cổng publish riêng).

---

### ✅ Phần 50 — Round Skill Cleanup: dọn `.claude/skills` còn 5 skill load thật (2026-06-30)

> **Mục tiêu**: làm sạch `.claude/skills` để chỉ còn skill **load thật**. Phát hiện gốc: Claude Code **CHỈ** load skill dạng folder `<tên>/SKILL.md` + frontmatter `---name/description---`; file `.md` **phẳng** vứt thẳng vào `skills/` **không bao giờ kích hoạt** → đây là lý do nhiều skill "viết ra mà không thấy dùng".

**Đã làm (branch `chore/skills-cleanup`, commits `6cd7e03` + `025ba3c`, ĐÃ push + merged vào `feat/ent-multichannel` qua PR #3 / merge `9a8f5bf`; PR #2 base master sai đã đóng):**
- `chay/` → `.claude/_archive/skills/chay/` — lane Shopee-First short-form + FB Reels Operator chốt **NGỦ ĐÔNG** (không xoá; rename 100% giữ history). 2663 dòng nên tách ra cho nhẹ context.
- `shop-amazon.md` → **XOÁ** (không load + lệch North Star Amazon; đã tracked nên còn trong git history).
- 3 file giá trị (sai format, nội dung tốt) → `.claude/_archive/skills/pending-rebuild/`: `vfos_evidence_gated_research.md`, `vfos_proactive_support.md`, `vfos_revenue_experiment_strategist.md` (rename 100% giữ history).

**Verify (gate PASS trước commit):**
- ✅ `.claude/skills` còn **đúng 5 skill load thật** (đều auto-trigger): `vfos-command-center-skill`, `vfos-git-safety-skill`, `vfos-product-review-workflow-skill`, `vfos-shopee-affiliate-skill`, `vfos-ui-review-skill`.
- ✅ Không còn file `.md` phẳng nào trong `skills/`.
- ✅ 100% staged nằm trong `.claude/skills | .claude/_archive` (scoped, **không** `git add -A`).

**Ràng buộc giữ:** KHÔNG sửa code pipeline · KHÔNG đụng Product Review/BGM/render/publish · KHÔNG stage runtime/media/draft · **đã push + merged vào feat/ent-multichannel** (master không bị đụng).

**Round 2 còn nợ:** rebuild `vfos-evidence-gated-research` thành skill chuẩn `.claude/skills/vfos-evidence-gated-research/SKILL.md` (auto-trigger, chặn agent bịa URL/data — đúng lỗi từng hại Market Validation 001). KHÔNG gộp Round 2 vào Round 1.

**Bước tiếp theo**: PR #3 đã merge vào `feat/ent-multichannel` (`9a8f5bf`), PR #2 (base master, sai) đã đóng. Round 2 (rebuild `vfos-evidence-gated-research`) đang tiến hành trên branch `chore/rebuild-evidence-gated-research-skill`.

---

### ✅ Phần 51 — Round 2: rebuild `vfos-evidence-gated-research` ĐÃ MERGE + VERIFY (2026-07-01)

> **Mục tiêu**: hồi sinh skill chống-bịa-nguồn (`vfos_evidence_gated_research` — trước là file phẳng chết, không load) thành skill auto-trigger đúng format. Nối tiếp Round 1 (Phần 50). **Round 2 đã hoàn tất.**

**Đã hoàn tất:**
- Rebuild **`.claude/skills/vfos-evidence-gated-research/SKILL.md`** (71 dòng, auto-trigger, đúng format folder/SKILL.md): phân biệt **external evidence** (URL/repo/vendor/API/public data) vs **internal evidence** (file/path/log/artifact); `verification_status` 4 cấp; must-do / must-not-do; output 7 mục; pre-handoff checklist. Được verify data/nguồn cho Product Review nhưng KHÔNG đổi workflow 5 bước.
- `feat/ent-multichannel` hiện ở commit **`6238da1`**.
- `.claude/skills` = **6 skill load thật**: command-center, git-safety, product-review-workflow, shopee-affiliate, ui-review, **evidence-gated-research**.

**Cách merge (bài học quan trọng):**
- Merge PR #4 bằng **GitHub UI "Confirm merge" KHÔNG ăn thật** — `feat/ent-multichannel` không nhảy khỏi `9a8f5bf` dù đã bấm (kiểm nhiều lần qua thời gian dài).
- Xử lý bằng CLI: `git merge --ff-only origin/chore/rebuild-evidence-gated-research-skill` + `git push origin feat/ent-multichannel` (fast-forward, **non-force**, không tạo commit thừa).
- **Verify PASS bằng `git ls-remote` / `git ls-tree`** (không tin badge UI): feat vượt `9a8f5bf` → `6238da1` · `SKILL.md` tồn tại trên origin/feat · 6 skill · **`master` KHÔNG đụng** (`e2d0a55`) · **working tree sạch**.

**Ràng buộc giữ:** KHÔNG đụng code pipeline · KHÔNG đụng Product Review/BGM/render/publish · KHÔNG đụng runtime/media/secret · không force push.

**Còn nợ (chưa làm):**
- 2 skill vẫn ở `_archive/skills/pending-rebuild/`: `vfos_proactive_support.md`, `vfos_revenue_experiment_strategist.md` (rebuild round riêng nếu Operator muốn).
- `/chay` vẫn **archived** ở `.claude/_archive/skills/chay/` (chưa xoá hẳn — Operator chốt ngủ đông).
- Branch cleanup (`chore/skills-cleanup`, `chore/rebuild-evidence-gated-research-skill`) — bước sau, chưa làm trong Phần này.

---

### ✅ Phần 52 — Round 3: Guardrail Hardening v0 (settings.json deny/ask) ĐÃ MERGE + VERIFY (2026-07-01)

> **Mục tiêu**: biến luật git-safety/No-Go thành **chặn cứng** ở tầng permission `.claude/settings.json`, và **ask-gate** lệnh publish/live thật. Nâng cấp #1 từ báo cáo Iceberg AI-coding. **Round 3 đã hoàn tất.**

**Đã hoàn tất (verify server + content, KHÔNG tin badge UI):**
- `feat/ent-multichannel` hiện ở commit **`bca80b8`**; guardrail đang **LIVE**.
- **Hard deny** (chặn cứng): `git add -A` / `git add .` / `git add --all` / `git add :/` / `git add -f` / `--force`.
- **Hard deny**: `git commit -a` / `-am` / `--all` (VFOS phải stage file cụ thể trước rồi mới commit).
- **Ask-gate** (Operator xác nhận) lệnh publish/live thật đã audit: `pnpm job:publish-facebook*`, `tsx scripts/job-facebook-publish-command.ts*`, `(pnpm )tsx scripts/ent-vlog/tiktok-publish-run.ts*`, `pnpm facebook:test-post*`.
- Giữ nguyên deny cũ (force push, push --delete, reset --hard, clean -fd, branch -D, rm -rf). **Không chặn nhầm** `git add <file cụ thể>`, `git commit -m`, `git status/diff/log`, `pnpm typecheck/lint/tsx/ffmpeg/ent:produce`.

**Không cần PreToolUse hook:** matcher settings **hot-reload** + **env-var prefix bị strip trước khi match** ⇒ base prefix đã phủ cả env-prefixed publish (`META_MODE=live pnpm ...` → match `pnpm ...`). Leading-wildcard `Bash(*X*)` không match → đã loại bỏ.

**Cách merge (gotcha lặp lại):** GitHub UI merge PR #5 **KHÔNG stick** (feat không nhảy) — lần 2 sau PR #4. Xử lý bằng CLI `git merge --ff-only origin/chore/guardrail-hardening` + `git push origin feat/ent-multichannel` (FF, non-force). **Verify bằng `git ls-remote` + content check, KHÔNG tin badge UI.**

**Trạng thái:** `master` KHÔNG đụng (`e2d0a55`) · working tree sạch · local == origin (`bca80b8`).

**Còn nợ (Round 4/5 — chưa làm):** slash commands theo lane (`/ent-status`, `/gate-check`, `/review-status`, `/produce`); subagent read-only (`gate-auditor`, `qa-verifier`).

**Bước tiếp theo**: dọn PR #5 + branch `chore/guardrail-hardening` (bước sau, chưa làm trong Phần này).

---

### ✅ Phần 53 — Round 4: slash command đầu tiên `/ent-status` (typed-invoke skill) ĐÃ MERGE + VERIFY (2026-07-01)

> **Mục tiêu**: mở Round 4 (slash commands theo lane, đã ghi nợ ở Phần 52) bằng lệnh đầu tiên `/ent-status` — cửa sổ **READ-ONLY** xem trạng thái lane Entertainment. **Round 4 bước 1 đã hoàn tất.**

**Bước 0 — verify `.claude/commands/` FAIL thật (evidence-gated):**
- Tạo `.claude/commands/test-cmd.md` **tồn tại thật** (verify bằng `ls`/`cat`/`git status`), nội dung chỉ in token `SLASH-COMMANDS-DIR-WORKS`.
- Gõ `/test-cmd` → UI báo **`Unknown command: /test-cmd`** dù file tồn tại thật.
- **Kết luận**: harness Claude Code hiện tại **KHÔNG load `.claude/commands/`**. → **Option A FAIL thật**. Đã xoá file test + thư mục `.claude/commands/` rỗng.

**Chuyển Option B — `/ent-status` dưới dạng typed-invoke skill:**
- File thêm: **`.claude/skills/ent-status/SKILL.md`** (51 dòng). Frontmatter `description` viết **HẸP** — nêu rõ typed-invoke, **KHÔNG auto-trigger**, không tự bật cho câu nói chung về "lane giải trí / produce / render / publish".
- **Skill registry hiện = 7 skill load thật**: 6 cũ (vfos-command-center · vfos-evidence-gated-research · vfos-git-safety · vfos-product-review-workflow · vfos-shopee-affiliate · vfos-ui-review) **+ `ent-status`**. Tăng 6→7 có chủ đích: là slash command gõ tay, không phải auto-trigger rộng.

**`/ent-status` đã chạy PASS (read-only thật):**
- Chỉ đọc `data/temp/ent/*/ent_job.json` (bỏ qua thư mục phụ trợ không có job).
- Báo **14 Entertainment jobs** (jobId · state · channel · gates · render.verdict · reviewStatus), đếm theo state: `PREVIEW_PENDING: 4 · INTAKE_DONE: 2 · INTAKE_FAILED: 6 · TIKTOK_POSTED: 2`.
- **Không** produce / render / publish / sửa file. **`git status` sạch sau khi chạy** (đã verify).

**Commit + merge:**
- Commit tính năng: **`510d52b`** `feat(skills): add /ent-status read-only entertainment lane command` (1 file, +51/-0), branch `feat/ent-status-command` (tách từ feat/ent-multichannel).
- **PR #6** (base `feat/ent-multichannel` ← head `feat/ent-status-command`) — verify qua GitHub API: `commits:1 · changed_files:1 · mergeable_state:clean`.
- **Merge `--ff-only` bằng CLI** (KHÔNG dùng UI merge, KHÔNG squash, KHÔNG merge commit): `de3fb5d..510d52b` fast-forward, push non-force. PR #6 GitHub **tự chuyển `merged`** (`merge_commit_sha=510d52b`, đúng bản chất FF).

**Trạng thái:** `origin/feat/ent-multichannel` hiện chứa **`510d52b`** · local == origin · `master` **KHÔNG đụng** (`e2d0a55`) · working tree sạch. Branch `feat/ent-status-command` **chưa xoá** (cleanup là bước riêng).

**Gotcha ghi nhận:** GitHub list-PR API có độ trễ vài giây sau khi bấm "Create pull request" — lần query đầu thấy 0 PR (mâu thuẫn bằng chứng) → đợi + query lại mới thấy PR #6. Luôn verify bằng API thật, không đoán.

**Còn nợ (Round 4 tiếp):** slash command lane khác (`/gate-check`, `/review-status`, `/produce`); cleanup branch `feat/ent-status-command` (local + remote qua UI vì deny-rule chặn `push --delete`).

---

### ✅ Phần 54 — Round 4 bước 2: slash command `/review-status` (Product Review lane, typed-invoke) ĐÃ MERGE + VERIFY (2026-07-01)

> **Mục tiêu**: lệnh READ-ONLY thứ 2 của Round 4 — `/review-status` cho **lane Product Review** (Entertainment đã có `/ent-status`, KHÔNG gom chung). **Đã hoàn tất.**

**Audit trước khi code (evidence-gated, workflow 5 agent read-only):** xác minh field thật từ file thật, không bịa schema. Kết quả nền:
- Nguồn chính = `data/temp/vfos_jobs_registry.json` (**39 entry** — đúng nguồn `pnpm job:list`/`job:status` đọc; đã xác nhận 2 lệnh này READ-ONLY: chỉ `loadRegistry()`/`loadManifest()`, không `save*`).
- Enrich optional per-job: `job_manifest.json`, `product_card.json`, `final_video_qa_report.json`, `render_manifest.json`, `preview_artifact.json`, `launch_check_report.json`, `facebook_publish_status.json`, `publish_audit_log.jsonl`.
- **Quan trọng về workflow**: code nội bộ dùng **10-state machine** (`scripts/vfos-job-manager.ts`) + UI **3-action**; `/review-status` chỉ **map state nội bộ → khung 5 bước hiển thị**, KHÔNG định nghĩa lại workflow, KHÔNG thêm gate.
- Quyết định preview approve/reject nằm ở `job_manifest.json $.review.operatorDecision` (PENDING|APPROVED|REJECTED), mirror ở registry `$.operatorDecision`.

**File thêm: `.claude/skills/review-status/SKILL.md`** (84 dòng). Typed-invoke (`description` hẹp chặn auto-trigger, loại trừ Entertainment). Read-only HARD DENY: không Edit/Write, không intake/production/render/QA/package/publish, không gọi FB/TikTok API, không đụng `data/temp/ent/*`, không đổi workflow 5 bước, git phải sạch sau chạy. `.claude/skills` giờ = **8 skill load thật** (thêm `review-status`).

**`/review-status` verify PASS (read-only thật):** bảng chính **39 job** từ registry, sắp `updatedAt` mới→cũ, cột `jobId·state·bước·product·operatorDecision·qaStatus·publish·updatedAt`. Đếm state: `PUBLISHED: 14 · FAILED: 11 · READY_FOR_OPERATOR_REVIEW: 4 · WAITING_FOR_SOURCE_VIDEO: 4 · SOURCE_READY: 2 · PACKAGED: 2 · APPROVED: 1 · READY_TO_RENDER: 1`. **Unregistered/test dirs** (`job_20260530_001_unified_test`, `job_test56b`) hiện mục phụ riêng, không trộn bảng chính (dir tổng 41 = registry 39 + 2 test). KHÔNG có `ent_*` lọt vào. Publish giữ nguyên trạng thái thật (vd `UNCONFIRMED`, `PUBLIC_CONFIRMED` ở `job_20260609_001`) — không tự kết luận live/public. Sau chạy `git status` sạch.

**Commit + merge:** commit `123a172` `feat(skills): add /review-status read-only product review command` (1 file, +84), branch `feat/review-status-command`. PR #7 (base `feat/ent-multichannel` ← head) — **merge `--ff-only` bằng CLI** (KHÔNG dùng UI merge, KHÔNG squash): `b59efbe..123a172` fast-forward, push non-force. PR #7 hiển thị **Merged** trên UI (ghi nhận theo UI vì REST API dính rate-limit 60 req/h lúc merge — không đoán state qua API).

**Trạng thái:** `origin/feat/ent-multichannel` = **`123a172`** · local == origin · `master` KHÔNG đụng (`e2d0a55`) · working tree sạch. Branch `feat/review-status-command` **CHƯA cleanup** (bước riêng).

**Gotcha mới:** GitHub REST API unauthenticated giới hạn **60 req/h per IP** — audit + verify nhiều lần làm cạn quota. Khi hết: (1) `git ls-remote origin 'refs/pull/*/head'` tra được PR number theo head SHA (git protocol, KHÔNG dính REST rate-limit); (2) parent-check (`123a172^ == b59efbe`) chứng minh linear trên base; (3) endpoint `/rate_limit` không tính quota, xem được mốc reset.

**Còn nợ (Round 4 tiếp):** cleanup branch `feat/review-status-command` (local + remote UI); slash command lane khác (`/gate-check`, `/produce`).

---

### ✅ Phần 55 — Round 4 bước 3: slash command `/gate-check <jobId>` (per-job gate diagnostic) ĐÃ MERGE + VERIFY (2026-07-01)

> **Mục tiêu**: lệnh READ-ONLY diagnostic thứ 3 — soi 1 job cụ thể đang **kẹt gate nào, vì sao**. Bổ trợ `/ent-status` + `/review-status` (bức tranh tổng) bằng góc nhìn per-job. **Round 4 bước 3 đã hoàn tất.**

**File thêm: `.claude/skills/gate-check/SKILL.md`.** Commit tính năng **`6c1b982`** `feat(skills): add /gate-check read-only per-job gate diagnostic command`. **PR #8** merged bằng **FF-only** (`cef8b86..6c1b982`) vào `feat/ent-multichannel` (REST xác nhận merged_at 2026-07-01T10:02:56Z). `.claude/skills` = **9 skill** load thật.

**Đặc tả `/gate-check` (typed-invoke READ-ONLY diagnostic):**
- **Auto-detect lane theo prefix**: `job_*` → Product Review (đọc `data/temp/jobs/<jobId>/`); `ent_*` → Entertainment (đọc `data/temp/ent/<jobId>/ent_job.json`). KHÔNG đọc chéo lane. Prefix lạ → `UNSUPPORTED_JOB_ID_PREFIX`; không tồn tại → `JOB_NOT_FOUND`; thiếu jobId → `USAGE` (không auto-scan).
- Product Review 5 gate: binding → source-clean → duration/QA → operator-preview → launch/publish. Entertainment: intake/blocker → GATE1 script → GATE2 preview/audio → GATE3 render.
- Blocker in **verbatim** (PR=`lastError`, Ent=`error.code`/`violations`); **mismatch** state↔lastError hiện cả hai + ghi `mismatch observed`, không tự chọn bên đúng. `publishVisibility` giữ nguyên văn (không kết luận live/public). Artifact thiếu → `MISSING`, JSON hỏng → `PARSE_ERROR`.

**Test PASS 7/7 (read-only thật):** `job_20260625_003` (PR 5 gate PASS, PUBLISHED) · `job_20260616_001` (PENDING operator preview + state/lastError mismatch) · `job_20260625_004` (FAILED provider-fetch, blocker `PROVIDER_PAGE_FAILED` verbatim) · `ent_squid_001` (Ent GATE1/2/3 PASS) · `ent_fishing_20260626_231555` (Ent BLOCK GATE1, `error.code=DOWNLOAD_FAILED` verbatim) · `job_khong_ton_tai` (JOB_NOT_FOUND) · no-arg (USAGE). **KHÔNG** chạy job:qa/intake/production/render/package/publish; **KHÔNG** gọi FB/TikTok API; **KHÔNG** sinh artifact; **git sạch sau test**.

**QUYẾT ĐỊNH FREEZE + PIVOT (Operator chốt):** Bộ 3 command READ-ONLY diagnostic — `/ent-status`, `/review-status`, `/gate-check <jobId>` — **ĐÃ FREEZE. DỪNG tạo slash command mới.** Chuyển sang **Round UI Integration**: đưa logic 3 command vào UI panel (/ent-status → Entertainment Status panel; /review-status → Product Review Status panel; /gate-check → nút "Kiểm tra gate" trong job card/modal). **Sau khi UI Integration thay thế PASS, 3 slash command này chỉ là GIÀN GIÁO TẠM và sẽ được XOÁ.** `/produce` **KHÔNG** làm slash command — sẽ là **UI action CÓ GUARD ở round riêng** (không read-only → tách bạch).

**Trạng thái:** `origin/feat/ent-multichannel` = `6c1b982` (sau khi ghi Phần 55 sẽ tiến thêm 1 docs commit) · `master` KHÔNG đụng (`e2d0a55`). Branch `feat/gate-check-command` **cleanup ngay sau khi push state doc** (local + remote UI).

---

### ✅ Phần 56 — Round UI Integration PR-A: Product Review Status panel (ở Tổng quan) ĐÃ MERGE + VERIFY (2026-07-01)

> **Mục tiêu**: bước 1 của Round UI Integration — đưa logic slash command `/review-status` vào UI dưới dạng **bảng điều hành READ-ONLY**. **PR-A đã hoàn tất, merge FF.**

**Merge:** **PR #9** (base `feat/ent-multichannel` ← head `feat/ui-pr-status-panel`) merge **FF-only** bằng CLI; `origin/feat/ent-multichannel` tip/merge = **`cc24b72`** (REST xác nhận merged_at 2026-07-01T15:30:44Z). 2 file, +190.

**Feature:** **Product Review Status panel** trên **Tổng quan / Trung tâm điều hành**.

**Placement ĐÚNG (bài học từ lần đặt sai đầu tiên — đã reset gộp 1 commit sạch, bỏ bản sai chưa push):**
- Panel nằm ở route **`/`** (Tổng quan), file `apps/studio/src/app/page.tsx`.
- **KHÔNG** nằm trong LANE NỘI DUNG; **KHÔNG** nằm trong Review Sản phẩm.
- Lane Review Sản phẩm giữ nguyên nhiệm vụ **sản xuất video**: workflow **5 bước KHÔNG đổi**; page `lanes/product-review/page.tsx` **NET CLEAN** (không có status panel).

**Panel READ-ONLY (`components/product-review/status-panel.tsx`):**
- Self-fetch **`GET /api/studio/jobs`** (Tổng quan là server component không giữ jobs[] page-level).
- `source: real`, **39 job**; **KHÔNG mock**; **KHÔNG** action button; **KHÔNG** gọi slash command; **KHÔNG** mutate `data/temp`; **KHÔNG** production/render/QA/package/publish.
- Bảng jobId·state·bước·product·operatorDecision·qaStatus·publish·updatedAt; thiếu → `—`. Cột publish chỉ suy từ `state`, **không** kết luận live/public.

**Verify:** `typecheck` PASS · `build` PASS · browser: `/` (Tổng quan) **CÓ** panel; `/lanes/product-review` **KHÔNG** có panel. Sự cố runtime: chạy `build` đè `.next` dưới dev server đang chạy → CSS 404; fix bằng kill port 3002 + `studio:dev:clean` (wipe `.next` + start fresh). Studio UI xem bằng **Chrome** (không Cốc Cốc — rule browser separation).

**Ý nghĩa kiến trúc (chốt):** **LANE NỘI DUNG chỉ là XƯỞNG SẢN XUẤT VIDEO** (Review Sản phẩm, Nội dung/Giải trí). **Bảng điều hành/status phải ở Tổng quan / Trung tâm điều hành**, không nhét vào lane sản xuất. Áp cho toàn bộ Round UI Integration (PR-B/C/D theo cùng nguyên tắc).

**Trạng thái:** `origin/feat/ent-multichannel` = **`cc24b72`** · `master` KHÔNG đụng (`e2d0a55`). Branch `feat/ui-pr-status-panel` **chưa cleanup** (bước riêng). PR-B/C/D chưa làm.

---

### ✅ Phần 57 — Round UI Integration PR-B: Entertainment Status panel (ở Tổng quan) ĐÃ MERGE + VERIFY (2026-07-01)

> **Mục tiêu**: bước 2 của Round UI Integration — đưa logic slash command `/ent-status` vào UI dưới dạng **bảng điều hành READ-ONLY**. **PR-B đã hoàn tất, merge FF.**

**Merge:** **PR #10** (base `feat/ent-multichannel` ← head `feat/ui-ent-status-panel`) merge **FF-only** bằng CLI (`git merge --ff-only`, **không** merge commit); `origin/feat/ent-multichannel` tip = **`53cfe18`**, `merge_commit_sha = 53cfe18` (REST xác nhận `merged=True`, merged_at 2026-07-01T16:35:10Z → **FF thật**). 4 file, **+261 / −0**. PR tạo **tự động qua GitHub API** (token lấy từ credential-store, chỉ trong env, **không lộ**) vì `gh` CLI chưa cài.

**Feature:** **Entertainment Status panel** trên **Tổng quan / Trung tâm điều hành**.

**Placement ĐÚNG (tiếp nối bài học PR-A):**
- Panel nằm ở route **`/`** (Tổng quan), file `apps/studio/src/app/page.tsx`, **cùng cấp** `ProductReviewStatusPanel`.
- **KHÔNG** nằm trong LANE NỘI DUNG; **KHÔNG** nằm trong `/lanes/content`; **KHÔNG** nằm trong `/lanes/product-review`.

**Panel READ-ONLY (3 file mới):**
- `components/entertainment/status-panel.tsx` — self-fetch **`GET /api/studio/entertainment/status`** (**route mới**, GET/read-only, local-only).
- `lib/entertainment/status.ts` — projection **pure-read** từ `data/temp/ent/*/ent_job.json` qua `listJobs()` (KHÔNG reconcile/ghi). **KHÔNG** dùng `getJobDetail()` vì hàm đó có side-effect `writeManifest`.
- **Data thật 14 job**; **KHÔNG mock**; **KHÔNG** action button; **KHÔNG** gọi slash command; **KHÔNG** mutate `data/temp`; **KHÔNG** production/render/QA/package/publish; **KHÔNG** đụng pipeline/render/BGM/blur; **KHÔNG** gọi FB/TikTok API.
- Bảng jobId·state·channel/account·niche·gates(S/P)·reviewStatus·render.verdict·updatedAt; thiếu → `—`; sort mới→cũ theo `updatedAt`.

**Verify:** `typecheck` PASS · `build` PASS (route `/api/studio/entertainment/status` có trong build manifest) · `curl` API **200** (14 job: INTAKE_FAILED 6 · PREVIEW_PENDING 4 · TIKTOK_POSTED 2 · INTAKE_DONE 2) · browser: `/` (Tổng quan) **CÓ** cả **Product Review Status panel + Entertainment Status panel**; `/lanes/content` **KHÔNG** có status panel; `/lanes/product-review` **KHÔNG** có Entertainment status panel. `git status` sạch, `data/temp` không bẩn (read-only chuẩn).

**Ý nghĩa kiến trúc:** củng cố tiếp rule chốt ở Phần 56 — **LANE NỘI DUNG = XƯỞNG SẢN XUẤT VIDEO**; **bảng điều hành/status ở Tổng quan / Trung tâm điều hành**, không nhét vào lane sản xuất. PR-B là bằng chứng thứ 2 áp đúng nguyên tắc.

**Trạng thái:** `origin/feat/ent-multichannel` = **`53cfe18`** (sau khi ghi Phần 57 sẽ tiến thêm 1 docs commit) · `master` KHÔNG đụng (`e2d0a55`). Branch `feat/ui-ent-status-panel` **chưa cleanup** (bước riêng). PR-C/D chưa làm.

---

### ✅ Phần 58 — Round UI Integration PR-C: shared read-only `buildGateCheck()` + route gate-check ĐÃ MERGE + VERIFY (2026-07-02)

> **Mục tiêu**: bước 3 của Round UI Integration — đưa logic slash command `/gate-check <jobId>` vào **backend/shared logic READ-ONLY**. Đây là **nền cho PR-D**; **CHƯA gắn UI** (nút/modal là PR-D). **PR-C đã hoàn tất, merge FF.**

**Merge:** **PR #11** (base `feat/ent-multichannel` ← head `feat/ui-gate-check-route`) merge **FF-only** bằng CLI (`git merge --ff-only`, **không** merge commit); `origin/feat/ent-multichannel` tip = **`15f65ca`**, `merge_commit_sha = 15f65ca` (REST xác nhận `merged=True`, merged_at 2026-07-02T03:18:45Z → **FF thật**). 2 file, **+288 / −0**. PR tạo tự động qua GitHub API (token credential-store, không lộ).

**Feature:** shared **`buildGateCheck(jobId)`** + route **`GET /api/studio/jobs/[jobId]/gate-check`** (READ-ONLY diagnostic).

**Scope (2 file mới, additive — KHÔNG sửa file có sẵn):**
- `apps/studio/src/lib/gate-check/build-gate-check.ts`
- `apps/studio/src/app/api/studio/jobs/[jobId]/gate-check/route.ts`
- **KHÔNG** thêm UI button/modal · **KHÔNG** sidebar · **KHÔNG** page/panel · **KHÔNG** đụng `/lanes/content` · **KHÔNG** đụng `/lanes/product-review`.

**Response contract:**
- `ok:true` khi đọc job thành công — **kể cả gate FAIL/BLOCKED**; `overallStatus` roll-up nghiệp vụ **BLOCKED > FAIL > PENDING > MISSING > PASS > UNKNOWN**; `isPassing = overallStatus==='PASS'`.
- API lỗi thật mới `ok:false`: **`INVALID_JOB_ID`** (400) · **`UNSUPPORTED_JOB_ID_PREFIX`** (400) · **`JOB_NOT_FOUND`** (404).
- Mỗi gate: `{ key, label, status, reason }`; blocker in **verbatim**.

**Dispatch theo prefix:** `job_*` → Product Review (5 gate: product_binding·source_clean·qa_render·operator_preview·launch_publish) · `ent_*` → Entertainment (intake·gate1_script·gate2_preview_audio·gate3_render·conclusion) · prefix khác → unsupported.

**Read-only boundary:** PR dùng **`loadJobById`** pure-read; Ent dùng **`readManifest`** pure-read. **KHÔNG** `getJobDetail()` (writeManifest side-effect) · **KHÔNG** `appendPublishAuditLog` · **KHÔNG** mutate `data/temp`/write manifest · **KHÔNG** slash command · **KHÔNG** production/render/QA/package/publish · **KHÔNG** FB/TikTok API · **KHÔNG** đụng PR workflow 5 bước / Ent pipeline·BGM·blur·render · **KHÔNG** expose source URL/path/token.

**Verify:** `typecheck` PASS · `build` PASS (route có trong manifest) · biome **clean** · **curl 8 case PASS**: PR PUBLISHED→overall PASS · PR FAILED→BLOCKED + blocker verbatim (`PROVIDER_PAGE_FAILED`) · PR PACKAGED cũ thiếu `cleanlinessStatus`→`source_clean=MISSING` (**trung thực, không bịa**) · Ent PREVIEW_PENDING (gate1 PASS/gate2 PENDING) · Ent INTAKE_FAILED→intake BLOCKED (`DOWNLOAD_FAILED`) · `foo_123`→400 UNSUPPORTED · `ent_khongtontai`→404 NOT_FOUND · `bad_id!!`→400 INVALID. `git status` sạch · `data/temp` không bẩn (read-only chuẩn).

**Ý nghĩa kiến trúc:** PR-C là **backend foundation** cho PR-D — PR-D mới gắn nút/modal "Kiểm tra gate" trên UI (job card). Route dùng chung cho màn điều hành; **không** đưa logic điều hành vào LANE NỘI DUNG (giữ đúng rule Phần 56).

**Trạng thái:** `origin/feat/ent-multichannel` = **`15f65ca`** (sau khi ghi Phần 58 sẽ tiến thêm 1 docs commit) · `master` KHÔNG đụng (`e2d0a55`). Branch `feat/ui-gate-check-route` **chưa cleanup** (bước riêng). PR-D chưa làm.

---

### ✅ Phần 59 — Round UI Integration PR-D: nút "Kiểm tra gate" + modal ĐÃ MERGE + VERIFY · **ROUND UI INTEGRATION (A→D) HOÀN TẤT** (2026-07-02)

> **Mục tiêu**: bước 4 (cuối) của Round UI Integration — gắn UI cho gate-check: nút per-job + modal gọi route read-only PR-C. **PR-D đã hoàn tất, merge FF. Round UI Integration A→D DONE.**

**Merge:** **PR #12** (base `feat/ent-multichannel` ← head `feat/ui-gate-check-modal`) merge **FF-only** bằng CLI (`git merge --ff-only`, **không** merge commit); `origin/feat/ent-multichannel` tip = **`1d845cd`**, `merge_commit_sha = 1d845cd` (REST xác nhận `merged=True`, merged_at 2026-07-02T03:44:58Z → **FF thật**). 3 file, **+183 / −2** (−2 = biome wrap cell `publish` liền kề, format-only). PR tạo tự động qua GitHub API (token credential-store, không lộ).

**Feature:**
- Nút **"Kiểm tra gate"** (compact, per-row) trong **Product Review Status panel** VÀ **Entertainment Status panel** — cả 2 ở **Tổng quan `/`**.
- Click → **modal** hiện: `jobId` (mono) · `lane` · `state` · **`overallStatus`** (badge màu) · `isPassing` · `blocker` (verbatim, nếu có) · `updatedAt` (nếu có) · **danh sách 5 gate** (label · status · reason). Loading + nút Đóng + map lỗi (INVALID_JOB_ID/UNSUPPORTED_JOB_ID_PREFIX/JOB_NOT_FOUND).
- **Chỉ fetch theo click từng job** — gọi route PR-C **`GET /api/studio/jobs/[jobId]/gate-check`** (read-only). KHÔNG auto-run hàng loạt.

**Scope (3 file):**
- `apps/studio/src/components/gate-check/gate-check-modal.tsx` (NEW — `GateCheckButton` client + modal)
- `apps/studio/src/components/product-review/status-panel.tsx` (MOD — +cột `gate`, `jobId={j.id}`)
- `apps/studio/src/components/entertainment/status-panel.tsx` (MOD — +cột `gate`, `jobId={j.jobId}`)
- Type dùng **type-only import** từ PR-C lib (erase-at-compile, KHÔNG kéo server code vào client bundle — precedent PR-B). `app/page.tsx` **không sửa**.

**Kiến trúc — Round UI Integration A→D HOÀN TẤT:** UI đã **thay thế đủ chức năng đọc/trạng thái/gate-check** của 3 slash command:
- `/review-status` → **Product Review Status panel** (Phần 56, PR-A)
- `/ent-status` → **Entertainment Status panel** (Phần 57, PR-B)
- `/gate-check` → shared `buildGateCheck()` + route (Phần 58, PR-C) + nút/modal (Phần 59, PR-D)
- 2 panel + nút gate đều ở **Tổng quan `/`**; **KHÔNG** đưa dashboard/status/gate overview vào LANE NỘI DUNG; **KHÔNG** đụng `/lanes/content`, `/lanes/product-review`, sidebar, page mới, `OperatorJobQueue`.

**Read-only boundary:** chỉ GET route PR-C theo click · KHÔNG POST/action/auto-run/mutate `data/temp`/write manifest · KHÔNG slash command · KHÔNG FB/TikTok API · KHÔNG production/render/QA/package/publish · KHÔNG expose source URL/path/token · KHÔNG đụng PR workflow 5 bước / Ent pipeline·BGM·blur·render.

**Verify:** `typecheck` PASS · `build` PASS (17/17, component vào client bundle `app/page.js`) · biome **clean** · API 200 (overall PASS) · browser `/`: 2 panel có nút, modal mở/đóng, PASS/BLOCKED/PENDING đúng · `/lanes/content` & `/lanes/product-review` **KHÔNG** có gate dashboard/modal · `git status` sạch · `data/temp` không bẩn.

**Trạng thái:** `origin/feat/ent-multichannel` = **`1d845cd`** (sau khi ghi Phần 59 sẽ tiến thêm 1 docs commit) · `master` KHÔNG đụng (`e2d0a55`). Branch `feat/ui-gate-check-modal` **chưa cleanup** (bước riêng).

**Bước kế (chưa làm ở Phần này):** (1) cleanup branch PR-D local + remote; (2) **round riêng cleanup GIÀN GIÁO** — xoá/di chuyển 3 skill `ent-status`/`review-status`/`gate-check` + xử lý `_archive/skills/chay/`, theo **Guardrail §10** (chỉ tháo giàn giáo khi UI thay thế đã PASS — giờ đã PASS). **KHÔNG** làm cleanup giàn giáo trong commit Phần 59.

---

### ✅ Phần 60 — Cleanup GIÀN GIÁO: gỡ 3 slash-command sau Round UI Integration A→D (2026-07-02)

> **Mục tiêu**: tháo giàn giáo tạm sau khi UI thay thế đã PASS + merge + verify (Guardrail §10). Round RIÊNG, chỉ đụng `.claude/` + docs — **KHÔNG** đụng `apps/`.

**Đã xoá (`git rm`) đúng 3 skill giàn giáo:**
- `.claude/skills/ent-status/SKILL.md`
- `.claude/skills/review-status/SKILL.md`
- `.claude/skills/gate-check/SKILL.md`

**Lý do (mỗi command đã có UI thay thế đủ chức năng, đều ở Tổng quan `/`):**
- `/review-status` → **ProductReviewStatusPanel** (Phần 56, PR-A `cc24b72`).
- `/ent-status` → **EntertainmentStatusPanel** (Phần 57, PR-B `53cfe18`).
- `/gate-check` → **buildGateCheck route** (Phần 58, PR-C `15f65ca`) + **GateCheckButton modal** (Phần 59, PR-D `1d845cd`).
- **Guardrail §10 thỏa điều kiện:** UI thay thế đã PASS + merge FF + verify. "Giàn giáo chỉ tháo khi công trình đã đứng."

**An toàn xoá:** grep toàn repo → **KHÔNG có invocation runtime**; match chỉ là feature UI (route/component/lib gate-check) + comment giải thích + docs; `settings.json` KHÔNG ref. Xoá folder chỉ **unregister typed-invoke command** cho session sau; reversible (còn trong git history). Sau xoá `.claude/skills` còn **6 skill auto-trigger** (`vfos-command-center`, `vfos-git-safety`, `vfos-product-review-workflow`, `vfos-shopee-affiliate`, `vfos-ui-review`, `vfos-evidence-gated-research`).

**GIỮ `.claude/_archive/skills/chay/` (quyết định Operator):**
- `chay/` là **lane/tính năng NGỦ ĐÔNG** (Shopee-First short-form + FB Reels), **KHÔNG** phải giàn giáo của Round UI Integration, **không** có UI thay thế tương đương.
- Đã archived (ngoài registry active), không làm nặng context. **Giữ nguyên** — không xoá trong round này (dù Guardrail §10 có liệt kê — Operator chốt ghi đè, giữ ngủ đông).
- **GIỮ** `.claude/_archive/skills/pending-rebuild/` (2 skill parked chờ rebuild: proactive_support, revenue_experiment_strategist).

**Không đụng:** `apps/` · Product Review workflow 5 bước · Entertainment pipeline · `master` · runtime/media/secret.

**Trạng thái:** branch `chore/cleanup-scaffolding-skills` từ `feat/ent-multichannel` @ `c9b8227`. Chưa commit/push lúc ghi Phần này (state doc + guardrail note đi cùng commit cleanup). `master` KHÔNG đụng (`e2d0a55`).

---

### ✅ Phần 61 — Phase 0: Chốt reframe IA "VFOS = Affiliate Video Operating System" + doc IA chính thức (2026-07-02)

> **Mục tiêu**: ghi nhận chính thức định nghĩa mới của Operator + tạo doc IA chuẩn. Round **CHỈ DOC** — KHÔNG code UI, KHÔNG sửa nav/analytics, KHÔNG đụng pipeline/runtime/secret.

**Bối cảnh:** trước đó 2 vòng research (GitHub UI Benchmark 18 repo + Supplement 10 repo, tất cả **star verified** từ GitHub API, chạy qua Workflow đa-agent) → chốt hướng **Concept C (Hybrid Command Center + Video Factory)**. Operator định nghĩa lại: **VFOS = Affiliate Video Operating System**.

**Quyết định chốt (Phase 0):**
- **Concept C giữ lõi** (monitor≠make, 1 token system, gated stepper, no-auto-publish). **Chỉ mở rộng SCOPE của Overview**: từ readiness-only → **Dashboard báo cáo kết quả** (kiểm soát/thống kê/hiệu suất/affiliate/doanh thu/lợi nhuận/To-Do).
- Ranh giới cứng: Dashboard = report/read-only; Lane = make/produce/publish. Revenue/affiliate reporting **thuộc Dashboard**; produce/render/package/publish **thuộc Lane**.

**Doc đã tạo/sửa (round này):**
- 🆕 `docs/00_DIEU_HANH/VFOS_STUDIO_IA_AFFILIATE_VIDEO_OS_V1.md` — **IA chính thức hiện hành**: Dashboard 7 nhánh (Kiểm soát & Sức khỏe · Việc Operator cần làm · Hiệu suất Video/Kênh/Nền tảng · Hiệu suất Affiliate · Doanh thu & Lợi nhuận · Sản phẩm tạo doanh thu · Báo cáo Chiến dịch/Nội dung); Lane 7 bước (Chọn Ngách/Kênh · Tải/Clean nguồn · Sản xuất · Xem trước & Duyệt · Đóng gói · Đăng đa nền tảng · Vòng lặp nhiều video); mapping route + sidebar; 6 gap; Phase 1–5.
- ✏️ `VFOS_UI_ARCHITECTURE_V1.md` — thêm con trỏ **SUPERSEDE riêng phần Overview-scope** (§1-A1 & §2); mọi luật an toàn khác giữ nguyên.

**Gap ghi rõ (đọc code xác nhận):** G1 chưa có ingestion affiliate revenue/commission tự động (mới có manual revenue + FB/TikTok view/click insights) 🔴 · G2 `/analytics` còn trộn mock+real 🔴 · G3 chưa có Operator To-Do hợp nhất 🟠 · G4 chưa có job-bound revenue attribution 🟠 · G5 TikTok data mỏng (SELF_ONLY, insights read-only) 🟡 · G6 V1 từng gỡ KPI khỏi Overview → reframe là quyết định mới 🟡.

**Phase kế (đã duyệt hướng):** Phase 1 IA/nav → Phase 2 Operator To-Do → Phase 3 real-only gating/quarantine fixture → Phase 4 affiliate revenue ingestion + job-bound attribution → Phase 5 revenue/affiliate/product reporting. **Thứ tự lõi: IA trước, KHÔNG dựng chart tiền trước khi có data thật.**

**Ràng buộc tuân thủ:** không mock doanh thu (No-Go #6) · không chart tiền khi chưa có data thật · không KPI trong Lane · không nút sản xuất trên Dashboard · không đụng pipeline/runtime/secret.

**Trạng thái:** 3 file doc commit trên `feat/ent-multichannel` (scoped staging, **KHÔNG push** — chờ Operator). `master` KHÔNG đụng (`e2d0a55`). **Bước tiếp theo duy nhất:** dựng plan **Phase 1 (IA/nav)** — vẫn chưa code UI.
> *(Cập nhật sau: Phase 0 đã push — commit `166a419`.)*

---

### ✅ Phần 62 — Phase 1: IA/nav reframe (sidebar theo Affiliate Video OS) ĐÃ CODE + VERIFY + PUSH (2026-07-02)

> **Mục tiêu**: chỉnh sidebar/nav phản ánh IA mới (doc `VFOS_STUDIO_IA_AFFILIATE_VIDEO_OS_V1.md`). Round UI **chỉ đổi nhãn/nhóm nav** — KHÔNG đổi route, data, chart, hay logic trang.

**Đã làm:**
- Đổi `NAV_GROUPS` trong `apps/studio/src/lib/nav.ts`: nhóm `TRUNG TÂM ĐIỀU HÀNH` → **`DASHBOARD`**; item `/analytics` đổi nhãn `Hiệu suất / Analytics` → **`Hiệu suất & Báo cáo`** và **chuyển từ nhóm `KẾT QUẢ / TƯƠNG TÁC` lên `DASHBOARD`**; nhóm `LANE NỘI DUNG` → **`LANE NỘI DUNG / XƯỞNG SẢN XUẤT`** (giữ 2 item Review Sản phẩm + Nội dung/Giải trí); `CẤU TRÚC` giữ nguyên; `KẾT QUẢ / TƯƠNG TÁC` còn Lịch sử & Evidence + Bình luận & Mắt thần; renumber `no` 1→7.
- `sidebar.tsx` **KHÔNG đổi** (render group generic từ `NAV_GROUPS`; nhãn dài tự wrap). `NAV_ITEMS`/`no` không dùng ở đâu khác trong app → renumber an toàn.

**File app đã sửa:** `apps/studio/src/lib/nav.ts` (DUY NHẤT, +23/−14).

**Verify:**
- `pnpm --filter @vfos/studio typecheck` **PASS** · `pnpm --filter @vfos/studio build` **PASS** (mọi route compile).
- Browser smoke 7 trang trên dev `localhost:3002` đều **HTTP 200**: `/`, `/analytics`, `/lanes/product-review`, `/lanes/content`, `/history`, `/comments`, `/channels`.
- Operator duyệt UI thật (theo vfos-ui-review-skill) — OK.

**Commit/push:** `dde3004` `feat(studio): reframe navigation IA for affiliate video OS` — **ĐÃ PUSH `origin/feat/ent-multichannel`, local == origin**. Phase 0 (`166a419`) cũng đã push trước đó. `master` KHÔNG đụng (`e2d0a55`).

**Ngoài Phase 1:** `docs/prototypes/` là **untracked concept HTML do Operator tự tạo/mở** — KHÔNG thuộc Phase 1, KHÔNG stage, KHÔNG đụng.

**Bước tiếp theo:** **Phase 2 = Operator To-Do hợp nhất** (gom OperatorJobQueue + 2 status panel + gate-check thành 1 to-do có đếm số + severity trên Dashboard; dùng job data hiện có, KHÔNG cần data affiliate mới). **Chưa code** — mới ở mức plan.

---

### ✅ Phần 63 — Phase 2A: Operator To-Do hợp nhất (tối thiểu) ĐÃ CODE + VERIFY + PUSH (2026-07-02)

> **Mục tiêu**: gom "việc Operator cần làm bây giờ" (đang rải ở 3 component) thành 1 surface READ-ONLY trên Dashboard. Dùng job data sẵn có, KHÔNG data affiliate mới, KHÔNG route mới.

**Đã làm:**
- 🆕 `apps/studio/src/lib/overview/operator-todo.ts` — lib **pure read-only** `buildOperatorTodo(prJobs, entJobs)`: bucket theo `job.state` THẬT + đếm + sắp ưu tiên. Không I/O, không mock, không mutate.
- 🆕 `apps/studio/src/components/overview/operator-todo.tsx` — component READ-ONLY: fetch `/api/studio/jobs` (source='real') + `/api/studio/entertainment/status` (ok===true) sẵn có, render count strip + list ưu tiên.
- ✏️ `apps/studio/src/app/page.tsx` — chèn `<OperatorTodo />` làm **band ĐẦU** Dashboard (additive — KHÔNG gỡ OperatorJobQueue / 2 status panel / ProductQueue).

**Hành vi chốt:**
- Count strip **chỉ 5 bucket dẫn từ state thật**: **Lỗi · Chờ duyệt · Chờ đăng · Chờ đóng gói · Thiếu nguồn** (reconcile được với panel cũ, mỗi job 1 bucket, không double-count; job in-flight/terminal không hiện).
- **KHÔNG hiển thị BLOCKED/"Bị chặn"** ở count strip — gate-rollup tổng hợp để **Phase 2B** (Operator chốt bỏ chip để không hiểu nhầm "0 = không có job bị chặn").
- Mỗi dòng: bucket + jobId + lane + tên + thời gian + **"Vào lane →"** (điều hướng) + **"Kiểm tra gate"** (drawer read-only sẵn có). Gate blocker xem per-job qua "Kiểm tra gate".
- **KHÔNG** nút produce/render/package/publish trên Dashboard (report ≠ make).

**Verify:** typecheck **PASS** · build **PASS** · Biome **sạch** · dev `localhost:3002` `/`=200 · **Operator đã duyệt UI**.

**Commit/push:** `d39a365` `feat(studio): add operator todo overview surface` (3 file, +362) — **ĐÃ PUSH `origin/feat/ent-multichannel`, local == origin**. `master` KHÔNG đụng (`e2d0a55`). `docs/prototypes/` là untracked concept của Operator — KHÔNG stage.

**Bước tiếp theo — Phase 2B (chưa code):** nối gate-rollup cho bucket **BLOCKED** (từ `buildGateCheck` overallStatus) + severity band/polish thứ tự ưu tiên; **nếu** muốn gộp/thay 3 panel cũ bằng To-Do surface → **BẮT BUỘC Step Inventory 6 cột trước (No-Go #9)**.

---

### ✅ Phần 64 — Phase 2B-1: Gate-rollup BLOCKED thật cho Operator To-Do ĐÃ CODE + VERIFY + PUSH (2026-07-02)

> **Mục tiêu**: bucket **BLOCKED / "Bị chặn"** trong Operator To-Do phải là **dữ liệu gate THẬT** (từ `buildGateCheck`), KHÔNG fake, KHÔNG chip 0 gây hiểu nhầm. Tính server-side, read-only.

**Đã làm:**
- 🆕 `apps/studio/src/app/api/studio/overview/todo/route.ts` — route **READ-ONLY** `GET /api/studio/overview/todo`, `source: 'real'`, `dynamic = 'force-dynamic'`. Gom job 2 lane (`loadOperatorJobs` + `listEntStatusForUi`) → chọn tập actionable → gọi `buildGateCheck(jobId)` server-side cho từng actionable job để tính gate rollup → phân loại lại với precedence gate. **KHÔNG side-effect, KHÔNG mutate, KHÔNG pipeline/render/publish.**
- ✏️ `apps/studio/src/lib/overview/operator-todo.ts` — thêm `GateRollup` + tham số `gateMap` optional cho `buildOperatorTodo`. Hàm vẫn **PURE** (không import `buildGateCheck` server-only; route truyền `gateMap` đã tính vào). Precedence: **gate BLOCKED > (state FAILED | gate FAIL) > READY_FOR_REVIEW > READY_TO_PUBLISH > READY_TO_PACKAGE > (state MISSING | gate MISSING)** — mỗi job đúng 1 bucket, không double-count.
- ✏️ `apps/studio/src/components/overview/operator-todo.tsx` — fetch 1 route `/api/studio/overview/todo` (không còn bucket client / không gọi gate per-job). Chip "Bị chặn" **chỉ hiện khi `gateComputed > 0`** (không bao giờ chip BLOCKED=0 giả). Mỗi dòng hiện `state:` GỐC + blocker verbatim (dòng BLOCKED/FAILED). Banner cap khi `gateCapped`.

**Hành vi chốt:**
- **Gate-check cap = 30 actionable jobs mỗi lần load** (`GATE_CHECK_CAP`), vì `buildGateCheck` đọc file/job (I/O). Vượt cap → `gateCapped = true` + `capNote` hiển thị banner — **KHÔNG silent cap**. Mỗi call `buildGateCheck` bọc `try/catch`: 1 job lỗi gate → bỏ qua, phân loại theo state — **KHÔNG giả BLOCKED**.
- **BLOCKED/"Bị chặn" = dữ liệu gate thật**, không fake. **BLOCKED thắng FAILED** theo precedence (job state=FAILED nhưng gate `qa_render` BLOCKED → hiện bucket BLOCKED, `state:` vẫn ghi `FAILED`).
- UI vẫn hiển thị **state gốc mỗi dòng** (ví dụ `state: FAILED`) + **blocker verbatim** nếu có.
- Mỗi dòng giữ **"Vào lane →"** + **"Kiểm tra gate"** (drawer read-only). **KHÔNG** nút produce/render/package/publish trên Dashboard (report ≠ make).
- Data thật khi verify: **32 actionable · gateComputed 30 · gateCapped true · 17 BLOCKED** (job FAILED→gate `qa_render` BLOCKED) — counts reconcile, không double-count.

**Verify:** typecheck **PASS** · build **PASS** · Biome **sạch** · dev `localhost:3002` `/`=200 · **Operator đã duyệt UI**.

**Commit/push:** `356c1b4` `feat(studio): real gate-rollup for operator todo blocked bucket` — **ĐÃ PUSH `origin/feat/ent-multichannel`, local == origin**. `master` KHÔNG đụng (`e2d0a55`). `docs/prototypes/` untracked concept — KHÔNG stage.

**GOTCHA (ghi để không lặp):** **đừng chạy `pnpm build` khi dev server đang chạy** — production build đè `.next` khiến dev trả HTTP 500 (không phải lỗi code). Build trước rồi mở dev, hoặc restart dev sạch sau build.

**Bước tiếp theo — Phase 2B-2 (chưa code):** severity band + polish (nhóm BLOCKED/FAILED nổi bật, chốt thứ tự ưu tiên, density/empty-error). **Nếu** muốn gộp/thay 3 panel cũ (OperatorJobQueue + 2 status panel) bằng To-Do surface → **BẮT BUỘC Step Inventory 6 cột trước (No-Go #9)**.

---

### ✅ Phần 65 — Phase 2B-2: Severity band + polish cho Operator To-Do ĐÃ CODE + VERIFY + PUSH (2026-07-02)

> **Mục tiêu**: polish UI Operator To-Do cho dễ vận hành — nhấn nhóm nguy cấp, làm rõ thứ tự ưu tiên, gọn empty/loading/error/cap note. **UI-only: KHÔNG đổi data model, KHÔNG thêm action sản xuất/publish.**

**Đã làm (chỉ 2 file):**
- ✏️ `apps/studio/src/lib/overview/operator-todo.ts` — **CHỈ thêm metadata severity** (thuần UI): `TodoSeverity` (`critical|action|missing`) + `TODO_SEVERITY_ORDER` + `TODO_BUCKET_SEVERITY` (map bucket→tier) + `TODO_SEVERITY_LABEL` + `TODO_SEVERITY_ACCENT`. **KHÔNG đụng** `buildOperatorTodo` / counts / precedence.
- ✏️ `apps/studio/src/components/overview/operator-todo.tsx` — severity band 3 nhóm + row prominence + polish empty/loading/error/cap.
- **Route `GET /api/studio/overview/todo` KHÔNG đổi.**

**Hành vi chốt:**
- **Severity band 3 tier** đầu To-Do (thay strip phẳng): **Nguy cấp** (BLOCKED+FAILED, tone rose — nổi bật nhất) · **Cần thao tác** (Chờ duyệt+Chờ đăng+Chờ đóng gói, cyan) · **Thiếu nguồn** (MISSING, amber). Mỗi card = tổng tier + mini-chip từng bucket; card có job tô nền/viền theo tone, rỗng thì dịu.
- **Counts KHÔNG đổi** (khớp Phần 64): `totalActionable 32` · BLOCKED 17 · FAILED 0 · READY_FOR_REVIEW 8 · READY_TO_PUBLISH 2 · READY_TO_PACKAGE 1 · MISSING 4. Tổng tier chỉ **derive** từ `counts` sẵn có: Nguy cấp = 17+0 = **17** · Cần thao tác = 8+2+1 = **11** · Thiếu nguồn = **4** (= 32).
- **Dòng nguy cấp nổi bật**: BLOCKED/FAILED có viền + nền rose nhạt; dòng khác giữ hairline trung tính. Blocker verbatim (⛔) chỉ ở dòng critical.
- **BLOCKED honesty giữ nguyên**: tier Nguy cấp loại BLOCKED khi `gateComputed=0` — **KHÔNG fake 0**.
- **Empty**: "Không có việc cần xử lý." + subline "Mọi job đang chạy hoặc đã hoàn tất." · **Loading**: dot pulse gọn · **Error**: banner rose "Dashboard vẫn an toàn — thử tải lại trang." (không crash) · **Cap note**: giữ, style gọn (⚠ + capNote).
- **UI giữ read-only**: chỉ **"Vào lane →"** + **"Kiểm tra gate"**. **KHÔNG** nút produce/render/package/publish trên Dashboard.

**Verify:** Biome **sạch** · typecheck **PASS** · build **PASS** · dev `localhost:3002`: `/`=200, `/lanes/product-review`=200, `/lanes/content`=200, `/api/studio/overview/todo` `ok:true` (counts khớp) · **Operator đã duyệt UI**.

**Commit/push:** `7016d58` `feat(studio): polish operator todo severity view` (2 file, +127/−32) — **ĐÃ PUSH `origin/feat/ent-multichannel`, local == origin**. `master` KHÔNG đụng (`e2d0a55`).

**Chưa làm / ranh giới:** **CHƯA gộp/xoá 3 panel cũ** (OperatorJobQueue + 2 status panel). Muốn gộp/thay bằng To-Do surface → **BẮT BUỘC Step Inventory 6 cột trước (No-Go #9)**.

---

### ✅ Phần 66 — Round 1: Revenue Feedback Loop V1 — đóng vòng đo lường cho video đã đăng (2026-07-03)

> **Mục tiêu**: đóng vòng lặp "làm video → đăng → đo → nhìn thành quả" cho video **ĐÃ ĐĂNG THẬT** — số M3–M6 (view/click/đơn/doanh thu) đập vào **TỪNG video cụ thể**. Xuất phát từ audit ngoài (Gemini) verdict "ra video + đo, dừng refactor". Verify: hạ tầng đo đã dựng ~80% → chỉ **nối phần thiếu bằng reuse, KHÔNG refactor God-file**.

**Đã làm — R1a (số đập vào JOB):**
- ✏️ `apps/studio/src/lib/studio-data/jobs.ts` — fix `loadJobById` merge `evidence` (bug: chỉ `loadOperatorJobs` merge → job đơn lẻ mất số) + export `computeJobEvidenceSummary`. Tái dùng nguyên `evidenceByJob()`.
- ✏️ `apps/studio/src/app/history/page.tsx` — block **"Số liệu đã đo (M3–M6)"** đọc `job.evidence` (đã có trên wire qua `/api/studio/jobs`); chưa đo → "Chưa đo" (**KHÔNG bịa 0**).

**Đã làm — R1b (số đập vào VIDEO):**
- 🆕 `apps/studio/src/app/api/studio/jobs/[jobId]/thumbnail/route.ts` — stream `vision_frames/frame_001.jpg` (fallback 002/003), chống traversal; thiếu → 404.
- ✏️ `apps/studio/src/lib/growth-data/load.ts` — `loadRealPublishedVideos()` inventory video FB đã đăng THẬT (scan `data/temp/jobs/*` state PUBLISHED), **real-first**, fallback fixture.
- 🆕 `apps/studio/src/components/analytics/per-video-evidence-section.tsx` — bảng **mỗi video 1 dòng** (thumbnail + tiêu đề + "Xem bài ↗" + "Link affiliate ↗" + số M3–M6) + nút **"Nhập số cho video này"**; thumbnail có **nhãn rõ "frame nguồn"** — **KHÔNG phải cover Facebook thật**.
- ✏️ `apps/studio/src/components/analytics/manual-input-preview.tsx` — nhận **prefill theo video** (chèn dòng CSV đúng jobId/postId); save vẫn qua route local-only cũ (**0 đổi contract**).
- ✏️ `apps/studio/src/app/analytics/page.tsx` — dựng rows + render section (thay ô nhập standalone).

**Verify:** `tsc --noEmit` **0 lỗi** (2 lần) · thumbnail route **200** jpeg thật / **404** / **400** · `/analytics` render dữ liệu **THẬT** (permalink `facebook.com/reel/…`, link `s.shopee.vn/…`) · **vòng lặp end-to-end**: POST 1 snapshot → evidence job đập `{views 12.345 · clicks 678 · đơn 9 · doanh thu 1.500.000}` + bảng per-video hiện số (trước đó "—") → **runtime store đã khôi phục rỗng** (không để lại data test) · **working tree CLEAN** sau commit code.

**Commit/push:** `b281386` `feat(studio): close revenue feedback loop for published videos` (**7 file, +465/−9**) — branch **`feat/ent-multichannel`, LOCAL (CHƯA push)**. `master` KHÔNG đụng (`e2d0a55`).

**An toàn:** runtime `manual-performance-snapshots.json` **GITIGNORED**, không stage · không registry/`.env`/secret/media · stage đích danh **7 file** (không `git add -A`).

**Bước tiếp theo — R2 Entertainment affiliate (TẠM HOÃN):** trước khi làm R2 **phải chốt nguồn affiliate cho lane giải trí**: (a) **product-of-day theo niche** · (b) **Operator gán tay lúc package** · (c) **contextual pool**. **KHÔNG thiết kế sâu R2 trong doc này.** Điểm chèn (tham khảo, chưa làm): `EntPackageSummary.affiliateLink` + `scripts/ent-vlog/16-package.ts` + `entertainment/package-panel.tsx`.

---

### ✅ Phần 67 — Revenue Attribution G2/G1/G4: THỰC THI đủ Slice 1→6 + hardening theo adversarial review (2026-07-07 → 08)

> **Goal Operator (autonomous)**: thực thi trọn spec `VFOS_REVENUE_ATTRIBUTION_SPEC_V1.md` (`c50ee8e`) Slice 1→6, 3 ranh giới cứng: KHÔNG refactor god-file/scripts, KHÔNG fake success, G4 read-side only. Cả 3 đã giữ nguyên vẹn (diff `624532f..3c7f796` không đụng `scripts/`).

**8 commit trên `feat/ent-multichannel` (LOCAL, CHƯA push):**
- `39f2a4a` **Slice 1 — G2 gate**: `NoRealData` (kind metric/money) + `loadPerformanceMetricsWithSource`/`loadCtaRoleMetricsWithSource` (real-first, wrapper cũ behavior-preserving) + bọc mọi section fixture ở `/analytics` + env `VFOS_SHOW_FIXTURE_ANALYTICS` (default OFF). **Money card KHÔNG BAO GIỜ render fixture, kể cả flag ON.**
- `e3ceda9` **Slice 2 — G4 store+resolver**: `published-posts.json` store (dedupe `pp_<jobId>`) + `attribution.ts` (`resolvePublishedPost` exact-match, derive-on-read fallback từ artifact; KHÔNG code path latest/sort). Verify: **17/17 job PUBLISHED resolve đúng postId/shortLink qua fallback**; jobId lạ/traversal → null.
- `c0e35b6` **Slice 3 — G4 writer hook**: publish route nhánh success materialize `PublishedPost` (try/catch cô lập — store-write fail KHÔNG đổi HTTP 200; re-publish no-op). KHÔNG đụng `scripts/job-facebook-publish-command.ts`.
- `e86eef4` **Slice 4 — G1 entity+connector**: `ShopeeRevenueSnapshot` (VND nguyên, jobId nullable tường minh) + shopee revenue store + `ManualCsvShopeeConnector` PURE (attribution match shortLink/itemId; 1 job=success, nhiều job=partial-không-đoán, 0=unattributed) + `ShopeeAffiliateApiConnector` stub (No-Go #2).
- `0727bff` **Slice 5 — fold evidence**: revenue M5 **precedence-không-sum** (`shopee_affiliate_api > manual_csv > manual`), engagement additive giữ nguyên, `JobEvidenceSummary.revenueSource` minh bạch nguồn tiền, null-không-bịa-0.
- `b8e5a03` **Slice 6 — import route** `analytics/shopee-revenue/import`: local-only 403 + secret-scan + all-or-nothing + idempotent; context attribution CHỈ từ bài đăng THẬT.
- `440dca4` **fix bind `127.0.0.1`** cho dev/start (apps/studio/package.json — CHỈ scripts, không dependency): vá finding major "LAN host-spoof ghi được doanh thu giả vào money store" (netstat verify: chỉ còn `127.0.0.1:3002`).
- `3c7f796` **hardening theo adversarial review** (workflow 4 reviewer + verify, ~2.5M token): connector chỉ nhận digit thuần (chặn `500.000`→500 sai 1000 lần), đúng 9-10 cột (chặn lệch cột do phẩy nghìn), header khớp đúng tên cột đầu, ISO date bắt buộc, snapshotId chống va chạm (batch orderRef từng nuốt dòng tiền); fold tách `evidence-fold.ts` PURE + 9 unit test; `revenueSource` chỉ set khi có tiền thật (>0); **fake-0 engagement** vá ở 3 consumer (history + operator-job-queue + batch-progress: job chỉ-Shopee hiện "—", không "0 clicks · 0 đơn" giả); import route cảnh báo **kỳ chồng lấn** (chống đếm trùng trong tier); real KPI lấy latest-per-post (chống cộng trùng time-series), ctr về phân số như fixture; breakdown ngách/nền tảng/top-video là join-fixture nên KHÔNG mang nhãn "số thật" (real → empty-state chờ join real); money card reason phản ánh đúng số dòng Shopee thật trong store.

**Verify:** typecheck 0 lỗi sau mỗi slice · build production PASS · test `tsx --test` **23/23** (connector 13 + fold 9 + stub 1) + cn-search 14/14 không vỡ · UI flag OFF: 9/9 check (empty-state, 0 số fixture, per-video thật giữ nguyên, không NaN) · flag ON: 7/7 (fixture trở lại TRỪ money) · e2e thật: import CSV khớp shortLink `job_20260617_002` → attribution success → evidence per-video hiện đúng tiền + nhãn "Shopee CSV" + cảnh báo chồng lấn hoạt động → **runtime store khôi phục sạch sau test** · route bad-path: 403 host lạ / 400 BAD_JSON / 400 SENSITIVE / 400 INVALID_ROWS / idempotent duplicate.

**Finding ghi nhận (không vá round này):** resolver ưu tiên store trước derive có thể stale nếu re-publish cùng job qua CLI (route đã chặn `alreadyPublished`; thứ tự do spec B.2 quy định) · Shopee conversions KHÔNG fold vào evidence.conversions (quyết định scope spec C.3, tránh double-count với đơn nhập tay) · nhánh real KPI là hook chờ (FB Insights hiện không trả views/clicks, TikTok chưa map job) · `growth:smoke` FAIL **pre-existing từ base `624532f`** (alias `@/` không resolve khi tsx không có TSX_TSCONFIG_PATH + fixture referential lệch channels real) — đề xuất round hygiene riêng.

**⚠ NGOÀI SCOPE — 4 file entertainment bị modified trong working tree KHÔNG do round này** (`entertainment/channels/[channelId]/source-videos/route.ts`, `entertainment/jobs/route.ts`, `intake-panel.tsx`, `entertainment/jobs.ts` — nội dung: guard DUPLICATE_SOURCE + diagnostics log, tham chiếu cặp job trùng 232632/232656 ngày 26/06). Xuất hiện giữa phiên, nghi từ session/agent khác của Operator. **KHÔNG stage, KHÔNG revert — chờ Operator xác nhận.**

**Trạng thái duyệt:** UI Operator CHƯA review bằng mắt (dev server localhost:3002 flag OFF sẵn sàng: `/analytics`, `/history`, `/`) · **CHƯA push** — chờ Operator duyệt commit list (lưu ý `440dca4` đụng `apps/studio/package.json` phần scripts, cần Operator gật riêng theo git-safety).

**Bước tiếp theo duy nhất:** Operator review UI `/analytics` (flag OFF là chế độ thật) + duyệt 8 commit → GO push. Sau đó: nối UI paste-CSV cho import route (Slice 6 hiện là route thuần) hoặc join real cho breakdown ngách/nền tảng — chọn theo North Star.

---

### ✅ Phần 68 — Operator DUYỆT Phần 67 → PUSH + cách ly WIP + hygiene growth:smoke (2026-07-08)

> Operator xác nhận UI OK (empty-state chuẩn, không còn mock) và ra lệnh 3 bước theo thứ tự.

1. **PUSH ✅**: 9 commit `39f2a4a..00c5a34` đã lên `origin/feat/ent-multichannel` (`624532f..00c5a34`, verify `git branch -r --contains` + ahead 0). Operator chấp thuận rõ thay đổi bảo mật `127.0.0.1` (`440dca4`, package.json scripts).
2. **CÁCH LY WIP ✅**: 4 file entertainment (fix outage lane Giải trí của session song song) đưa vào `stash@{0}` message **"WIP: Ent lane outage fix"** — KHÔNG commit/stage; lấy lại bằng `git stash pop`. Working tree **CLEAN 100%**. Memory session outage-fix đã được ghi chú vị trí stash.
3. **HYGIENE `growth:smoke` ✅** (`1b09d0e`, LOCAL chưa push): 2 fix gốc trong `load.ts` — (a) `resolveInsideRepo` import qua `./paths` (re-export sẵn) thay alias `@/` → chuỗi smoke alias-free, `pnpm growth:smoke` chạy thẳng không cần TSX_TSCONFIG_PATH; (b) `loadGrowthSnapshot()` (caller duy nhất = smoke) cố định **fixture-only** cho channels/performanceMetrics/ctaRoleMetrics — hết trộn channels real với plans/posts fixture (nguyên nhân referential fail oan, drift từ round channels real-first; đúng Guardian Luật 4 không trộn nguồn). KHÔNG fake pass: mọi check của smoke giữ nguyên, chỉ sửa nguồn dữ liệu cho nhất quán. Verify: `pnpm growth:smoke` **✅ SMOKE PASS** · typecheck 0 lỗi · test 37/37 (connector 13 + fold 9 + stub 1 + cn-search 14) · `/analytics` HTTP 200.

**Trạng thái git:** local ahead origin **2 commit** (`1b09d0e` fix + commit docs Phần 68 này) — chờ GO push đợt kế. Stash: `stash@{0}` WIP ent lane.

**Bước tiếp theo duy nhất:** Operator GO push 2 commit hygiene/docs → rồi chọn round kế theo North Star: (a) UI paste-CSV cho Shopee import route (nạp CSV diện rộng — smoke đã xanh theo yêu cầu tiền đề), hoặc (b) join real cho breakdown ngách/nền tảng ở /analytics. Session ent lane: `git stash pop` khi quay lại + Operator review UI 4 fix đó.

---

### ✅ Phần 69 — UI Paste-CSV nạp doanh thu Shopee + fix đếm-trùng-tiền (2026-07-08 → 09, PUSHED `ea5e662`)

> Operator GO push 2 commit chờ (`1b09d0e`+`e9974ee` → origin, sync 0/0) rồi giao round UI Ingestion: component Paste-CSV trên `/analytics` bám G1/G4 Phần 66-67. Operator đã **duyệt UI thật** ("hoạt động tốt, test dedupe và báo lỗi chuẩn") → GO commit+push `ea5e662`.

**Deliverable (5 file, commit `ea5e662` ĐÃ PUSH origin/feat/ent-multichannel):**
1. **`shopee-csv-import-card.tsx` (MỚI)** — client card trên `/analytics` ngay dưới money card: textarea paste CSV thuần (không upload), hint format (cột đúng thứ tự · ngày ISO · tiền digit thuần · all-or-nothing), đếm dòng data client trước gửi, nút "Nạp dữ liệu" POST route import; feedback: ghi mới/trùng bỏ qua/attribution 3 loại/lỗi từng dòng (box đỏ)/cảnh báo chồng lấn + trùng nội dung (amber); thành công → clear textarea + `router.refresh()` cho Evidence M3–M6.
2. **Route import: content-dedupe chống đếm trùng TIỀN** — finding MAJOR từ adversarial review (8 agent, 5/5 finding sống refute): snapshotId anchor theo jobId nên cùng dòng CSV re-import sau khi attribution đổi (unattributed→jobId) sinh id khác → dedupe id trượt → cùng commission ghi 2 lần. Fix: `shopeeContentKey(snapshotId)` (pure, bỏ segment anchor — slug không bao giờ sinh `__` nên split an toàn) + route so content-key với store, trùng → BỎ QUA + trả `contentDuplicates` báo rõ. Verify sống end-to-end trên dev server (đổi anchor trong store test → re-import bị chặn, totalAfter giữ 1); store test xoá sạch sau verify.
3. **`/analytics` thêm `force-dynamic`** — finding MAJOR #2: page thiếu nó sẽ bị prerender TĨNH lúc `next build` → `next start` đóng băng trạng thái tiền (router.refresh trả payload cũ). Build verify: `/analytics` = `ƒ` dynamic.
4. **UI hardening** (3 finding minor): savedCount=0 → box trung tính + nhãn "số của dòng ĐÃ GỬI, không phải tiền mới"; attribution stats tính trên toSave (không tính dòng bị bỏ); dedupe key list cảnh báo.
5. **Test 40/40** (+3 test `shopeeContentKey`: anchor đổi giữ content-key, kỳ/orderRef khác → key khác, jobId ký tự lạ không phá segment) · typecheck 0 lỗi · `next build` PASS · smoke không đụng.

**Quy trình:** ultracode adversarial review (3 lăng kính contract/No-Go-UX/security → refute-verify từng finding) TRƯỚC khi trình Operator; UI review skill đúng flow (dev:clean → typecheck → build → dev + URL); No-Go #6 giữ: component không sinh số, mọi validate/ghi server-side all-or-nothing.

**Trạng thái git:** `ea5e662` đã push, sync 0/0 (commit docs Phần 69 này sẽ chờ GO push riêng). Stash: `stash@{0}` WIP ent lane còn nguyên.

**Bước tiếp theo duy nhất:** Operator nạp CSV Shopee THẬT đầu tiên qua UI (khi có export từ Shopee Affiliate dashboard) → tiền thật hiện ở Evidence M3–M6; round kế theo North Star: join real cho breakdown ngách/nền tảng ở /analytics, hoặc quay lại session ent lane (`git stash pop` + review UI 4 fix outage).

---

### ✅ Phần 70 — Round Hygiene: pop stash ent lane + hoàn thiện + commit `2571d97` (2026-07-09)

> Operator ra lệnh 3 bước: (1) push docs `aab852f` ✅ (origin sync); (2) pop `stash@{0}` lấy 4 file fix outage lane Giải trí, phân tích-hoàn thiện-commit tách biệt; (3) `growth:smoke` phải PASS.

1. **POP STASH ✅**: `git stash pop` sạch không conflict, đúng 4 file (intake-panel, ent jobs.ts, jobs route, source-videos route). Stash list giờ RỖNG.
2. **PHÂN TÍCH + HOÀN THIỆN ✅**: adversarial review (2 lăng kính integration/regression + refute-verify) 5/7 finding sống + 1 finding tự verify (verifier chết session limit). 3 hardening áp thêm TRƯỚC commit:
   - **[MAJOR] Zombie INTAKE_RUNNING**: intake chạy SYNC (spawnSync 240s) — process bị kill giữa chừng thì manifest kẹt RUNNING vĩnh viễn → giữ khoá dedup + chặn 409 mãi (fix C gốc còn đóng nốt lối thoát dán-tay). Fix: `isDeadIntakeRunning` (RUNNING quá `FETCH_TIMEOUT_MS+60s` theo updatedAt = chết) — skip ở cả `reusedSourceKeys` lẫn `findLivingJobBySourceKey`.
   - **[FALSE-POSITIVE 409]** `canonicalVideoKey` vứt query → 2 video `discover?modal_id=` khác nhau va key. Fix: guard 409 chỉ khớp khoá MẠNH (aweme_id `/video/<id>` hoặc share-link đã resolve trong `.source_id_cache.json` — đọc sync, vá luôn asymmetry share-link); khoá yếu đòi URL trùng nguyên văn.
   - **Cache client 409-loop**: `latestUnreused` giờ clear cả nhánh fail/catch — "Lấy mới nhất" không POST lặp vô hạn đúng target hỏng.
3. **COMMIT ✅**: `2571d97` "fix(ent-lane): resolve outage issues" — 4 file, tách biệt khỏi mọi round khác, LOCAL chưa push (chờ GO). Verify: typecheck 0 lỗi · test 40/40 · **409 test THẬT** trên dev server với cặp trùng lịch sử `232632/232656` → `DUPLICATE_SOURCE` nêu đích danh job sống, không tạo job, không gọi mạng, không side-effect (15 job dir giữ nguyên).
4. **`growth:smoke` ✅ SMOKE PASS** (fix `1b09d0e` round trước vẫn giữ, không cần sửa gì thêm; **G2 Gate nguyên vẹn** — không đụng).

**Finding ghi nhận KHÔNG fix (ngoài scope, cần quyết định Operator):** job INTAKE_FAILED mồ côi tích luỹ (retry tạo job mới, job FAILED cũ thành rác + phồng đếm "Nguy cấp" Dashboard) — chưa có route DELETE/dọn; đề xuất round dọn rác riêng. Test guard DUPLICATE_SOURCE dạng unit chưa viết được: ent jobs.ts import `@vfos/facebook` không chạy standalone dưới tsx (pre-existing, cùng gotcha test-infra ent).

**Trạng thái git:** local ahead origin **2 commit** (`2571d97` ent fix + commit docs Phần 70 này) — chờ GO push. Working tree CLEAN, stash RỖNG.

**Bước tiếp theo duy nhất:** Operator GO push 2 commit → việc tay còn treo của lane Giải trí: `pnpm ent:douyin-login` làm tươi session Douyin rồi bấm lại "Tải link" (cookie đóng băng 26/06 là root cause vận hành, code fix xong không thay được bước này); job `232632` đang PREVIEW_PENDING chờ Duyệt video GATE 2.

---

### ✅ Phần 71 — Giải phẫu God-file & Thức tỉnh Script Claim & Safety Agent (2026-07-09, commit `bfc1d40` — CHỜ PUSH)

> Chiến dịch kép kiến trúc: (1) đại phẫu God-file `vfos-job-manager.ts`; (2) tách Đặc vụ AI đầu tiên thành package độc lập `@vfos/ai-agents` theo bản vẽ RFC.

1. **ĐẠI PHẪU GOD-FILE ✅**: `scripts/vfos-job-manager.ts` **3163 → ~68 dòng dispatcher thuần**. Tách toàn bộ logic sang `scripts/job-manager/` = **9 `core/`** (infra: manifest-io, media-probe, paths, product-card, validation, channels, inbox, registry-io, types) + **12 `commands/`**. Kiến trúc **1 chiều** `dispatcher → commands → core` (anti-spaghetti, không cross-command import). Byte-identical move, zero behavior change; smoke đủ 12 lệnh.

2. **THỨC TỈNH `script-claim-safety-agent` → `@vfos/ai-agents` ✅** (RFC `docs/RFC_SCRIPT_SAFETY_AGENT.md`, 3 Phase):
   - **Phase 1** — package mới (ESM, dep `@vfos/script-writer`, test=vitest): di trú verbatim `product-card-facts` + `prompt-builder` (prompt VI) + `openai-caller` (fetch + 429 leo thang 15/30/60/75s trần 180s + 5xx backoff).
   - **Phase 2** — **Hybrid Validation Engine**: `claim-blocklist` = `PHRASE_RULES` (9 cụm literal: tốt nhất, an toàn tuyệt đối, chữa bách bệnh…) + `PATTERN_RULES` (4 regex claim số: cam kết N%, giảm N kg…). `validation-engine` = `normalizeVi` (NFC → strip zero-width → lowercase, chống né dấu/ký tự tàng hình) + `scanClaims` (verdict safe/warn/blocked) + `enforceWordBudget` (tái dùng `countWords`, không vỡ câu chứa giá "10.000đ"). **vitest 11/11** gồm 5 Test Vàng (zero-width evasion · NFD/NFC · phrase · pattern · price-split).
   - **Phase 3** — `agent.ts generateSafeScript`: vòng lặp `prompt(+feedback lỗi) → OpenAI → scanClaims + enforceWordBudget + structuralValidate(DI) → retry ≤ 3 → safe-fallback template`. **SAFETY-FIX**: bỏ superlative "lựa chọn đỉnh nhất" khỏi template. `commands/script.ts` gọt **703 → 485 dòng** (cắt sạch ~450 dòng prompt+OpenAI inline), thêm **exit 8 = CLAIM_SAFETY_BLOCKED** + artifact `claim_safety_report.json`. Giữ nguyên exit 1–7/20/21.

3. **QUYẾT ĐỊNH exit-code (Operator khen "sắc bén")**: `--confirm-openai` fail vẫn trả **exit 6 (API chết) / 7 (validate fail)** — KHÔNG âm thầm đăng script chưa duyệt; "safe fallback template" thoả ở nhánh `confirmAi=false`. Layering: `packages/` KHÔNG import `scripts/` (structuralValidate truyền qua **DI callback**); `scripts/ → packages/` dùng relative path.

**Gate:** `@vfos/ai-agents` typecheck sạch · biome 2 file sửa = 0 lỗi · vitest 11/11. `pnpm -r typecheck` fail ở `@vfos/shopee` (nợ `exactOptionalPropertyTypes` CÓ SẴN, KHÔNG đụng); `biome check .` 2559 lỗi repo-wide có sẵn (2 file mình = 0). Smoke OpenAI-free: job không tồn tại → exit 2; confirmAi=false full → ghi template + report exit 0 ("đỉnh nhất" đã biến mất, price 89K, verdict safe).

**Trạng thái git:** commit `bfc1d40` (40 file, +4624/−3147) trên `feat/ent-multichannel`, staging đích danh (KHÔNG `git add .`), secret scan sạch, working tree CLEAN. Commit docs Phần 71 này + push cả 3 commit lên origin.

**Bước tiếp theo duy nhất:** Test sức mạnh Đặc vụ mới trên video THẬT — chạy `pnpm job:script --job <jobId> --confirm-openai` trên 1 job đã có product card + source sạch để verify vòng generate → claim-scan → retry → artifact end-to-end với OpenAI thật (No-Go #2: cần lệnh rõ + `--confirm-openai`).

---

### ✅ Phần 72 — Siêu chiến dịch Xây dựng Cỗ máy Render Video & Đóng Loop UI Sản xuất (2026-07-11, ĐÃ PUSH)

> Chiến dịch dài nhiều nhịp: biến `render_plan.json` thành `preview.mp4` 9:16 hoàn chỉnh, rồi đưa nút Render lên Web — Operator ra video bằng chuột, KHÔNG cần terminal. (Operator gọi "Phần 66"; số thực tế kế tiếp = **72** để giữ thứ tự log.)

1. **Subtitle Chunker ✅** (`@vfos/ai-agents/subtitle-chunker.ts`): `chunkForSubtitles` băm phụ đề ≤ 12 từ/dòng theo atomization + glue — **không cắt rời số tiền/đơn vị** ("10.000đ") và cặp nhãn↔giá trị (UPF 50+); ngắt ở phẩy/chấm phẩy/liên từ. Thuần string, KHÔNG AI. Commit `7d7bd38`.

2. **Alignment 2 Tầng ✅** (`render-prep/align-subtitles.ts`): **Tầng A** khớp từng từ qua `ttsWordCount` (chẻ thêm dấu ngăn trong-từ `/ - – —` để khớp cách edge-tts tokenize — vá gốc lỗi "hàng/bio" nhả 2 token). **Tầng B** Proportional Fallback: TTS lệch số từ vẫn KHÔNG throw, chia span theo tỉ lệ ký tự → gắn cờ `subtitleTiming`. Pure + vitest (ca slash + ca lệch nghiêm trọng). Commit `6f88c0d` (schema+pure) → `27bd46d` (CLI render-plan + edge-tts) → `60fce32` (nâng resilient 2 tầng).

3. **Lò nướng `@vfos/video-engine` ✅** (package mới, `dependencies: {}`, mô phỏng khuôn ai-agents): tách đôi **PURE core** (`filter-graph.ts` dựng `filter_complex` gánh cùng lúc scale/crop cover 1080×1920 + burn ASS + audio ducking `sidechaincompress` tái dùng recipe lane Giải trí; `ass-writer.ts` sinh ASS V4+) **+ I/O runner** (`ffmpeg-runner.ts`: preflight `ffmpeg -version` fail-fast → ghi `render_subs.ass` UTF-8 BOM → `spawnSync` với `cwd=jobDir` → parse exit/stderr → `RenderResult`). Engine = **FFmpeg CLI thuần** (không fluent-ffmpeg), theo RFC `docs/RFC_VIDEO_RENDERER.md`. vitest 10/10. Commit `5569387` (core) + `4a06ba7` (runner).

4. **Trạm CLI + Bắn đạn thật ✅**: `scripts/job-manager/commands/render-video.ts` (gate `--confirm-render`, exit 1/2/3/5/6, chuyển state → `READY_FOR_OPERATOR_REVIEW`, ghi `render_report.json`) — đăng ký dispatcher + `pnpm job:render-video`. **Live-fire `job_20260616_001`**: `render_plan.json` → **`preview.mp4` 1080×1920 h264+aac, 47.40s, 27.5 MB, 24 dòng phụ đề burn, perfect_match, warnings []** (Exit 0, verify ffprobe). Commit `1f5a227`.

5. **Đóng Loop UI — Giải phóng Operator khỏi Terminal ✅**: route MỚI `POST /api/studio/jobs/[jobId]/run-render-video` (tách biệt route `run-production` cũ đang chạy pipeline `run-review` — additive, không phá lane Product Review) — gate server-side **SOURCE_READY + WATERMARK_NOT_DETECTED + render_plan tồn tại**, side-effect duy nhất `runRepoScript(job:render-video --confirm-render)`. Nút **"Sản xuất video (Render)"** trên `operator-job-queue.tsx` (spinner → POST → thẻ tự đổi + player 9:16). DTO thêm `hasRenderPlan` + preview fallback `previewVideoPath`. Operator DUYỆT UI trực quan → **bấm chuột trên web ra video thật** (`job_20260616_001` render qua nút → xem preview → Approve → `APPROVED`). Commit `76c2d4c`.

**Gate tổng:** `@vfos/video-engine` typecheck + biome + vitest 10/10 sạch; studio typecheck + build Exit 0; biome UI = 0 lỗi mới (đo stash-baseline). API live-test gate: job chưa sạch → 409, jobId bậy → 404 (chặn đúng, 0 side-effect). No-Go: KHÔNG đụng `scripts/vfos-job-manager.ts`; KHÔNG auto-publish (dừng `READY_FOR_OPERATOR_REVIEW`).

**Trạng thái git:** 8 commit `7d7bd38 · 6f88c0d · 27bd46d · 60fce32 · 5569387 · 4a06ba7 · 1f5a227 · 76c2d4c` — **TẤT CẢ đã push** origin `feat/ent-multichannel` (sync 0/0). `job_20260616_001` giữ state `APPROVED` làm vật liệu test Publish sau (manifest gốc backup ở scratchpad).

**Bước tiếp theo duy nhất:** **Ưu tiên 2 — Giải phẫu God-files & Dọn dẹp Phân xưởng `scripts/`.** `vfos-job-manager.ts` ĐÃ gỡ bom (74 dòng, Phần 71) → mục tiêu kế = 2 god-file lớn nhất còn lại: **`scripts/review-video-orchestrator.ts` (1938 dòng)** + **`scripts/kinetic-caption-renderer.ts` (1057 dòng)**. Theo No-Go #9: **lập Step Inventory (6 cột) TRƯỚC khi băm**, tách theo khuôn `job-manager/` (dispatcher → commands → core, 1 chiều), byte-identical move + smoke từng bước; KHÔNG đổi hành vi.

---

### ✅ Phần 73 — Giải phẫu God-file `review-video-orchestrator.ts` → kiến trúc Pipeline (2026-07-11, commit `902f99e` — CHỜ PUSH)

> Tiếp nối Ưu tiên 2 (Phần 72). God-file thứ 2 (`review-video-orchestrator.ts`) từ **1939 → 75 dòng** (−96%), băm thành **23 module mới** theo khuôn `job-manager/` (entry → pipeline → steps → core, layering 1 chiều). KHÔNG đổi hành vi (trừ 1 desync fix có chủ đích).

1. **N1 — Dọn khối nền (`core/`) ✅**: dedupe helper về `core/`; tạo mới `core/clean-source.ts` (`resolveApprovedCleanSource` + `CleanSourceGateError`, 7 mã lỗi verbatim); `validateAudioStream` → `core/media-probe.ts` (typed `FfprobeStream`, bỏ `any`); `updateRegistryFromManifest` → `core/registry-io.ts`; `core/types.ts` bổ sung trace fields + `duration` + `bgmPolicy` (hết `as any`).

2. **N2 — Băm 21 trạm → `pipeline/steps/` ✅**: 18 file step (clean-source-gate → dry-run → sanity → vision → script → script-quality → fixture → bgm-preselect → voice → duration → bgm → render → audio-guard → bgm-mix-guard → caption → verify-fixture → qa → finalize) + hạ tầng `context.ts` (`PipelineContext` + `reloadManifest()`), `status-artifact.ts` (vá union thiếu 12 state THẬT), `run-step.ts`. **Giữ 100% exit code** (2/3/4/5/6/8/9/10/11/12/13/14/15/19/20/21/22/23/24 — kể cả các collision cũ).

3. **N3 — `run-review-pipeline.ts` + entrypoint mỏng ✅**: `runReviewPipeline(ctx)` gọi tuần tự đúng thứ tự gốc; `review-video-orchestrator.ts` còn **75 dòng** (parseArgs → `createPipelineContext` → `runReviewPipeline`).

4. **N4 — Sửa Desync Manifest (bug nguy hiểm) ✅**: `ctx.reloadManifest()` sau **7 điểm subprocess** (vision · script · voice · voice-regen BGM · render · subtitle-detect · caption) — diệt lỗi ghi-đè-ngược manifest bằng bản in-memory cũ (root cause tự-ghi ở orchestrator gốc). An toàn vì mọi mutation trước subprocess đều đã `saveManifest`.

**Gate tổng:** file của em = **0 lỗi tsc** + **biome sạch** (27 file); **🔒 BEHAVIOR LOCK T1–T4 byte-IDENTICAL** với baseline chụp trước khi mổ (exit `0/0/0/5`). BGM Selection Gate (khối phức tạp nhất) bọc verbatim, logic/thứ tự/exit không đổi. `validateScript` (Vision Grounding) giữ private trong `script-quality-gate.ts` — CỐ Ý không gộp `core/validation.ts` để tránh rủi ro hành vi. `job_20260616_001` vẫn `APPROVED`.

**Trạng thái git:** commit `902f99e` (27 file, +2369/−1891) trên `feat/ent-multichannel`, staging đích danh (KHÔNG `git add .`), secret scan sạch, 2 file Douyin out-of-scope KHÔNG đụng. Commit docs Phần 73 này riêng → chờ Operator GO push.

**Bước tiếp theo duy nhất:** **God-file cuối trong Ưu tiên 2 — `scripts/kinetic-caption-renderer.ts` (1057 dòng).** Theo No-Go #9: Step Inventory (6 cột) TRƯỚC khi băm, tách theo khuôn `pipeline/` vừa dựng, byte-identical move + behavior-lock từng nhịp; KHÔNG đổi hành vi.

---

### ✅ Phần 74 — Siêu chiến dịch Tích hợp Shopee Affiliate vào Xưởng Giải trí (Content-Led) (2026-07-12, commit `edc7a11` — ĐÃ PUSH)

> Mang "chọn sản phẩm Shopee" từ lane Review sang lane Giải trí theo triết lý **Content-Led: video kéo view, sản phẩm gắn ở khâu ĐÓNG GÓI** (không phải intake). Đóng loop UI sản xuất giải trí kèm affiliate ra tiền thật — nửa-phải của North Star (video → link → hoa hồng).

1. **N1 — Data contract ✅** (`lib/entertainment/jobs.ts`): `EntAffiliateSummary` (`shopeeProductCardPath` + `shopeeAffiliateUrl`) + `EntJob.affiliate?` additive (job cũ null, KHÔNG đổi state/gate); `attachJobAffiliate` snapshot Product Card **sanitized per-job** vào `data/temp/ent/<id>/product_card.json` (bind cứng theo job, không phụ thuộc card global mutable) + `detachJobAffiliate`.

2. **N2 — Script đóng gói ✅** (`scripts/ent-vlog/16-package.ts`): đọc block affiliate từ `ent_job.json` (ưu tiên card snapshot) → **chèn short link vào CUỐI caption** khi xuất `package.json`/`package.md`; postingNotes + console phản ánh trạng thái gắn/chưa gắn.

3. **N3 — UI + API đúng ngữ cảnh lane ✅**: route MỚI `GET/POST /api/studio/entertainment/jobs/[jobId]/affiliate` (đúng namespace Giải trí — job I/O KHÔNG đụng API lane Review; kho link chỉ ĐỌC qua commerce API sanitized dùng chung); server tự tra registry + **đòi owner `an_17376660568` + `VERIFIED_FROM_LONG_LINK`** (chưa verify → 409). UI picker trong **panel Đóng gói** `/lanes/content` (mount `lanes/content/page.tsx`): "Chọn từ kho link (no-click)" 10 sản phẩm VERIFIED → Gắn/Gỡ → card sản phẩm + tự prefill link đăng FB; ô nhập tay cũ giữ làm fallback contextual.

4. **Guard 3 lớp chống leak canonical token ✅**: regex `^https://s\.shopee\.vn/[A-Za-z0-9]+$` ở CẢ route + lib + 16-package — `canonical_url` (mang `credential_token`/`gads_t_sig`) không có đường vào ent_job/snapshot/caption. Live-test guard: POST link canonical → **400 UNSAFE_LINK**.

**Gate tổng:** studio typecheck exit 0 (sau TỪNG nhịp) + build exit 0 + biome 4 file sạch + tsc ad-hoc 16-package 0 lỗi. **Live-fire API thật** trên vật tế thần `232632`: attach → manifest + snapshot đúng (assert 0 canonical/credential) → 16-package chèn link cuối caption (fallback caption vì quota OpenAI vẫn chết) → detach sạch, residue dọn hết, job giữ `PREVIEW_PENDING`. Operator duyệt UI trực quan 100%. KHÔNG auto-publish, luồng 5 bước lane Review nguyên vẹn.

**Trạng thái git:** commit `edc7a11` (4 file, +530/−9) ĐÃ PUSH origin `feat/ent-multichannel`, staging đích danh, secret scan sạch.

**Bước tiếp theo duy nhất:** **Chờ Operator nạp Quota OpenAI** (429 `insufficient_quota` xác nhận bằng probe 1-token; key project-scoped `sk-proj-…` — kiểm tra đúng project + monthly budget limit) để kích hoạt lại live-fire toàn hệ thống: (1) script 15/15 job 87s `232632`, (2) caption gpt thật cho package affiliate, (3) nghiệm thu 3 tầng fix Reels job `ent_fishing_20260711_154233`.

---

### ✅ Phần 75 — Thay máu Intake Xưởng Review: Trend Scout POV / Video-First (2026-07-12, commit `67d9633`)

> Chuyển trục Xưởng Review Sản phẩm từ **Product-First → Content-Led / Video-First**: quét video "POV Review / Đập hộp nhập vai" từ Douyin TRƯỚC (Trend Scout), gắn sản phẩm Shopee SAU — video kéo view dẫn sản phẩm, khớp North Star reup→affiliate.

1. **Backend `vfos-job-manager` nới đầu vào, KHÔNG nới cổng an toàn ✅**: `job:create --from-video-url <url>` (loại trừ lẫn nhau với `--from-product`, nhánh cũ byte-identical) → job sinh ở state MỚI **`WAITING_FOR_PRODUCT`** (`productCardPath: null` + `sourceVideoUrl`); lệnh MỚI **`job:attach-product`** copy card vào job + điền productId/chineseSearchName + transition → `WAITING_FOR_SOURCE_VIDEO` (guard re-attach exit 4). Widening `productCardPath: string|null` ép rà **9 call site** null-guard đúng ngữ nghĩa.

2. **2 lớp bảo vệ chống production khi thiếu Product Card ✅** (verify sống): lớp 1 = clean-source gate chặn từ vòng ngoài (**exit 20** — test thật); lớp 2 = gate MỚI `PRODUCT_CARD_MISSING` **exit 26** trong `job-sanity-gate.ts` (chặn cả kịch bản job lách tới SOURCE_READY mà chưa có card).

3. **Trend Scout ngách POV ✅**: `config/scout/pov-review.json` (12 keyword Trung: 沉浸式开箱 · 第一视角测评 · 好物开箱 · 居家好物…) — scout tự phát hiện config, 0 code; GET scout trả `niches: cooking, fishing, pov-review` (verify sống).

4. **UI thay máu Action 1 ✅**: component MỚI `TrendScoutReviewPanel` (quét POV → shortlist 8 ứng viên → "+ Tạo job POV" → khối gắn sản phẩm từ kho link VERIFIED ngay dưới job vừa tạo) thay vị trí Action 1; khối "Lấy / chọn sản phẩm" cũ **ĐÓNG BĂNG bằng cờ `FROZEN_PRODUCT_FIRST_ACTION1`** (`{false && …}` — code + backend Shopee giữ 100%, vẫn typecheck, mở lại = đổi 1 cờ); 2 route MỚI `POST /api/studio/jobs/create-from-video` + `POST /api/studio/jobs/[jobId]/attach-product` (server verify owner + VERIFIED, spawn CLI single-writer).

**Gate tổng:** studio typecheck exit 0 (5 lần, sau từng nhịp) + tsc strict toàn cây job-manager exit 0 + biome 0 lỗi mới (page giữ đúng 4 lỗi baseline). **Live-fire:** create/block/attach/re-attach-guard CLI + 2 route + scout niches — 3 job test dọn sạch (registry 42→39). Operator duyệt UI trực quan 100%. Luồng 5 bước cũ nguyên vẹn — chỉ đảo Bước 1 (video POV) ↔ Bước 2 (gắn link Shopee).

**Trạng thái git:** commit `67d9633` (25 file, +1478/−581) trên `feat/ent-multichannel`, staging đích danh, secret scan sạch. Edge-case ghi nhận: job FAILED trước khi gắn card → attach giữ FAILED (Operator intake lại như job fail thường).

**Bước tiếp theo duy nhất:** GIỮ NGUYÊN chờ nạp Quota OpenAI (mục Phần 74) + Operator quét Douyin POV lần đầu (cần đăng nhập Douyin, No-Go #4) để có shortlist thật cho lane Review.

---

### ✅ Phần 76 — Trend Scout Monetization Fit + TikTok-Shop-First ACTIVE R1 (đảo Phần 22) (2026-07-15/16, commit `28e4560` + `2b9befe` — CHƯA PUSH theo lệnh Operator)

> Quota OpenAI đã nạp lại (probe 200 OK; ASR 154233 + script 87s 15/15 live PASS — đóng blocker Phần 74). Round kép theo lệnh trực tiếp Operator: **diệt rác Trend Scout POV** rồi **tái cấu trúc chấm điểm bỏ vanity metrics** + **mở lại TikTok Shop**.

1. **VOE Product Gate + khóa keyword thả nổi ✅** (2026-07-15): `pov-review.json` bỏ 12 keyword phẳng → **formats (3) × subNiches (5 ngách con, mỗi ngách 4 productTerms)** — query LUÔN = [Định dạng]+[Ngách sản phẩm], loader `30-scout.ts` fail loud `CONFIG_CONFLICT` nếu config combo còn keywords phẳng, CLI đòi `--sub-niche` (mirror API 400 `SUB_NICHE_REQUIRED`). Gate thuần trong `scout-core.ts` (`evaluateProductGate`: NFKC+lowercase, evidence-first → garbage-unless-strong-action; counters `noProductEvidence`/`garbageContent` vào snapshot/report/UI). UI panel: dropdown "Ngách con" bắt buộc + dòng 🛡 thống kê chặn rác. A/B trên desc Douyin thật (snapshot 12/07 config cũ): giữ đúng video đập hộp Honor, loại đúng video bungee + rafting du lịch dùng chính keyword "第一视角".

2. **Monetization Fit scoring — vanity metrics hết quyết định thứ hạng ✅** (2026-07-16): khi gate bật, điểm = **Fit 0–100 (QUYẾT ĐỊNH)** + viral bonus 0–20 (xếp hạng phụ). `computeFitScore`: ≥1 strong action (开箱/测评/实测…) → tier STRONG 70–100; không strong → WEAK 0–40. **Khoảng trống 40↔70 bất khả xâm phạm**: video review đồ vật LUÔN trên video bằng chứng yếu dù thua viral 75 lần (test khóa). FIT_STRONG **miễn sàn likes/phút** (review tốt mới nổi không bị giết); lane fishing/cooking không gate → công thức viral cũ nguyên vẹn (test calibration khóa `score 25`). Signals mới `FIT_STRONG`/`FIT_WEAK` + field `monetizationFit` + badge FIT trên UI. Unit 38/38 PASS.

3. **TikTok-Shop-First: DEFER → ACTIVE R1 ✅** (2026-07-16, lệnh trực tiếp Operator — đảo điểm 3 & 4 Phần 22): mức R1 = **Operator dán link thủ công**, KHÔNG scraper/CDP/API thật (HARD CONSTRAINT scraper của Phần 22 GIỮ tới round riêng). Lib MỚI `apps/studio/src/lib/commerce/tiktok-shop.ts`: card `platform: 'tiktok-shop'` với `validationStatus: 'OPERATOR_CONFIRMED'` (cố ý ≠ VERIFIED máy móc Shopee CDP) + `dataConfidence: 'low'`; sanitize URL = https + host allowlist tuyệt đối (vt/vm/www.tiktok.com, shop-vn/shop.tiktok.com) + **CẮT SẠCH query/hash** (tracking token — quy tắc như cấm canonicalUrl Shopee). Route MỚI `POST /api/studio/commerce/tiktok-card-from-link` ghi slot card hiện tại (ghi đè chủ đích); `attach-product` route thêm nhánh platform (409 `TIKTOK_CARD_INVALID`, từ chối cả card lai mang field Shopee; **đường reject Shopee giữ nguyên semantics**, response success thêm field `platform` additive). UI: khối "dán link TikTok Shop" trong TrendScoutReviewPanel.

**Bảng LANE TYPES sau Phần 76** (thay bảng Phần 22):

| Lane | Platform affiliate | Platform publish | Trạng thái |
|---|---|---|---|
| Video-First (Trend Scout POV, lane Review) | Shopee VN + TikTok Shop VN | Facebook Reels / TikTok | **ACTIVE (lane chính)** |
| Shopee-First (MODE 4 /chay) | Shopee VN | Facebook Reels | ACTIVE |
| Content-Led affiliate (triết lý nền) | — | — | ACTIVE |
| TikTok-Shop-First (gắn link TikTok Shop) | TikTok Shop VN | TikTok Việt Nam | **ACTIVE R1 (manual paste — Phần 76)** |

**Step Inventory (No-Go #9) cho TikTok-Shop-First R1**: spec = Phần 76 này · scripts = KHÔNG cần sửa (CLI `job:attach-product` generic, readers name/id null-safe từ Phần 75) · API = route `tiktok-card-from-link` MỚI + nhánh platform trong `attach-product` · UI = khối dán link trong TrendScoutReviewPanel · artifacts = `data/temp/selected_product_card.json` (platform tiktok-shop) · test evidence = typecheck + live-fire round này. Còn thiếu cho R2+ (ngoài scope R1, ghi nhận trung thực): registry TikTok riêng, verify owner tự động, caption/publish plan gắn link TikTok Shop ở khâu đóng gói.

**Trạng thái chốt:** Operator đã duyệt UI trực quan ĐẠT (dropdown Ngách con + badge FIT + khối TikTok Shop tại `/lanes/product-review`). Self-review reviewer độc lập: SHIP — KHÔNG BLOCKER (3 nit đã vá + smoke lại: card lai 409, card sạch tới CLI 404). Tách 2 commit theo đề xuất: `28e4560` (scout VOE gate + combo + fit scoring, 7 file +822/−53) + `2b9befe` (TikTok Shop paste-link R1, 3 file +264/−2). **CHƯA PUSH — chờ lệnh Operator.**

**Bước tiếp theo duy nhất:** Chạy job POV end-to-end đầu tiên (FIRST BLOOD POV): quét → tạo job → gắn sản phẩm (Shopee hoặc TikTok Shop) → tải nguồn → sản xuất (quota OpenAI đã sống) → duyệt → đăng tay.

---

### ✅ Phần 77 — Vision verdict gate + Hardsub text-density gate (2 lane, bài học video lỗi FIRST BLOOD) (2026-07-16, commit `33fbdf5` — CHƯA PUSH)

> Operator chạy FIRST BLOOD POV qua chain 1-click → `job_20260715_002` sản xuất xong nhưng **video lỗi kép**: (1) chữ Trung to nguyên GIỮA khung hình suốt video (detector zone `y=[0.45,0.96]` tune cho phụ đề đáy lane câu cá → chữ giữa khung bị vứt, `Raw segments: 1 → bands: 0`, caption step skip che im lặng); (2) **sai sản phẩm** — card máy xay tỏi nhưng video là đồ organize bếp; vision ĐÃ BÁO `PRODUCT_NOT_VISIBLE` + `sourceVideoUsable:false` nhưng `visionGate` chỉ check artifact TỒN TẠI, không đọc verdict → đốt tiền script/voice/render/Whisper vô ích, QA cuối chỉ so audio↔script nên PASS. Operator duyệt cả 2 phương án fix + lệnh áp dụng luôn cho lane Giải trí.

1. **Fix (a) — Vision VERDICT gate (lane Review) ✅**: `vision-gate.ts` giờ đọc `quality.blockingIssues` + `quality.sourceVideoUsable` ở CẢ 2 nhánh (artifact mới sinh lẫn cache) → chặn **exit 27 `VISION_SOURCE_UNUSABLE`** TRƯỚC scriptGate (chưa tốn API), manifest → FAILED + lastError, status artifact state mới. Override duy nhất: cờ CLI `--force-vision-unusable` (Operator gõ tay; UI không bao giờ truyền). Đúng chuẩn No-Go #8 "gate chặn thật khi fail".

2. **Fix (b) — Hardsub TEXT DENSITY gate tại intake (CẢ 2 LANE) ✅**: module chung MỚI `scripts/subtitle-mask/text-density.ts` — PP-OCR (cùng venv detector, không network) đo **chữ CJK NGOÀI vùng che được** (midY < 0.70 — trên dải delogo đáy); ≥40% frame dính → `TEXT_HEAVY`. Verdict thuần `assessTextDensity` tách khỏi IO, unit 7/7. Chữ phụ đề đáy (fishing) vẫn pass — scrub cứu được. Cắm: **Review** = `intake-clean.ts` (đo trên 5 frame intake sẵn có; TEXT_HEAVY → intake FAIL `HARDSUB_TEXT_HEAVY`, manifest ghi verdict typed `source.textDensityStatus/textDensity`) + gate phòng thủ `run-review.ts` exit 22; **Giải trí** = `01-fetch-source.ts` trích 5 frame + đo → exit 8 `TEXT_HEAVY`, `jobs.ts` map code lỗi cho UI. SSOT `PADDLE_PY/PADDLE_SCRIPT` dời về text-density.ts (detector import lại).

3. **Live evidence (không fake)**: density trên frame thật — `job_20260715_002` **TEXT_HEAVY 5/5** (sample đúng câu "清空婆婆用了六年的厨房"); đối chứng âm tính `job_20260617_002` (video đã publish FB) **OK 1/5**, `job_20260618_003` **OK 0/5** — không chặn nhầm nguồn tốt. Intake gate live trên `job_20260715_001`: exit 3 `HARDSUB_TEXT_HEAVY` + manifest stamped; run-review defense gate: exit 22; vision verdict gate live trên `job_20260715_002`: exit 27, 0 API call (artifact cache). Unit: text-density 7/7 + subtitle-mask regression 16/16. Typecheck: 0 lỗi mới trong file đụng (ad-hoc tsc strict) + studio typecheck PASS. Biome: 0 lỗi mới (2 file command giữ nợ pre-existing).

4. **PHÁT HIỆN QUAN TRỌNG**: `job_20260715_001` (FIRST BLOOD) và `job_20260715_002` trỏ **CÙNG 1 video nguồn** (bếp 婆婆, 12.8MB) — cả hai giờ FAILED đúng sự thật (001 `HARDSUB_TEXT_HEAVY`, 002 `VISION_SOURCE_UNUSABLE`). FIRST BLOOD phải chọn video nguồn khác.

**Chưa live-fire**: nhánh ent `01-fetch-source` đầy đủ (cần lần intake Douyin thật kế tiếp — module + pattern trích frame đã proven ở lane Review); ngưỡng 0.70/0.40 là calibration đầu, chỉnh khi có false positive/negative thật.

**Bước tiếp theo duy nhất:** FIRST BLOOD POV lại từ đầu với nguồn sạch: quét ngách con → chọn candidate KHÔNG dính TEXT_HEAVY → gắn card ĐÚNG sản phẩm trong video → sản xuất (giờ có 2 tầng gate bảo vệ tiền API) → duyệt → đăng tay.

---

### ✅ Phần 78 — PRODUCT-FROM-VIDEO LOOP (kiến trúc chính thức lane Review TikTok-first) (2026-07-16, COMMITTED `ea7d491` 2026-07-19 — Operator duyệt mắt :3002 PASS; CHƯA PUSH)

> **Mandate Operator (lệnh trực tiếp, "định hướng và hướng đi sắp tới, không phải fix cho có")**: lane Review là VIDEO-FIRST thật sự — khiên phải nằm trong VÒNG LẶP SỬA (phát hiện → nhận dạng → tự gắn đúng → chạy), không phải ngõ cụt; job không được dính card tồn kho ("máy xay tỏi" gắn vào mọi video → 716_002 chết oan ở vision); lane đã pivot đăng TikTok, KHÔNG dùng khâu lấy link Shopee; KHÔNG dán link TikTok Shop ở khâu sản xuất — chỉ cần **đảm bảo sản phẩm trong video CÓ MẶT trên TikTok Shop**; **KHÔNG thêm nút UI** — khiên tự duyệt đúng chuẩn No-Go #8.

1. **Bước 0 pipeline mới — `productFromVideoGate`** (chạy TRƯỚC jobSanityGate; job có card → no-op tuyệt đối, flow Shopee nguyên vẹn): spawn CLI MỚI `scripts/job-product-from-video.ts` — trích 6 frame từ clean source → **1 call gpt-4o-mini** trả về: tên sản phẩm VI kiểu listing + keywords + chineseSearchName + **verdict Market-Fit** (`isPhysicalProduct` + `likelyOnTikTokShopVN` + confidence ≥ 0.6, luật thuần ở `scripts/job-manager/core/market-fit.ts`, unit 8/8). PASS → dựng card **`AUTO_MARKET_FIT`** (platform tiktok-shop, KHÔNG link, dataConfidence low) + attach qua đúng `cmdAttachProduct` (single-writer, KHÔNG đụng slot card chung). FAIL → manifest FAILED `MARKET_FIT_FAILED` + exit 28, không tốn tiền sản xuất. Thiếu confirm → exit 29; lỗi khác → exit 30. Giới hạn nói thẳng: fit = phán đoán AI mức LOẠI sản phẩm, KHÔNG phải check listing sống (check sống = scraper TikTok, rủi ro CAPTCHA/IP — round riêng nếu cần).

2. **Gate server mở nhánh video-first/tiktok (Shopee byte-nguyên)**: `production-gates.ts` — `GateProductCard.platform`, primitive `isTikTokCardValid` (name + OPERATOR_CONFIRMED/AUTO_MARKET_FIT), rule 3: job chưa card + có `sourceVideoUrl` → gate info `PRODUCT_AUTO_FROM_VIDEO` passed (không blocker); card tiktok-shop → validate platform, KHÔNG áp owner Shopee/so binding. `workflow-integrity.ts` mirror cùng 2 nhánh → route `run-production` cho phép job video-first khởi chạy (verify HTTP dry-run 200 DRY_RUN_OK).

3. **UI đảo chiều chain (0 nút mới)**: `trend-scout-review-panel.tsx` — nút "⬇ Tạo job & Tải nguồn" giờ chỉ 2 bước (tạo job KHÔNG card + tải nguồn), bỏ khoá theo slot card, bỏ đọc `current-product-card`; label mới nói rõ sản phẩm tự nhận dạng ở bước 0. `page.tsx` — `isAutoProductJob` (card tiktok-shop HOẶC chưa-card + có sourceVideoUrl + không id Shopee nào) → `bindingStatus` PASS, Action 2 mở; **auto-resume đóng gói TẮT cho job auto** (packaging TikTok = round sau); DTO `productPlatform` mới (jobs.ts + types.ts).

4. **Calibration vision gate từ live-fire (sửa Phần 77)**: `sourceVideoUsable=false` ĐƠN THUẦN đến từ signal MỀM ('Text overlap'/'Watermark'/'Low light' — đã có khiên chuyên trách: density gate + scrub + cleanliness) từng chặn oan video khớp card **0.95** → gate giờ CHỈ chặn theo `blockingIssues` (verdict cứng PRODUCT_NOT_VISIBLE), usable=false chỉ cảnh báo to. Job 716_002 (sai sản phẩm thật) vẫn bị chặn đúng.

5. **Live-fire acceptance ĐẠT (video 7662726376466749897, job `job_20260716_003`)**: STEP 0 nhận dạng **"Giá treo đồ đa năng dán tường"** (đúng nội dung video — em verify frame bằng mắt) + Market-Fit PASS + card AUTO_MARKET_FIT tự gắn; run 1 dính 429 TPM transient ở vision (STEP 0 + STEP 1 sát nhau — nợ hardening: retry 429 cho job:vision) → run 2 chứng minh STEP 0 idempotent (no-op khi có card) + lộ false-positive usable=false → calibration mục 4 → run 3 vướng gate cũ VOICE_LONGER_THAN_VIDEO (video 15s ngắn, script dư 1.5s — regen 1 lần là vừa; nợ: script prompt buffer cho video ngắn) → **run cuối TRỌN VÒNG: vision PASS (soft-warn) → script → voice edge 14.26s → BGM → render → caption → QA STT PASS (similarity 0.868) → `READY_FOR_OPERATOR_REVIEW`**, video 3.07MB sạch chữ Trung, caption VI đẹp. HTTP dry-run route produce cho job video-first: 200 DRY_RUN_OK. Unit 31/31 (market-fit 8 + density 7 + subtitle 16); typecheck studio + ad-hoc scripts sạch; biome 0 lỗi mới. Nợ cosmetic: finalize không clear `lastError` cũ (state đúng READY, UI chỉ hiện lỗi khi FAILED — vô hại).

6. **Phần 78b — ElevenLabs = GIỌNG CHÍNH THỨC lane Review** (lệnh trực tiếp Operator 16/07 "dùng giọng eleven lab cho anh"; billing đã thông từ 23/06 — payg, đã dùng 1,046/26,483 chars): `voice-gate.ts` truyền `--provider` default **elevenlabs** + escape hatch `VFOS_VOICE_PROVIDER=edge` (kẹt billing → set env, không sửa code); mismatch-check provider-aware (đổi provider → tự regen đúng 1 lần; picker nam/nữ chỉ áp dụng edge — elevenlabs là 1 brand voice `ELEVENLABS_VOICE_ID`). Live: `job_20260716_003` regen giọng eleven_v3 → duration PASS 12.24s, **QA PASS 0.902** (cao hơn bản edge 0.868). GOTCHA: nhịp ElevenLabs chậm hơn edge +18% → video ngắn 15s dễ `VOICE_LONGER_THAN_VIDEO` (regen script là vừa); **NỢ ghi nhận**: word budget script (`2.5 từ/s`, script.ts) chưa pace-aware theo provider + LLM hay vượt budget — round riêng. Lane Giải trí vẫn edge default (`ENT_TTS_PROVIDER` opt-in như cũ).

**Bước tiếp theo duy nhất:** Operator duyệt UI + duyệt thành phẩm video giá treo (GIỌNG ELEVENLABS) `job_20260716_003`; sau đó round đóng gói/đăng TikTok cho lane Review (Action 3 video-first) + gắn link TikTok Shop thật ở khâu affiliate.

---

### ✅ Phần 79 — Action 3 TikTok-first LIVE-READY: cầu token account-store + caption draft tự động (2026-07-16, COMMITTED `15c0deb` 2026-07-19; CHƯA PUSH)

> Mắt xích đứt cuối của North Star: video `job_20260716_003` xong + ĐÃ DUYỆT nhưng không có đường đăng. Khảo sát: swap Phần 66 đã dựng đủ máy (lib `review-tiktok/publish.ts` + route `publish-tiktok` + panel — guard 11 lớp, mặc định mock); `.env` đã live (`TIKTOK_MODE=display`, `TIKTOK_PUBLISH_LIVE=true`, client key có); **thiếu đúng 2 mắt**: token store `data/secure/tiktok_accounts.json` không tồn tại (nợ token-ops R3 multichannel) + caption trống bắt Operator tự nghĩ.

1. **Cầu token (đóng nợ R3 phần cần)**: `scripts/tiktok-oauth-helper.ts` thêm `--account <id>` cho `exchange`/`refresh` → upsert vào account-store JSON (pure fn `upsertAccountStoreContent` + `expiresAtFrom`, unit 13/13); khi có `--account` thì **KHÔNG đụng .env** (token legacy `tt_fishing_main` của lane ENT giữ nguyên); refresh đọc refreshToken từ store entry.
2. **Đóng gói caption 0-click**: `getReviewCaptionDraft(jobId)` đọc `captionDraft`+`hashtags` **GPT đã sinh sẵn trong script_artifact** (0 call AI mới, fallback hook) → GET route trả `captionDraft` → panel prefill đúng 1 lần/job (Operator sửa tay thoải mái; cổng đăng vẫn là TAY — No-Go #3; video thuần KHÔNG link affiliate đúng swap).
3. **Live verify tới cổng** (job_20260716_003): GET 200 — `videoApproved:true` (Operator đã duyệt), `hasFinalVideo:true`, captionDraft đúng chuỗi GPT; POST → **409 `TIKTOK_NOT_CONFIGURED: token account tt_review_main`** — chuỗi guard chạy đúng tới đúng mắt còn thiếu, KHÔNG đăng thật. Typecheck studio + helper sạch; biome sạch.

**Việc tay Operator để đăng video ĐẦU TIÊN** (1 lần, No-Go #4 — tự đăng nhập):
1. `npx tsx scripts/tiktok-oauth-helper.ts url` → mở URL, đăng nhập account TikTok của lane Review, đồng ý quyền video.publish.
2. Copy `?code=` từ redirect → `npx tsx scripts/tiktok-oauth-helper.ts exchange --code <code> --account tt_review_main`.
3. Vào `/lanes/product-review` chọn `job_20260716_003` → panel "Đăng lên TikTok" (caption đã điền sẵn) → bấm **Đăng lên TikTok** (SELF_ONLY nếu app chưa audit — client tự chọn privacy hợp lệ).

**Nợ ghi nhận**: alias `pnpm tiktok:oauth` chưa có trong package.json (dùng `npx tsx` — thêm alias cần duyệt riêng); `REVIEW_TIKTOK_USERNAME` chưa set (guard identity chống dán nhầm token — nên set sau khi biết username account).

**Bước tiếp theo duy nhất:** Operator OAuth `tt_review_main` (3 lệnh trên) → bấm Đăng video đầu tiên của lane Review lên TikTok → round kế: gắn link TikTok Shop thật ở khâu affiliate + TikTok GMV ingestion.

### ✅ Phần 80 — Hook Style Bank 6→9 giọng (mini-round từ điều tra bài FB external, 2026-07-18, COMMITTED `438e0ae`; CHƯA PUSH)

> **Ent-lane intake UI round** (card nguồn TQ + surface lỗi/retry + thumbnail proxy SSRF-whitelist + blur-pad 9:16 + Douyin banner Phase B) đi cùng cụm dọn 2026-07-19: COMMITTED `91f8958` (CHƯA PUSH), Operator duyệt mắt :3002 PASS.

**Nguồn gốc**: Operator nhờ điều tra bài FB của Nguyễn Tất Kiểm ("giao Facebook cho Claude", 7 prompt trong comment). Kết luận thẩm định: ~85% generic (VFOS đã tự động hóa vượt mức prompt tay), nhưng đối chiếu 15 công thức hook/caption trong bài với `HOOK_STYLES` lộ ra 3 giọng bank chưa có → Operator GO mini-round.

**Đã làm** (`scripts/ent-vlog/lib/hook-style-bank.ts`):
- Thêm 3 giọng: `canh_bao` (Cảnh báo / sai lầm — không hù dọa vô căn cứ), `nguoc_chieu` (Ngược đám đông — không chê bai cá nhân/gây war), `bi_mat` (Tiết lộ ít ai biết — điều tiết lộ phải CÓ THẬT trong footage). Cả 3 giữ nguyên chuẩn claim-safe của bank (không bịa số/loài/thành tích).
- Từ chối có chủ đích công thức "con số gây sốc" trong bài — vi phạm luật cấm bịa số đã khắc trong bank.
- Sửa 1 ví dụ `hua_hen`: "khúc sau mới đã" → "đoạn cuối mới đã" (ví dụ cũ dính chính mô-típ cấm `/khúc sau (còn|mới|chắc)/` của gate chống lặp trong cùng file).
- Test mới `tests/hook-style-bank.test.ts` (9 test): 9 id unique, ví dụ đúng khổ 8–13 từ, ví dụ không dính mô-típ cấm, xoay vòng né 3 job gần, deterministic per-job, chống lặp nguyên văn + 4 từ mở đầu. Docs storytelling layer cập nhật "6 nhóm" → "9 nhóm".
- Lợi vận hành: pool né 3 job gần nhất giờ còn ≥6 lựa chọn (trước chỉ 3) → hook đa dạng hơn thật sự.

**Evidence**: suite scripts-side **53/53 PASS** (44 cũ + 9 mới); biome 2 file sạch.

**Nợ infra LỘ RA (có sẵn, KHÔNG thuộc round này)**: 5 test `tests/entertainment-*.test.ts` (đụng lib studio) hiện KHÔNG chạy nổi ở HEAD với tsx 4.21/Node 24 — static named import bị CJS nuốt (`computeReadiness` tồn tại nhưng phải dynamic-import + `.default`) + `ERR_PACKAGE_PATH_NOT_EXPORTED` cả khi có `TSX_TSCONFIG_PATH`. Lib KHÔNG vỡ, chỉ test-runner drift. Cần mini-round riêng nếu muốn hồi sinh.

---

### ✅ Phần 81 — Skill Registry Audit qua phương pháp `skill-creator` + trám nợ doc ui:verify (2026-07-18, CHƯA COMMIT)

**Nguồn gốc**: Round `webapp-testing → pnpm ui:verify` (commit `4ceae8c`, 2026-07-17) là 1/3 thứ áp dụng được từ repo `anthropics/skills`; item còn sót = **`skill-creator`** (bộ phương pháp tạo/đánh giá skill, lõi là "trigger eval" — đo `description:` có tự bật đúng lúc không). Operator nhắc lại → round này áp `skill-creator` như **PHƯƠNG PHÁP**, KHÔNG vendor cả harness (bản gốc = 8 script Python + eval-viewer HTML + 3 agent .md, lệch stack Node/TS; registry đã FREEZE 6 skill từ 01/07 → YAGNI).

**Trám nợ doc**: commit `4ceae8c` (ui:verify — `scripts/ui-verify.ts` 236 dòng + `pnpm ui:verify` + `vfos-ui-review-skill` §2b) trước đây KHÔNG có Phần entry → ghi nhận tại đây.

**Trigger-eval 6 description** (mỗi skill ~8 query: 5 should-trigger lấy từ phrasing thật + 3 near-miss should-not): **6/6 PASS** — description đều cụ thể, liệt kê trigger rõ, "pushy" đúng mức, không cái nào undertrigger/overtrigger có hại. → **KHÔNG viết lại description nào** (xác nhận chất lượng từ các round skill trước). Chỉ lộ defect cleanliness.

**Đã sửa (5 điểm trong `.claude/`, working tree `.claude/` trước đó SẠCH nên tách bạch tuyệt đối khỏi round UI 78-80)**:
- `vfos-ui-review-skill/SKILL.md`: heading `<h2>4…</h2>` (HTML lạc giữa các heading `## N.`) → `## 4.` markdown.
- `vfos-shopee-affiliate-skill/SKILL.md`: typo `sản phẩmverified` → `sản phẩm verified`; curly quotes `“…”` trong description → straight quotes.
- `vfos-evidence-gated-research/SKILL.md`: **salvage** từ bản archive trùng — thêm Ma trận quyết định downstream + nhãn `exploratory, not decision-ready` (active bản đang thiếu hẳn) + 2 ví dụ output trung thực + ví dụ `verification_note`.
- `git rm .claude/_archive/skills/pending-rebuild/vfos_evidence_gated_research.md` — bản trùng chết (đã rebuild thành active từ 01/07); đã salvage đủ 2 mảng thiếu → xoá.
- `.claude/CLAUDE.md` §5: thay `shop-amazon` (đã xoá 30/06) bằng 6 skill `vfos-*` thật; §6: path memory `d--Ai-Automantion-workflow` → `c--Users-Admin-Desktop-vfos-automation`.

**GIỮ NGUYÊN**: 2 skill parked còn lại (`vfos_proactive_support`, `vfos_revenue_experiment_strategist` — Operator park có chủ đích) + `_archive/skills/chay/` (ngủ đông). Registry vẫn **đúng 6 skill** load thật.

**Bổ sung (Operator yêu cầu NGAY sau audit) — TĂNG ĐỘ NHẠY 2 skill**: `ui-review` + `evidence-gated-research` viết lại description pushier (phủ thêm bề mặt trigger từng bỏ sót — styling/icon/badge/modal/state cho ui-review; summarize/transcribe/trả-lời-từ-trí-nhớ/test-result cho evidence-gated). Đây là preference nâng cấp, KHÔNG phải sửa lỗi (audit đã kết luận 6/6 khỏe). Quy trình `skill-creator`: soạn → **stress-test đối kháng 2 agent độc lập** (workflow `skill-desc-sensitivity-stress-test`) TRƯỚC khi áp. Kết quả: `evidence-gated` = **SHIP** (bắt đủ 6 ca miss, **0 over-trigger**). `ui-review` = **ADJUST** — skeptic bắt **3 ca over-trigger THẬT** (nặng nhất: cụm "copy/wording 1 nhãn tiếng Việt" bắn nhầm việc sửa lời hook `hook-style-bank.ts` = caption VIDEO chứ không phải UI, đè lên workflow hook/script; + API `route.ts` backend; + pipeline gate) → gom mọi carve-out vào 1 câu loại trừ (API route.ts · pipeline gate · lời video/caption/TTS/log-report) rồi mới áp. Frontmatter vẫn **6/6 hợp lệ**, 0 curly quote. BÀI HỌC: tăng nhạy phải kèm ranh giới loại trừ, nếu không "copy/wording" + "routes" hút nhầm script-lib + API backend.

**Còn hoãn (trung thực, ngoài scope)**: item #3 từ anthropics/skills = `xlsx` document-skills — chờ round TikTok Shop GMV ingestion; 2 skill pending-rebuild — chờ lệnh Operator.

**Commit strategy**: stage đích danh `.claude/skills/*` đã sửa + `.claude/CLAUDE.md` + `git rm` file archive; msg `chore(skills): audit registry via skill-creator method`. File state doc này đang dirty diff round 78-80 khác → KHÔNG stage chung, đi cùng docs-commit sau khi các round kia chốt. KHÔNG push (branch ahead, giữ theo lệnh Operator).

---

## 5. Những việc CHƯA làm / ngoài scope hiện tại

| Việc | Trạng thái |
|---|---|
| BGM dynamic ducking (sidechain) | ✅ Có trong `@vfos/video-engine` (filter-graph `sidechaincompress`, Phần 72); lane render cũ vẫn fixed volume |
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

> **🆕 CHỈ DẪN MỚI NHẤT (2026-05-29 phiên state-sync)**:
>
> Sau Round 29 Operator/Safety Hardening Suite, nguồn chỉ dẫn trạng thái + bước kế tiếp **không còn là phần văn bản tĩnh dưới đây**, mà là output thực tế của `pnpm vfos:daily` + checkpoint mới nhất ở `data/temp/vfos_operator_checkpoint.md`.
>
> **Quy trình bắt buộc đầu mỗi phiên**:
> 1. `pnpm vfos:sync-check` — verify git sync trước khi làm.
> 2. `pnpm vfos:daily` — đọc dashboard, runbook, checkpoint.
> 3. Theo `recommended next command` của dashboard. Nếu command là `pnpm publish:facebook --confirm-final-approval ...` → **dừng để Operator review preview MP4 trước**, không tự chạy.
>
> **Tại thời điểm phiên sync (2026-05-29 14:03Z)**:
> - Pipeline đang ở `PUBLISH_REQUEST_READY → MANUAL_INSPECTION` cho run `run_review_product_p9` (Quạt T10).
> - Bước Operator tiếp theo: xem `data/temp/pipeline-p9-demo/run_review_product_p9/operator_review_pack.md` + preview MP4 → duyệt hoặc reject.
> - Sau khi Operator duyệt → mới chạy `pnpm publish:facebook --confirm-final-approval --run run_review_product_p9` (mặc định tạo readiness/report, không live upload).
> - Git: ahead origin 1 (`9921431`) → quyết định push trước hoặc làm thêm rồi push một lượt.
>
> **Phần văn bản historical dưới đây giữ làm reference, KHÔNG còn là nguồn chỉ dẫn ưu tiên.**

> **TRẠNG THÁI yt_009 (2026-05-22)**: **USER-APPROVED PASS_WITH_REPAIR final.** Phần 17 + Phần 18. Output: `production/batch_001/yt_009/bgm_mix_v1/yt_009_voice_blocks_bgm_preview_vi_repaired_v2.mp4`.
>
> **TRẠNG THÁI yt_010 (2026-05-22)**: **USER-APPROVED PASS_WITH_REPAIR — visual repair v4 final.** Phần 19. Vòng 1 candidate reject, vòng 2 accepted. Visual repair iterated v1 (thô, 900×1000 wide) → v2 (missed drawer brands) → v3 (7 targeted blur layers nhưng tọa độ HOOK + STARBUCKS drawer + siren chưa đúng) → **v4 (USER-APPROVED, repositioned boxes sau user feedback round, 5 lần render nội bộ để fix coordinate errors)**. v4 boxes thật khít: top banner 1080×220 (extend từ 130 cover 2 dòng), HOOK 760×520 đúng vùng text, siren 700×600 @ (180,420) đúng vị trí center-right, STARBUCKS drawer 720×380 cover moving range x=540→230, SIMPLY MINTS 360×240 @ (20,900). Residual chấp nhận pilot: faint green tinge Starbucks siren qua blur ở edges (logo/text không đọc được). User chốt: KHÔNG iterate v5, motion-tracking ngoài scope. Output: `production/batch_001/yt_010/bgm_mix_v1/yt_010_voice_blocks_bgm_preview_vi_repaired_v4.mp4` (giữ v1/v2/v3 trên đĩa làm history, không overwrite).
>
> **TRẠNG THÁI yt_008**: vẫn SOURCE-REJECTED (không có preview). Không dùng lại.
>
> **MỐC ĐÃ ĐẠT**: 5 video clean qua pipeline (yt_005, yt_006, yt_007, yt_009, yt_010). Cả 5 đều USER-APPROVED hoặc operator-verified. Phần 16 AUTO-SOURCE RETRY POLICY verified end-to-end. Pipeline generalize across diverse durations (18s, 35s, 44s, 53s, 59s) và content types (single-product/multi-product/cleaning/kitchen/organizer).
>
> **Bài học Source Profile từ yt_010**: YouTube Shorts source có nhiều overlay/brand lặt vặt (channel CTA throughout, branded products). Nếu tiếp tục: ưu tiên clean studio demo sources, hoặc build auto-detection bounding box để giảm manual repair iteration.
>
> **TRẠNG THÁI yt_011 (2026-05-23)**: **Shopee-First proof-of-concept end-to-end success**, commit `791564f` + gap-fix. Card + script + voice + BGM + preview tất cả đạt. Phần 23 hardening (2026-05-24) đã đưa 2 bài học (Card persist, operator trim metadata) thành rule cố định trong SKILL.
>
> **MỐC ĐÃ ĐẠT 2026-05-24**: 6 video qua pipeline (yt_005, yt_006, yt_007, yt_009, yt_010 Video-First + yt_011 Shopee-First). Phần 16 AUTO-SOURCE RETRY verified. Phần 22 Shopee-First Lane verified end-to-end. Phần 23 hardening đã rule-ize lessons learned + agent-ready boundaries cho 4 sub-agent tương lai.
>
> **MỐC ĐÃ ĐẠT 2026-05-26 (Phần 24)**: Agent Architecture v0 spec đã chốt — 5 agent boundary (4 cũ + Git & Artifact Agent), artifact SoT path `production/_runs/<run_id>/`, Git Agent commit-only-when-prompted rule. Spec đầy đủ ở `docs/00_DIEU_HANH/VFOS_AGENT_ARCHITECTURE_V0.md`.
>
> **TRẠNG THÁI yt_014 (2026-05-26)**: **Shopee-First Audio Assembly & publish plan success** theo Agent Architecture v0. Đã tạo voice_sync_manifest, voice_timeline.mp3, mixed_audio.mp3, preview_vi.mp4 và facebook_reels_publish_plan.json. Technical QC hoàn toàn đạt: duration mismatch = 0.134s (<0.5s), max_volume = -4.5 dB (no clipping), 0 leak, 2 streams (H264, AAC).
>
> **Bước tiếp theo duy nhất: USER đánh giá thành phẩm yt_016 và quyết định các chiến lược tiếp theo.**
>
> **MỐC ĐẠT ĐƯỢC 2026-05-28 (Round 28 — Sub-Agent validation run)**:
> - **Chạy thành công và hoàn thành video Khăn Giấy Rút Treo Tường `yt_016`**: Dự án đạt cột mốc quan trọng tiếp theo khi chạy thành công `yt_016` theo đúng chuẩn kiến trúc **Sub-Agent validation run**.
> - **Quy trình chạy tự động và tối ưu hóa**: 
>   - **Commerce Product Agent**: Tự động phát hiện và phê duyệt sản phẩm `PRODUCT_SELECTED` (Giấy vệ sinh treo tường TopGia 100k, 9% hoa hồng, 1tr+ bán) với điểm Selection Scoring tối đa 18/18.
>   - **Demo Match Agent**: Trùng khớp 100% SKU (`MATCH_CONFIRMED`) từ nguồn sạch hoàn toàn không watermark.
>   - **Script & Claim Safety Agent**: Áp dụng quy trình kiểm soát chất lượng từ `gpt-4o-mini`, phát hiện và từ chối biến thể rủi ro chứa từ cấm `an toàn tuyệt đối` / `tốt nhất`. Đã tự động áp dụng `OPERATOR TRIM POLICY` cắt giảm từ ngữ vượt cap ở block b2 và b3 để đưa tổng số từ về 33 từ (nằm trong window target).
>   - **Audio & Assembly & Final Reels Render**: Xuất thành công tệp render cuối cùng `yt_016_final_reels_v2_3.mp4` (15.6s, 1080x1920 portrait) đạt chuẩn QC kỹ thuật (volume -2.9 dB, 2 streams, 0 leak).
>   - **Facebook Reels Publish Plan**: Đã tạo và persist tệp `facebook_reels_publish_plan.json` chứa thông tin đăng bài, hashtag đã tối ưu, cùng link Shopee Affiliate rút gọn đã được verify thành công.
> - **Tự động hóa Git Agent**: Tự động stage các file text/manifest của `yt_016` sạch sẽ không dính binary file.
>
> **MỐC ĐẠT ĐƯỢC 2026-05-28 (Round 27B Auto-Pilot)**:
> - **Tích hợp chế độ Auto-Pilot Mode**: Cập nhật playbook và logic vận hành trong `SKILL.md` để tự động duyệt video 5/5, tự động trim gọt kịch bản, giới hạn human-in-the-loop chỉ dừng khi gặp blocker vật lý nặng (OTP, Lock profile, brand không sửa được).
> - **Giải phóng video Áo Điều Hòa `yt_015` thành công rực rỡ**: Trải qua 100% quy trình tự động không cần user can thiệp — tự động áp dụng `OPERATOR TRIM POLICY` (Option C) ghi metadata `operator_trim`, tự động Voice Sync (4/4 blocks FIT/underfill), tự động BGM Mix và render preview video `.mp4` đạt chuẩn QC kỹ thuật (max_volume = -2.9 dB, 0 leak, 2 streams). Đã tự động tạo và persist `facebook_reels_publish_plan.json` chứa link Shopee Affiliate đã được verify.
> - **Tự động hóa Git Agent**: Tự động stage các file text/manifest của `yt_015` cùng `SKILL.md` và tạo commit `8be0e4b` cục bộ sạch sẽ không dính binary file.
>
> Có 6 hướng khả thi tiếp theo (chờ user quyết):
>
> 1. **Architecture v1 — pipeline migrate ghi artifact sang `production/_runs/<run_id>/`** — bước thực thi đầu tiên của roadmap Phần 24.
> 2. **Nhân bản Con số 2 theo blueprint** — mở `docs/00_DIEU_HANH/VFOS_SHORTFORM_FACTORY_BLUEPRINT_V0.md` cho ngách thứ 2.
> 3. **Đổi default `OPENAI_MODEL=gpt-4o` trong `.env`** — cleanup nhỏ.
> 4. **Test yt_012 Shopee-First với hardening Phần 23** — verify 4 rule mới end-to-end trên 1 video mới.
> 5. **Test thử Shopee-First Discovery Mode thật** — `/chay shopee-first` (no link) → agent tự tìm Shopee candidate.
> 6. **Split 5 sub-agent thật (Phần 24 roadmap v2–v6)** — tạo `.claude/agents/shopee-product-agent.md`, v.v.
>
> KHÔNG tự chạy các video khác hay tự ý split sub-agent code mà không có user quyết định. Mọi file binary đều đã được gitignore sạch sẽ.

### (Phần dưới giữ lại làm reference — yt_009 acceptance ban đầu đã đạt)

> **~~Bước tiếp theo duy nhất: Tạo / chạy `/chay` end-to-end trên video MỚI HOÀN TOÀN `yt_009`.~~** ĐÃ HOÀN THÀNH 2026-05-21.
>
> **Lý do**:
> - yt_008 đã source-rejected, không có preview để đánh giá generalization → không dùng được làm bằng chứng pipeline khái quát.
> - yt_009 là vòng đầu tiên áp dụng đầy đủ Phần 16 (AUTO-DECISION + AUTO-SOURCE RETRY + GUARD 6 Repair Playbook).
> - Vẫn cần 1 video mới end-to-end thành công để chứng minh pipeline không coupled với yt_007.
>
> **Acceptance cho yt_009**: gọi `/chay` (no-args, để memory routing) tạo `yt_009` từ đầu — Script Writer → Voice Sync → BGM Mix → preview. Verify:
> 1. **AUTO-DECISION POLICY** (Phần 16): `/chay` no-args KHÔNG hỏi user "chọn mode / chọn ngách / chọn candidate" — memory đã ghi yt_009 + default lane set Con số 1 đủ rõ.
> 2. **AUTO-SOURCE RETRY** (Phần 16): nếu candidate đầu fail GUARD 6 hoặc threshold → `/chay` tự đổi keyword retry tối đa 3 vòng trước khi hỏi user. KHÔNG hỏi user sau lần fail đầu tiên.
> 3. **KHÔNG dùng lại candidate / source / URL cũ của yt_008** ở bất kỳ vòng retry nào. Nếu tình cờ search ra lại video đó → loại khỏi shortlist.
> 4. Pipeline tự chạy không cần operator can thiệp tay (automation track).
> 5. Quality status PASS hoặc NEAR-PASS (exit 0) trên video CHƯA TỪNG calibrate.
> 6. Output preview MP4 mở được, không leak source audio.
> 7. **GUARD 6 Visual Safety v1** (3 nhóm: logo/brand/watermark, QR/mã vạch, biển số/PII):
>    - Nếu detect vi phạm → Repair Playbook ưu tiên blur/mosaic.
>    - Decision Status cuối: PASS hoặc PASS_WITH_REPAIR.
>    - Bảng "Detected issue → Repair action → Re-QC result" ghi đầy đủ trong báo cáo.
> 8. **GUARD 7 Affiliate & Content Compliance** (operator-enforced ở STEP 7):
>    - R1: script không copy y nguyên narration nguồn.
>    - R3: script không chứa từ tuyệt đối (tốt nhất / rẻ nhất / chính hãng 100% / cam kết / đảm bảo).
>    - R5: tone soft, không quảng cáo thô.
>    - R2 (product match): nhắc ở báo cáo cuối — chốt affiliate đúng sản phẩm khi publish.
>
> **Quy tắc tuyệt đối cho vòng này**:
> - **KHÔNG dùng lại candidate / source / URL của yt_008** — yt_008 source-rejected là quyết định cuối, không retry trên nó.
> - **KHÔNG dùng lại yt_007 cho vòng kế tiếp** — đã đóng vai trò pilot, mọi tinh chỉnh thêm sẽ là overfitting.
> - **Khi `/chay` được gọi không args (mode 1): ưu tiên tạo/chạy yt_009**, KHÔNG quay lại yt_007 / yt_008 dù memory có nhắc đến tên cũ.
> - yt_007 / yt_008 artifacts giữ làm reference — không touch.
>
> **KHÔNG mở scope** sang Con số 2, publish, BGM ducking, watermark, refactor Voice Sync/Script Writer thêm trong vòng này. Mục tiêu duy nhất: 1 video mới (yt_009) end-to-end qua pipeline hiện tại với Phần 16 áp dụng đầy đủ.
>
> **Sau khi xong**: nếu yt_009 chạy được clean → có bằng chứng pipeline generalize sau Phần 12–16. Mới cân nhắc tới (a) nhân bản Con số 2 theo blueprint hoặc (b) cải tiến tiếp Core nếu phát hiện limit mới.

---

## 7B. Trạng thái hiện tại sau Operator/Safety Hardening

> Section này tóm gọn ranh giới vận hành sau Round 29 — đặt ở vị trí dễ scan đầu file điều hành.

- Hệ thống đã có **dashboard / runbook / checkpoint** xuất ra `data/temp/` (`vfos_daily_status.json`, `vfos_daily_runbook.md`, `vfos_operator_checkpoint.{json,md}`).
- `pnpm vfos:daily` là **nguồn chỉ dẫn trạng thái chính** — luôn chạy đầu phiên trước khi quyết định bước tiếp theo.
- `pnpm vfos:sync-check` là **guard bắt buộc khi đổi máy** — phát hiện ahead/behind/dirty/staged sensitive.
- `pnpm chay` vẫn **KHÔNG publish** — chỉ tạo preview + review pack + dừng ở `READY_FOR_FINAL_OPERATOR_APPROVAL`.
- `pnpm publish:facebook` mặc định ở mức **readiness/report**, KHÔNG live publish; cần `--confirm-final-approval --run <runId>` để chạy publish flow đã được duyệt.
- `pnpm commerce:intake` cần `--confirm-targeted-click` để click thật; mặc định chỉ preflight read-only.
- Mọi live publish vẫn cần **human approval riêng + flag explicit**. Không bypass.
- Safety locks hệ thống tự kiểm: `browser_clicked`, `extractor_ran`, `facebook_api_called`, `published`, `uploaded`, `read_env` — tất cả phải `false` ở trạng thái idle.
- Memory mới (cross-session) đã ghi 7 entry: `vfos-role`, `vfos-safety-boundaries`, `vfos-round-based-workflow`, `vfos-script-style`, `vfos-automation-targets`, `vfos-shopee-owner`, `vfos-bgm-rotation` (xem `MEMORY.md` ở memory dir).

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
| Branch | `feat/ent-multichannel` |
| HEAD local | `7cbf01c` `feat(overview): publish rhythm board + Phần 82 docs (R-C)` (2026-07-20) + 1 commit docs checklist diễn tập đang tạo |
| Remote | `origin` (GitHub) |
| origin/feat/ent-multichannel | `7cbf01c` (đẩy 2026-07-20). Cụm Phần 82: `2196053` R-A cổng duyệt AI · `4cd84e1` R-B máy tick · `96720ff` F1/F2 double-post lock · `7cbf01c` R-C board UI + docs. |
| Sync status | **sync 0/0** tại `7cbf01c`; commit docs checklist diễn tập tiếp theo push sau khi Operator duyệt. |
| Working tree | Chỉ còn `production/_media/bgm_library.json` (runtime tự mutate counter — KHÔNG commit). Phần 82 code XONG toàn bộ; còn lại diễn tập 3 ngày (việc tay Operator). |
| Dev server | Port 3002 (bật khi review). Dừng bằng `pnpm studio:dev:clean --no-start`. |

**Trạng thái artifacts production** (tính đến 2026-05-29 phiên sync):
- `production/batch_001/yt_007/` (text artifacts): ĐÃ commit ở `df1609e` — reference cho vòng Voice Sync autonomy.
- `production/batch_001/yt_005/voice_sync_v0_preset1/`, `yt_006/`, `yt_012/voice_sync_v0/`, `yt_014/demo_match/sources/` (text/JSON artifacts): còn untracked — Nhóm B, runtime, không commit.
- `production/_commerce/*.json`: untracked, runtime extraction state, **chứa credential_token trong canonical URLs (SENSITIVE)** → đề xuất gitignore round sau.
- `production/archive/`: untracked, output từ reel archive packager (Cụm 6 Round 29) → runtime, không commit.
- Binary media (`.mp4`, `.mp3`, `.wav`, `.m4a`, `.webm`, `.jpg/.jpeg/.png`): đã gitignore theo `.gitignore` lines 56-65, không commit.

> Phiên 2026-05-29 chỉ commit file điều hành (`docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md`). KHÔNG add runtime artifacts. KHÔNG add scratch scripts.

---

## 11. Phần 82 — Auto-Publish OS (2026-07-19/21)

**Mục tiêu**: 100% tự đăng thay click người bằng **cổng duyệt AI tự động** (R-A) + **máy tick tự đăng theo lịch giờ vàng** (R-B). No-Go #3 **nới CÓ ĐIỀU KIỆN** (Operator directive 18-19/07 — xem amendment trong `CLAUDE.md`); **mặc định TẮT**, chỉ bật LIVE sau diễn tập 3 ngày đạt.

### Đã hoàn thành + PUSHED
- **R-A `2196053`** — cổng duyệt AI fail-closed 2 lane (PR 7-check + ENT 6-check gồm soi chữ Trung + whisper voice-vs-script). Config `VFOS_AUTO_APPROVE*` default off. **Live-accepted**: PR job FAIL watermark, ENT job NEEDS_HUMAN voice 58% — con mắt AI đúng thiết kế, không rubber-stamp.
- **R-B `4cd84e1`** — máy tick `pnpm tick:publish`: DISCOVER job đã duyệt → BIND slot → POST route Studio (tick KHÔNG cầm token; guard mis-post G4/G7 server-side). Mặc định dry-run KHÔNG network; fire cần 3 tầng: `VFOS_PUBLISH_TICK=on` + cờ nền tảng + không `--dry-run`. 82 test + review đối kháng 9 finding (đã sửa).
- **F1/F2 `96720ff`** — POSTING busy-lock chống double-post cả 2 lane (prerequisite go-live).

### R-C `7cbf01c` (PUSHED — Operator đã duyệt mắt board)
- **Board UI** read-only @Tổng quan: route `GET /api/studio/publish-board` + panel `PublishRhythmBoard` (trạng thái config/phanh/độ trễ tick/slot/hậu-kiểm, giờ VN). Không nút action.
- **Docs**: CLAUDE.md No-Go #3 amendment + mục này.
- **Rà soát hoàn chỉnh (20/07)**: chuỗi khép kín, lệch-plan có chủ đích — (1) FB hẹn-giờ native → **đã CHỐT HỦY** ở R-D (xem điều kiện mở lại), KHÔNG phải "vá sau"; (2) route KHÔNG tự refresh token → **đã làm ở R-D#2** (auto-refresh); (3) fire lỗi → SKIPPED + discovery tự bind lại slot kế (không retry 15′); (4) phanh tầng 1 = tạo file `publish-halt.json` tay (chỉ dừng tick, không chặn route — xem R-E).

### R-D #2 `6b5c3a9` PUSHED — Auto-refresh token TikTok + HỦY #1
- `refreshAccountToken` export ROTATION-SAFE trong `tiktok-oauth-helper.ts` (CLI + tick dùng chung; ghi store **ATOMIC** tmp→rename) + `needsTokenRefresh` thuần + `maybeRefreshTokens` trong tick (trong lock).
- **Cờ `VFOS_TOKEN_AUTOREFRESH=on`** (mặc định OFF). Tick tự refresh token gần hết hạn (<2h) **CHỈ khi target đi LIVE** (fireIsLive) → dry-run/observe KHÔNG chạm mạng. refresh_token chết → **SUSPENDED** + board todo (login tay, No-Go #4). ⇒ thay được việc refresh tay mỗi sáng.
- **#1 (FB hẹn-giờ native) — QUYẾT ĐỊNH CHỐT: HỦY** (mô hình "VFOS tự bấm đăng FB đúng giờ vàng"; laptop đằng nào cũng bật cho TikTok). Primitives SCHEDULED đã build sẵn (`publish-reels.ts` videoState=SCHEDULED + readback; `withinFbScheduleWindow` có test) → mở lại ~1 round nhỏ **CHỈ KHI đủ 3**: [FB có doanh thu attribution >0] AND [board ghi ≥3 slot FB SKIPPED/MISSED trong 14 ngày] AND [VPS chưa lên]. VPS Phase 2 lên trước → retire #1 vĩnh viễn. (Dứt mâu thuẫn với dòng "Rà soát (1)" cũ.)
- **⚠ CƠ CHẾ CỜ (đổi so với R-B, do review đối kháng bắt regression):** tick đọc `.env` RIÊNG (parseEnv) CHỈ để lấy secret + `VFOS_TOKEN_AUTOREFRESH`; **cờ fire (`VFOS_PUBLISH_TICK`/`TIKTOK_PUBLISH_LIVE`/`META_MODE`) PHẢI set TƯỜNG MINH trong RUNTIME ENV của tick (schtasks), KHÔNG để .env tự arm** → giữ tầng phanh "cờ nền tảng" độc lập với master. `.env` sẵn có `TIKTOK_PUBLISH_LIVE`/`META_MODE` (cho publish tay) nay KHÔNG còn tự bật tick.
- Verify: 65/65 test + tsc/biome 0 + dry-run `liveTT=false`. Review đối kháng 9 finding → sửa 4 (A cờ-nền-tảng, B `--dry-run` gate refresh, C ghi atomic, D comment), còn lại refute/nit.

### R-E (chờ commit) — Hardening theo thẩm định Fable 5 (hội đồng 3 giám khảo, 0 fatal flaw)
Fable 5 chấm Phần 82: an toàn 8.5/10 · sẵn sàng vận hành 7/10 · đòn bẩy North Star 6/10; kết luận "xứng đáng nới No-Go #3, vá 3 mép trước ngày-1 live". **Đã vá (code):**
- **C1 fail-closed privacy** (`tiktok-publish-client.ts`): bỏ fallback `privacyOptions[0]` (có thể PUBLIC) → thiếu privacy an toàn thì **từ chối đăng** (`privacy_unavailable`), giữ SELF_ONLY tuyệt đối.
- **C2 fail-closed identity G7** (`review-tiktok/publish.ts` + route): live mà thiếu `REVIEW_TIKTOK_USERNAME` → **chặn** (`IDENTITY_UNVERIFIABLE`) thay vì skip im lặng (chống token dán nhầm account). Kèm: đèn `tiktokApiReady` phản ánh thiếu username (đỏ khi live-chưa-set, khỏi "xanh mà POST fail").
- Verify: studio tsc 0 + biome sạch + skeptic đối kháng 4 câu SAFE (không fail-open/over-block; ENT cũng được fail-closed lây). **Nợ**: 2 nhánh fail-closed (`privacy_unavailable`/`IDENTITY_UNVERIFIABLE`) CHƯA có test (test studio live-publish cần mock fetch — round riêng).

### R-F (chờ commit) — Dọn 3 hardening đã hoãn của R-E
- **H1 — Phanh route + shared-secret** (`growth-data/publish-guard.ts` MỚI): `isPublishHalted()` cho **CẢ 4 route publish live** (review→tiktok, ent→facebook, ent→tiktok, review→facebook) đọc cùng `publish-halt.json` → halt = đóng băng MỌI cửa đăng (tự động + tay), không chỉ tick. `tickKeyOk()` = shared-secret OPT-IN (`VFOS_TICK_KEY`): miễn UI browser same-origin, đòi header `X-VFOS-TICK-KEY` cho caller lập trình (tick/curl); mặc định chưa set = không đổi hành vi. Tick `fireViaRoute` gửi header khi có key. **Review đối kháng bắt: ban đầu chỉ bọc 2/4 route → đã vá đủ 4/4** (grep xác nhận).
- **H2 — Chống re-poll token chết** (`tiktok-oauth-helper.ts` + tick): `refreshRejectedAt` persist khi refresh_token chết (CHỈ mark `invalid_grant`/`NO_REFRESH_TOKEN` — lỗi 5xx/transient KHÔNG mark, để tick tự thử lại); tick skip account đã mark (hết ~576 call/48h). TỰ CLEAR khi login/exchange lại (ghi entry mới). Marker KHÔNG chặn publish (chỉ chặn refresh).
- **H3 — Test**: round-trip `refreshRejectedAt` (persist + self-clear) ở `tiktok-oauth-helper.test.ts` (66/66). Test 2 nhánh fail-closed studio (`privacy_unavailable`/`IDENTITY_UNVERIFIABLE`) **VẪN chặn** — apps/studio KHÔNG `type:module` nên tsx `--test` không import được named export (nợ runner có sẵn, 5 test entertainment cũng đỏ vì cùng lý do); unblock = round test-infra (thêm vitest / sửa CJS interop).
- Verify: scripts tsc 0 · studio tsc 0 · biome sạch (CRLF app/api là pre-existing, git autocrlf) · 66/66 test · dry-run tick `liveTT=false`. Review đối kháng 1 finding CONFIRMED (2/4 route) đã vá.

### Kịch bản DIỄN TẬP 3 NGÀY (điều kiện bật LIVE chính thức)
> **Bản chất tiêu chí (Fable 5)**: 4-6 post trong 2-3 ngày KHÔNG đủ mẫu thống kê để bound false-PASS rate. Cái thực sự gánh an toàn là **SELF_ONLY (private-first) + hậu-kiểm 100%**, KHÔNG phải "thống kê 3 ngày". Set `REVIEW_TIKTOK_USERNAME` trước ngày-1 (nếu không C2 chặn: `IDENTITY_UNVERIFIABLE`).

0. **Trước diễn tập — NỘP TikTok app audit NGAY, song song** (KHÔNG chờ PASS): privacy policy URL + ToS + demo video + justification `video.publish`. Chi phí engineering = 0, lead time thuộc TikTok, và là điều kiện DUY NHẤT biến lane Review tự-đăng SELF_ONLY (0 view public) thành view thật.
1. **Ngày 0 — setup + BRAKE FIRE-DRILL**: mở Next 3002 · set `REVIEW_TIKTOK_USERNAME` + xác nhận token `tt_review_main` còn hạn · `schtasks` mỗi 5 phút, **cờ fire trong runtime env schtasks** (`VFOS_PUBLISH_TICK=on`+`VFOS_AUTO_APPROVE_REVIEW=on`, **KHÔNG** `TIKTOK_PUBLISH_LIVE` ⇒ dry-run) · tắt Windows sleep + Active Hours phủ 11:30/17:30/20:30 + hoãn Windows Update 3 ngày. **Kéo thử 4 tầng phanh THẬT ≥1 lần**: tạo `publish-halt.json` → xác nhận tick log "HALT" rồi xoá; gỡ `VFOS_PUBLISH_TICK` giữa 2 tick → xác nhận run kế dry-run. Xác minh board `config.master/liveTiktok` khớp ý định trước giờ vàng đầu.
2. **Ngày 1-2 — SELF_ONLY thật**: thêm `TIKTOK_PUBLISH_LIVE=true` runtime env (SELF_ONLY) — tick đăng 2-3 video/ngày/target, **spot-check 100%** trước khi bật public. Token: `VFOS_TOKEN_AUTOREFRESH=on` (.env) để tự refresh, hoặc tay `pnpm tiktok:oauth refresh --account tt_review_main` mỗi sáng. **Mỗi tối đối chiếu 3 SỐ**: số bài trên app TikTok == số FIRED trên board == số status POSTED (bắt double-post crash-recovery + lệch cap). Quy tắc: **board `lastTickAt` cũ >30 phút = điều tra ngay** (không có watchdog tự alert).
3. **PASS go-live** = ≥2 ngày đủ nhịp 2-3 post/ngày/target zero-click + **spot-check 100% HẾT tuần 1 không false-PASS** → mới flip LIVE chính thức. **FB go-live cần mini-drill RIÊNG** (FB không có SELF_ONLY: 1-2 post đầu Operator canh trực tiếp, đăng public ngay). Tạo FB System User token trước.
4. **4 tầng phanh** luôn sẵn: `publish-halt.json` (chỉ dừng TICK) · config off · cờ nền tảng · xoá Task Scheduler. ⚠ Đóng băng CẢ route publish tay = hạ cờ `.env` hoặc tắt Next.

### Bước tiếp theo duy nhất
Commit R-E (C1/C2 hardening + doc này) → khởi động **diễn tập 3 ngày** theo checklist trên. **Round KẾ sau diễn tập = G1 revenue ingestion** (vòng "đăng→đo→học" đang đứt ở khâu ĐO, không phải khâu đăng — Fable 5), ưu tiên trước mọi automation đăng bổ sung. Cảnh báo cần thêm: OpenAI quota chết → cổng AI dồn hết về NEEDS_HUMAN (an toàn nhưng tê liệt automation) → cần alert sớm trên board.
