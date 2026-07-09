# RFC — Cỗ máy Render Video (`@vfos/video-engine`)

> **Status:** APPROVED (Operator duyệt 100% — 2026-07-10) · thi công theo nhịp R1 → R4.
> **North Star:** `render_plan.json` → `preview.mp4` 9:16 hoàn chỉnh = mắt xích cuối biến
> script/giọng/phụ đề thành video đăng được → tăng xác suất ra view & doanh thu affiliate FB/TikTok.
> **Cơ sở khảo sát:** 3 surveyor quét thật hạ tầng hiện có (dẫn chứng file:line ở §0).

---

## §0 — Hiện trạng (khảo sát thực tế)

| Phát hiện | Bằng chứng |
|---|---|
| Toàn repo gọi FFmpeg bằng `child_process.spawnSync('ffmpeg', args)` — CLI thuần, KHÔNG fluent-ffmpeg / ffmpeg-static / WASM | `scripts/kinetic-caption-renderer.ts:999`, `scripts/job-manager/core/media-probe.ts:10`, `scripts/offline-render-video-demo.ts:232`, `scripts/ent-vlog/07-render-real.ts:61` |
| Burn phụ đề = file `.ass` (UTF-8 BOM) + filter `subtitles=<file.ass>`, chạy với `cwd=jobDir` + path tương đối (né escaping Windows) | `scripts/kinetic-caption-renderer.ts:957/983`, ASS builder `:539-581` |
| Ducking ĐÃ CÓ (chỉ lane Giải trí): `sidechaincompress=threshold=0.06:ratio=6:attack=15:release=350` | `scripts/ent-vlog/15-audio-ambient-full.ts:168` |
| BGM mix lane Review = volume tĩnh 0.15, CHƯA duck: `amix=inputs=2:normalize=0` | `packages/voice/scripts/bgm-mix.ts:173-177` |
| CHƯA có logic `scale+crop` 9:16 toàn cục — resolution đang là preset cứng | `scripts/offline-render-video-demo.ts:316` |
| Encode chuẩn repo: `libx264 · yuv420p · preset medium · crf 20 · aac` | `scripts/kinetic-caption-renderer.ts:962-969` |
| CHƯA có package video/ffmpeg nào; logic render rải rác trong `scripts/` | 7 package: ai-agents, db, facebook, script-writer, sdk, shopee, voice |
| Layering thực thi: `packages/` KHÔNG import `scripts/`; `scripts/` import `packages/` qua relative path | `scripts/job-manager/commands/render-plan.ts:11-16` |
| ffmpeg lấy từ PATH hệ thống, không bundle; health-check `ffmpeg -version` | `apps/kernel/src/pipeline/health-checker.ts:103` |

**Kết luận nền:** `render_plan.json` đã chứa đủ field để render thẳng
(`canvas`, `videoSource{trim,fit}`, `audio{voiceGainDb,bgmPath,bgmGainDb,duckUnderVoice}`,
`subtitles[]`, `subtitleStyle`, `output`, `subtitleTiming`). Renderer = hàm ánh xạ plan → args ffmpeg.

---

## §1 — Q1: Công cụ lõi (The Engine)

**Đề xuất: FFmpeg CLI thuần qua `spawnSync` + 1 lớp build-args có kiểu (typed arg-builder). KHÔNG fluent-ffmpeg.**

| Phương án | Đánh giá |
|---|---|
| FFmpeg CLI + spawnSync ✅ | Đồng bộ 100% với 4 renderer đang chạy; `filter_complex` viết tay nhìn thấy nguyên lệnh → dễ debug; 0 dependency mới. |
| fluent-ffmpeg ❌ | Thêm dep (bảo trì yếu), API bọc `filter_complex` vụng với `sidechaincompress`/graph phức tạp, VẪN cần ffmpeg binary → không giảm lỗi. |
| @ffmpeg/ffmpeg (WASM) ❌ | Chậm, RAM lớn, thừa cho server có ffmpeg sẵn. |

> "Nhẹ & ít lỗi nhất" = raw CLI + tách phần dựng-chuỗi-filter thành hàm THUẦN (unit-test được) khỏi phần spawn.
> Triết lý đã thắng ở `@vfos/ai-agents` (pure logic + I/O shell tách bạch).

**Tái dùng nguyên xi:** pattern spawn ← kinetic-caption-renderer · `getVideoDuration` (ffprobe) ← media-probe ·
mẹo `subtitles=<assRel>` + `cwd=jobDir` (né escaping Windows) ← kinetic-caption-renderer ·
công thức ducking ← ent-vlog/15 · bộ cờ encode libx264/yuv420p/medium/crf20/aac.

---

## §2 — Q2: Kiến trúc Module

**Tạo mới `packages/video-engine` (mô phỏng khuôn `@vfos/ai-agents`, `dependencies: {}`).**

Renderer là thư viện tái dùng (scripts/ CLI gọi nó) → thuộc `packages/`, giữ layering 1 chiều.
Có I/O (spawn ffmpeg, đọc/ghi file) nhưng KHÔNG phạm layering (luật là chiều import, không phải độ thuần).
Vẫn tách đôi để test-ability:

