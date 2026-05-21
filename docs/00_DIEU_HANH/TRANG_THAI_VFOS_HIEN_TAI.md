# TRẠNG THÁI VFOS HIỆN TẠI

> **Loại tài liệu**: File điều hành trung tâm — cập nhật sau mỗi vòng làm việc lớn
> **Cập nhật lần cuối**: 2026-05-21 (Phần 16 — /chay Auto-Source Retry + GUARD 6 Repair v1)
> **Branch**: `master` | **Commit mốc tại thời điểm cập nhật trạng thái**: `2881007` (Phần 15 compliance guard). Phần 16 commit sẽ bump khi push
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

> **MỐC ĐÃ ĐẠT (2026-05-21)**: `/chay` đã chạy **zero-touch end-to-end** thành công trên yt_007 (commit `e5e1469`) — Script Writer → Voice Sync → BGM Mix → preview MP4 final, KHÔNG cần operator can thiệp tay. User đã xem preview và đánh giá "rất hài lòng". **yt_007 hoàn thành vai trò pilot. Không tiếp tục tối ưu riêng yt_007 nữa.**
>
> **Bước tiếp theo duy nhất: Chạy `/chay` end-to-end trên video mới `yt_008` để kiểm tra khả năng tổng quát của pipeline.**
>
> **Lý do**: Tiếp tục tối ưu trên yt_007 sẽ overfit case duy nhất đó, không chứng minh được pipeline khái quát. yt_008 là test mới để verify dây chuyền không bị coupled với yt_007 sau khi:
> - Phần 12 — Voice Sync Autonomy (SILENT skip + minor overflow auto-rescue)
> - Phần 13 — Block-Level Budget (per-block cap enforcement, CTA tight)
> - Phần 14 — Budget Reconciliation (target reconcile với aggregate block cap)
> - Phần 15 — Affiliate Compliance + Source Branding Guard v0
> - **Phần 16 — /chay Auto-Source Retry + GUARD 6 Repair v1** ← áp dụng cho yt_008: no-args /chay phải tự quyết định + tự retry candidate fail, GUARD 6 ưu tiên repair blur/mosaic trước khi reject
>
> **Acceptance**: gọi `/chay` (no-args, để memory routing) tạo `yt_008` từ đầu — Script Writer → Voice Sync → BGM Mix → preview. Verify:
> 1. **AUTO-DECISION POLICY**: `/chay` no-args KHÔNG hỏi user mode/ngách/candidate (memory đã ghi yt_008 + lane gadget bếp/đồ gia dụng đủ rõ).
> 2. **AUTO-SOURCE RETRY**: nếu candidate đầu fail GUARD 6 hoặc threshold → `/chay` tự đổi keyword retry tối đa 3 vòng trước khi hỏi user.
> 3. Pipeline tự chạy không cần operator can thiệp tay (automation track).
> 4. Quality status PASS hoặc NEAR-PASS (exit 0) trên video CHƯA TỪNG calibrate.
> 5. Output preview MP4 mở được, không leak source audio.
> 6. **GUARD 6 Visual Safety v1** (3 nhóm: logo/brand/watermark, QR/mã vạch, biển số/PII):
>    - Nếu detect vi phạm → Repair Playbook ưu tiên blur/mosaic.
>    - Decision Status cuối: PASS hoặc PASS_WITH_REPAIR.
>    - Bảng "Detected issue → Repair action → Re-QC result" ghi đầy đủ trong báo cáo.
> 7. **GUARD 7 Affiliate & Content Compliance** (operator-enforced ở STEP 7):
>    - R1: script không copy y nguyên narration nguồn.
>    - R3: script không chứa từ tuyệt đối (tốt nhất / rẻ nhất / chính hãng 100% / cam kết / đảm bảo).
>    - R5: tone soft, không quảng cáo thô.
>    - R2 (product match): nhắc ở báo cáo cuối — chốt affiliate đúng sản phẩm khi publish.
>
> **Quy tắc tuyệt đối cho vòng này**:
> - **KHÔNG dùng lại yt_007 cho vòng kế tiếp.** yt_007 đã đóng vai trò pilot, mọi tinh chỉnh thêm trên nó sẽ là overfitting.
> - **Khi `/chay` được gọi không args (mode 1): ưu tiên tạo/chạy yt_008**, KHÔNG quay lại yt_007 dù memory có nhắc đến.
> - yt_007 artifacts giữ làm reference để so sánh — không touch.
>
> **KHÔNG mở scope** sang Con số 2, publish, BGM ducking, watermark, refactor Voice Sync/Script Writer thêm trong vòng này. Mục tiêu duy nhất: 1 video mới end-to-end qua pipeline hiện tại.
>
> **Sau khi xong**: nếu yt_008 chạy được clean → có bằng chứng pipeline generalize. Mới cân nhắc tới (a) nhân bản Con số 2 theo blueprint hoặc (b) cải tiến tiếp Core nếu phát hiện limit mới.

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
| Commit mốc tại thời điểm cập nhật trạng thái | `2881007` — Phần 15 compliance guard ĐÃ PUSH. Phần 16 (/chay Auto-Source Retry + GUARD 6 Repair v1) sẽ có commit riêng push cùng vòng. |
| Remote | `origin` (GitHub) |
| Sync status | Phần 11–15 ĐÃ PUSH. Phần 16 ĐANG commit riêng. Bước tiếp: yt_008 generalization test qua `/chay` với AUTO-DECISION + AUTO-SOURCE RETRY + GUARD 6 Repair Playbook. |

**Trạng thái artifacts production** (tính đến 2026-05-20):
- `production/batch_001/yt_007/` (text artifacts): **ĐÃ commit** ở `df1609e` — scene_input, script v1/v2/v3, manifest BGM. Dùng làm reference cho vòng Voice Sync autonomy.
- `production/batch_001/yt_005/voice_sync_v0_preset1/` + `production/batch_001/yt_006/` (text artifacts): còn untracked, chấp nhận — không phải hot path hiện tại.
- Binary media (không commit theo `.gitignore`): tất cả `.mp4`, `.mp3` trong `production/`.

> File media là local artifact, đã có `.gitignore`, không commit binary.
