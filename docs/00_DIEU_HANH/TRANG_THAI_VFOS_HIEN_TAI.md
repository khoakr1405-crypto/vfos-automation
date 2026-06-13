# TRẠNG THÁI VFOS HIỆN TẠI

> **Loại tài liệu**: File điều hành trung tâm — cập nhật sau mỗi vòng làm việc lớn
> **Cập nhật lần cuối**: 2026-06-13 (**P3 — Tracking M3–M6 manual import THẬT: section đọc runtime store + breakdown theo kênh + resolve channelId/postId từ job** — xem Phần 31. Phase 1 Channel→Job binding — xem Phần 30. 12-Outcome Audit + Phase Roadmap cùng ngày — kết quả trong session log.)
> **Branch**: `fix/shopee-modal-read` | **Commit mốc tại thời điểm cập nhật trạng thái**: `8266c47` (`feat(studio): real M3-M6 evidence from runtime with channel breakdown`)
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
| Branch | `master` |
| HEAD local | `963bc2a` `feat(shopee): capture product image through product card flow` (2026-06-05) |
| Remote | `origin` (GitHub) |
| origin/master | `963bc2a` — Product Image 04B đã push |
| Sync status | **0 / 0** (up to date, không ahead/behind) |
| Working tree | **Sạch** sau push Product Image 04B. Thay đổi đang mở duy nhất: 2 file điều hành (`TRANG_THAI_VFOS_HIEN_TAI.md` + `HANDOFF_AGENT_HIEN_TAI.md`) — chờ Operator duyệt commit `docs: record product image capture flow completion`. |
| Dev server | Port 3002 **đang CHẠY** (bật ở bước browser review 04B). Dừng bằng `pnpm studio:dev:clean --no-start`. |

**Trạng thái artifacts production** (tính đến 2026-05-29 phiên sync):
- `production/batch_001/yt_007/` (text artifacts): ĐÃ commit ở `df1609e` — reference cho vòng Voice Sync autonomy.
- `production/batch_001/yt_005/voice_sync_v0_preset1/`, `yt_006/`, `yt_012/voice_sync_v0/`, `yt_014/demo_match/sources/` (text/JSON artifacts): còn untracked — Nhóm B, runtime, không commit.
- `production/_commerce/*.json`: untracked, runtime extraction state, **chứa credential_token trong canonical URLs (SENSITIVE)** → đề xuất gitignore round sau.
- `production/archive/`: untracked, output từ reel archive packager (Cụm 6 Round 29) → runtime, không commit.
- Binary media (`.mp4`, `.mp3`, `.wav`, `.m4a`, `.webm`, `.jpg/.jpeg/.png`): đã gitignore theo `.gitignore` lines 56-65, không commit.

> Phiên 2026-05-29 chỉ commit file điều hành (`docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md`). KHÔNG add runtime artifacts. KHÔNG add scratch scripts.