```
packages/video-engine/
├── package.json          # copy ai-agents, name=@vfos/video-engine, deps:{}
├── tsconfig.json         # extends ../../tsconfig.base.json, include src/**
├── src/
│   ├── index.ts          # public surface
│   ├── types.ts          # FfmpegPlan, FilterGraph, RenderResult + input types
│   ├── filter-graph.ts   # PURE: renderPlan → { filterComplex, inputs, encodeArgs }  ← UNIT TEST
│   ├── ass-writer.ts     # PURE: subtitles[] + subtitleStyle → chuỗi .ass (V4+)
│   └── ffmpeg-runner.ts  # I/O (R2): viết .ass, spawnSync ffmpeg, parse stderr/exit
└── tests/
    ├── filter-graph.test.ts   # assert chuỗi filter_complex (không cần ffmpeg)
    └── ass-writer.test.ts
```

**CLI trạm điều phối** (R3, ở `scripts/` — cùng mẫu `render-plan.ts`):
`scripts/job-manager/commands/render-video.ts` → load `render_plan.json` → `buildFfmpegPlan` →
`runner.render()` → ghi `preview.mp4` + `render_report.json` + wiring manifest (additive) +
đăng ký dispatcher + `--confirm-render`.

Consume qua relative path: `../../../packages/video-engine/src/index.js`.

---

## §3 — Q3: Chiến thuật `filter_complex` (gánh cùng lúc Video + Audio + Sub)

Input map: `-i videoSource.path` (0) · `-i audio.voiceoverPath` (1) · `-i audio.bgmPath` (2, chỉ khi `!= null`).

### Nhánh VIDEO — scale/crop 9:16 → burn sub
```
[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[base];
[base]subtitles=render_subs.ass[vout]
```
- `fit:'cover'` → `increase + crop`; `fit:'contain'` → `decrease + pad=W:H:(ow-iw)/2:(oh-ih)/2:color=black`.
- `render_subs.ass` do `ass-writer.ts` sinh từ `subtitles[]` + `subtitleStyle`. Dùng ASS thay `drawtext`
  vì style/outline/vị trí đẹp hơn, timing chính xác qua `Dialogue` start/end, đúng chuẩn repo.

### Nhánh AUDIO — voice + BGM ducking (tái dùng recipe ent-vlog/15)
Có BGM + `duckUnderVoice=true`:
```
[1:a]volume=<dbToLinear(voiceGainDb)>,asplit=2[vkey][vmix];
[2:a]volume=<dbToLinear(bgmGainDb)>[bgm];
[bgm][vkey]sidechaincompress=threshold=0.06:ratio=6:attack=15:release=350[bgmduck];
[bgmduck][vmix]amix=inputs=2:normalize=0:dropout_transition=0[aout]
```
- sidechaincompress: input-1 = BGM (bị nén), input-2 = voice (key trigger) → giọng đọc tự dìm nhạc nền.
- `duckUnderVoice=false` → `amix=...:duration=first:normalize=0` tĩnh. `bgmPath=null` → chỉ `[1:a]volume=…[aout]`.
- `dbToLinear(db)=10^(db/20)`: voice 0dB→1.0, bgm −18dB→0.1259.

### Ráp lệnh cuối
```
ffmpeg -i src.mp4 -i voiceover.mp3 [-i bgm.mp3] \
  -filter_complex "<video-chain>;<audio-chain>" \
  -map "[vout]" -map "[aout]" \
  -c:v libx264 -pix_fmt yuv420p -preset medium -crf 20 \
  -c:a aac -r 30 -t <durationSec> -movflags +faststart -y preview.mp4
   (chạy với cwd=<jobDir> để 'subtitles=render_subs.ass' đọc path tương đối)
```

---

## §4 — Rủi ro & phòng tránh

| Rủi ro | Xử lý |
|---|---|
| ffmpeg không có trên PATH | Preflight `ffmpeg -version` → exit code rõ, dừng sạch |
| Escaping `subtitles=` trên Windows | Ghi `.ass` trong jobDir + spawn `cwd=jobDir`, path tương đối |
| `bgmPath=null` (mặc định plan hiện tại) | Renderer chạy voice-only, không lỗi |
| Video nguồn ngắn/dài hơn audio | `-t durationSec` (loop/tpad nếu nguồn ngắn — round sau) |
| Render = thao tác nặng | No-Go #2: CLI bắt buộc `--confirm-render` (mẫu `--confirm-tts`); mặc định dừng-hỏi |
| Font Montserrat không có trên máy render | ASS fallback + `fontsdir` — xác minh ở R3 |

---

## §5 — Kế hoạch thi công (nhịp nhỏ, chờ GO từng bước)

1. **R1 — Khung package + PURE core:** `packages/video-engine` + `filter-graph.ts` + `ass-writer.ts` thuần
   + vitest (3 ca: có/không BGM, cover/contain). Zero ffmpeg, zero side-effect.
2. **R2 — Runner I/O:** `ffmpeg-runner.ts` (spawnSync + preflight + parse exit/stderr) + `render_report.json`.
3. **R3 — CLI trạm:** `scripts/job-manager/commands/render-video.ts` + dispatcher + `--confirm-render`;
   bắn thật 1 job (backup/restore zero-footprint) → xuất `preview.mp4` 9:16 có sub + audio.
4. **R4 — Ducking/BGM live + hardening** (khi có BGM thật trong plan).

**Acceptance R1:** `pnpm --filter @vfos/video-engine test` PASS · typecheck sạch · biome sạch · chưa đụng ffmpeg thật.

---

## §6 — Ngoài scope
Không đổi 4 renderer cũ (ent-vlog, kinetic-caption, offline-demo) — chúng chạy lane riêng; video-engine là
đường mới cho luồng `render_plan.json` của lane Review. Không auto-publish (No-Go #3). Không refactor gộp
renderer cũ ở round này (chỉ tái dùng recipe, không đập).
