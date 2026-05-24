# TRẠNG THÁI VFOS HIỆN TẠI

> **Loại tài liệu**: File điều hành trung tâm — cập nhật sau mỗi vòng làm việc lớn
> **Cập nhật lần cuối**: 2026-05-24 (Round 2C — Shopee Session Fetcher v0, local browser session via Playwright storageState, blueprint + scaffold, KHÔNG auto-install + KHÔNG auto-run)
> **Branch**: `master` | **Commit mốc tại thời điểm cập nhật trạng thái**: `5c92edd` (Round 2B — Facebook Publish Safety Gate v0). Round 2C commit sẽ bump khi push
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
> **Bước tiếp theo duy nhất: USER quyết định strategy tiếp theo.**
>
> Có 5 hướng khả thi (KHÔNG tự chọn — chờ user quyết):
>
> 1. **Nhân bản Con số 2 theo blueprint** — 5 video Video-First + 1 video Shopee-First là đủ bằng chứng pipeline ổn. Mở `docs/00_DIEU_HANH/VFOS_SHORTFORM_FACTORY_BLUEPRINT_V0.md` cho ngách thứ 2. Đây là path commercial progress (VFOS North Star).
> 2. **Đổi default `OPENAI_MODEL=gpt-4o` trong `.env`** — pre-existing config debt. Cleanup nhỏ, operator không cần `--model gpt-4o` flag từng lần.
> 3. **Test yt_012 Shopee-First với hardening Phần 23** — verify 4 rule mới (Card persist HARD GATE, short link support, operator trim metadata, publish plan) end-to-end trên 1 video mới.
> 4. **Test thử Shopee-First Discovery Mode thật** — `/chay shopee-first` (no link) → agent tự tìm Shopee candidate theo lane. Phụ thuộc vào Shopee data accessibility hiện tại — có thể dừng ở limitation step.
> 5. **Split 4 sub-agent thật** — tạo `.claude/agents/shopee-product-agent.md`, `demo-match-agent.md`, `script-qc-agent.md`, `facebook-publish-plan-agent.md` theo boundary đã định nghĩa ở Phần 23. Chỉ là spec — code multi-agent vẫn ngoài scope cho đến khi user duyệt.
>
> **KHÔNG tự chạy yt_012** mà không có user quyết định. **KHÔNG tự split 4 sub-agent** mà không có user duyệt — Phần 23 chỉ định nghĩa boundary trong SKILL/docs, chưa cấp permission code multi-agent. **KHÔNG mở scope** sang publish thật, BGM ducking, watermark auto-detect, Con số 2 chưa được duyệt, **TikTok Shop chưa được duyệt mở lại**.

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
| Commit mốc tại thời điểm cập nhật trạng thái | `5c92edd` — Round 2B Facebook Publish Safety Gate v0 (đã push). Round 2C (Shopee Session Fetcher v0 — blueprint + scaffold) commit sẽ bump khi push. |
| Remote | `origin` (GitHub) |
| Sync status | Phần 11–23 + Round 2A + Round 2B ĐÃ PUSH (`5c92edd`). Round 2C ĐANG commit (tạo `packages/shopee/` blueprint + scaffold, `.gitignore` `.secrets/`, KHÔNG install Playwright, KHÔNG run script). Bước tiếp: user quyết định Round 2D (`pnpm add -D playwright -F @vfos/shopee` + `pnpm exec playwright install chromium` + chạy `pnpm shopee:login` + `pnpm shopee:fetch` + recalibrate selectors nếu cần) HOẶC 1 trong 5 hướng cũ (Con 2 / OPENAI_MODEL gpt-4o default / yt_012 / Discovery Mode wiring / split 4 sub-agent). |

**Trạng thái artifacts production** (tính đến 2026-05-20):
- `production/batch_001/yt_007/` (text artifacts): **ĐÃ commit** ở `df1609e` — scene_input, script v1/v2/v3, manifest BGM. Dùng làm reference cho vòng Voice Sync autonomy.
- `production/batch_001/yt_005/voice_sync_v0_preset1/` + `production/batch_001/yt_006/` (text artifacts): còn untracked, chấp nhận — không phải hot path hiện tại.
- Binary media (không commit theo `.gitignore`): tất cả `.mp4`, `.mp3` trong `production/`.

> File media là local artifact, đã có `.gitignore`, không commit binary.
