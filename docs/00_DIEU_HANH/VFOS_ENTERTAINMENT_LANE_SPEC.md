# VFOS — Entertainment Lane Spec (Vlog Câu Cá)

> **Phase: E-UI-0 (docs/spec only).** File này CHỐT thiết kế workflow + UI + data
> contract + phase plan cho lane Giải trí/Vlog Câu Cá. **Chưa code UI/API, chưa
> chạy pipeline/render trong phase này.** Mọi phase sau (E-UI-1…6) phải bám spec
> này; nếu lệch phải cập nhật spec trước.
>
> Lane id: `entertainment/fishing-vlog` · Niche đầu tiên: `fishing-vlog`
> (Vlog Câu cá). Theo nav.ts, Câu cá/Xe là **NGÁCH bên trong lane
> `/lanes/content`** ("Nội dung / Giải trí"), không phải lane riêng.

---

## 0. Mục tiêu & ràng buộc nền

**Mục tiêu sản xuất (đã chốt):** làm video giải trí/reup biến đổi từ
TikTok/Douyin/nguồn ngoài → Việt hóa cho người Việt xem, giữ nhịp creator gốc,
video sinh động (ưu tiên giữ tiếng biển/gió/nước/quẫy/thao tác), giảm/tắt giọng
người Trung. **Không** bắt đầu từ Product Card, **không** gắn affiliate ở phase
đầu, **không** auto-publish; Operator là người duyệt cuối.

**Guardrails nền (luôn áp dụng cho mọi phase của lane này):**

- Không đụng Product Review workflow 5 bước / 3 action.
- Không sửa review orchestrator, Product Card logic, `vfos-job-manager`, `nav.ts`.
- Không auto publish, không TikTok API, không ghi registry Review/Product
  Card/Shopee/publish.
- Không commit runtime/output/cache; không `git add .`; không stage file dirty
  pre-existing ngoài scope; không push khi chưa có lệnh.
- Không fake success (mismatch/lỗi → fail hoặc fallback, báo thật).

---

## 1. Workflow 8 bước + state machine + 2 gate

### State machine

```
INTAKE → ANALYZED → MONTAGE_READY → SCRIPT_PENDING
   ──(GATE 1: Operator duyệt script)──→ SCRIPT_APPROVED
   → VOICED → AUDIO_MIXED → PREVIEW_PENDING
   ──(GATE 2: Operator duyệt preview)──→ APPROVED → PACKAGED → (đăng tay)

REJECT ở bất kỳ gate nào → quay lại bước tương ứng (script/preview).
```

- **GATE 1 — Duyệt script** (sau B4, trước B5): không chạy voice/render khi script
  chưa được Operator duyệt.
- **GATE 2 — Duyệt preview** (sau B7, trước B8): không package khi preview chưa
  được duyệt. **READY ≠ được phép đăng.**
- **Không auto qua gate.** Không auto-publish ở B8.

### 8 bước (map với engine CLI đã có)

| Bước | Tên | Engine CLI hiện có | Output chính | Gate |
|---|---|---|---|---|
| 1 | Source Intake | `01-fetch-source.ts` | `source.mp4`, `source_meta.json` | — |
| 2 | Source Analyze + Clip Mining (**vision-anchored**) | `02-asr-zh` + `03-clip-mine` + `03b-vision-anchor` | `asr_zh.json`, `catch_moments.json`, `clip_candidates.json` | — |
| 3 | Montage Build | `10-montage-v2` | `montage_v2/montage.mp4`, `source_subtitle_mask.json` | — |
| 4 | **Source-Anchored Transcreation** | `13-source-bound` (+`11b-bridge`) | `source_cut_reference.json`, `montage_v2_script.json`, `montage_v2_script_review.md` | **GATE 1** |
| 5 | Voice + Caption Sync | `12-voice-render` | `montage_vo.mp3`, `voice_timing_artifact.json`, caption baked → `montage_v2_short.mp4` | — |
| 6 | Audio Mix Policy | `15-audio-ambient-full` (+`14` A/B proof) | `montage_v2_short_ambient.mp4`, `montage_v2_render_report.json` | — |
| 7 | Preview + Operator Review | *(thiếu — UI)* | QA verdict + decision | **GATE 2** |
| 8 | Package Manual Posting | `16-package.ts` ✅ | `montage_v2/package.json` + `package` block | — |

**Nguyên tắc từng bước (chốt):**

- **B2 vision-anchored bắt buộc:** tìm money-shot bằng HÌNH trước; ASR/transcript
  chỉ để hiểu lời + bám nhịp. Không transcript-only.
- **B3 montage:** giữ hành động thật (lead-up + money-shot + reaction), không kéo
  giây thừa; output là visual base.
- **B4 transcreation:** bám lời gốc + bám nhịp gốc + Việt hóa tự nhiên; câu ngắn,
  nhanh, đời thường; **không** GPT sáng tác lan man, **không** dịch máy từng chữ,
  **không** copy 100%. Micro-commentary chỉ thêm ở đoạn im/không rõ. Output đánh
  dấu câu nào **source-bound**, câu nào **micro**, + cảnh báo đoạn confidence thấp.
- **B5 voice/caption:** `voice text == caption text`; caption timing lấy từ
  `voice_timing_artifact`; **hash voice == caption BẮT BUỘC PASS**; caption
  overlap = 0; câu cuối không bị cắt; voice không tràn money-shot. Provider hiện
  tại Edge TTS nhưng **contract giữ swappable** sang ElevenLabs (đích dài hạn).
- **B6 audio:** xem §3.

---

## 2. CLI engine — nguồn sự thật xử lý (giữ nguyên, UI chỉ orchestrate)

Engine ở `scripts/ent-vlog/` (đã chạy thật bước 1–6). UI/API **wrap** engine qua
safe-runner, **không fork** logic. Cần bổ sung: `16-package.ts` (B8) và
`ent-job-manifest.ts` (helper đọc/ghi manifest).

CLI phải chạy standalone được (debug + harness). Cache vision (`_vis/
vision_scenes.json`) để vòng tinh chỉnh không gọi lại Vision.

---

## 3. Audio Mix Policy (chốt)

**`audioMode` mặc định: `remove_speech_keep_ambient`.**

Cách làm:

1. Lấy audio THẬT từ source theo đúng các montage segment → concat khớp timeline.
2. Demucs `htdemucs --two-stems=vocals` → giữ stem **`no_vocals`** làm ambient bed.
3. Mix: ambient thật (đã giảm giọng) + voice Việt foreground + BGM rất thấp hoặc
   bỏ nếu ambient đủ sống.
4. **Ducking/sidechain:** VO nói → ambient/BGM hạ; VO nghỉ → ambient nổi lên nhẹ.
   Tham số proof đã PASS: `sidechaincompress threshold=0.06:ratio=6:attack=15:release=350`,
   ambient level **0.8**, BGM none.

**Điều kiện chấp nhận:** không cần sạch 100% tiếng Trung, **nhưng không được nghe
rõ thành câu**; VO không bị chìm (đỉnh final = đỉnh VO); ambient sinh động.

**Fallback ladder (no fake pass):**

1. `stock_ambient` — ambient biển/gió/nước (ưu tiên file thu thật; proof hiện
   dùng synthetic ffmpeg noise — production nên thay file thật).
2. `mute_source_all` — mute source + voice Việt + BGM (chính sách cũ, luôn dùng được).
3. Nếu rò giọng Trung rõ / rè-méo nặng / mất tự nhiên → **fail**, không xuất success giả.

`audioMode` ∈ `remove_speech_keep_ambient` | `mute_source_all` | `stock_ambient`.

---

## 4. Data contract — `ent_job.json` (namespace riêng)

**Namespace runtime:** `data/temp/ent/<jobId>/` (đã gitignore). Manifest
`ent_job.json` là nguồn sự thật của 1 job giải trí. **Không** ghi vào Product
Review / Product Card / Shopee / publish registry.

```jsonc
{
  "jobId": "ent_squid_001",
  "lane": "entertainment/fishing-vlog",
  "niche": "fishing-vlog",
  "state": "PREVIEW_PENDING",            // state machine §1
  "createdAt": "2026-06-20T...",

  "source": {
    "url": "https://v.douyin.com/...", "type": "douyin|tiktok|local",
    "path": "source.mp4", "durationSec": 359, "meta": "source_meta.json"
  },

  "segmentPlan": {                        // 03b vision-anchor + 10 montage
    "anchors": [3.5, 136.5, 227.5, 290.5, 346.5],
    "segments": [{ "srcStart": 122.5, "srcEnd": 145.5, "montageStart": 12.5 }],
    "moneyShots": [{ "tSec": 136.5, "score": 10, "what": "..." }],
    "reasons": ["..."]
  },

  "transcript": "montage_v2/source_cut_reference.json",   // 13

  "script": {                             // 13 (+11b)
    "ref": "montage_v2/montage_v2_script.json",
    "reviewStatus": "PENDING_OPERATOR_REVIEW|APPROVED",
    "boundChunks": 48, "microChunks": 4, "lowConfidence": []
  },

  "voice": {                              // 12
    "provider": "edge-tts", "swappableTo": "elevenlabs",
    "timingArtifact": "montage_v2/voice_timing_artifact.json",
    "hashAudit": { "voiceHash": "...", "captionHash": "...", "match": true },
    "captionOverlap": 0, "voiceEndSec": 104.2, "spillMoneyShot": 0
  },

  "audio": {                              // 15
    "audioMode": "remove_speech_keep_ambient",
    "demucs": "htdemucs/ok|skipped|fail",
    "ambientLevel": 0.8, "ducking": "th0.06:r6:a15:rel350", "bgm": "none",
    "mixReport": "montage_v2/montage_v2_render_report.json",
    "fallbackUsed": null
  },

  "qa": {                                 // 7
    "hashMatch": true, "captionOverlap": 0, "voiceEndOk": true,
    "scrubRegions": 66,
    "residualSpeechIntelligible": "operator-confirm",
    "ambientLively": "operator-confirm"
  },

  "package": {                            // 8
    "finalMp4": "montage_v2_short_ambient.mp4",
    "captionText": "...", "hashtags": ["..."], "postingNotes": "..."
  },

  "reviewGates": { "scriptApproved": true, "previewApproved": false }
}
```

**Voice provider swappable:** field `provider`/`swappableTo` cho phép đổi Edge TTS
→ ElevenLabs sau này không đổi schema. Caption luôn build từ `voice_timing_artifact`
của provider đang dùng → hash audit giữ nguyên.

---

## 5. UI — Entertainment Command Center (`/lanes/content`)

Biến placeholder `/lanes/content` → Command Center thật cho lane giải trí (niche
selector = Vlog Câu cá). **Page riêng, KHÔNG tái dùng component có thể làm regress
Product Review.** Back-to-lane, orchestrate inline, không lộ route kỹ thuật.

8 panel:

| # | Panel | Nội dung |
|---|---|---|
| 1 | Job Intake | tạo job, dán URL Douyin/TikTok hoặc file local, trạng thái source |
| 2 | Source Analyze | nút analyze, danh sách money-shot/segments, trạng thái ASR/OCR/vision |
| 3 | Montage | segment list, preview montage, rebuild nếu cần |
| 4 | **Script (GATE 1)** | source transcript theo timecode \| Việt hóa theo timecode \| tag `source-bound`/`micro` \| cảnh báo confidence thấp \| **nút Approve script** |
| 5 | Voice/Caption | voice profile (provider), caption chunks, hash audit, overlap check, voice-end check |
| 6 | Audio | `audioMode` selector (3 mode §3), Demucs status, ambient level, ducking setting, A/B proof preview |
| 7 | **Preview (GATE 2)** | video player, QA checklist (§7), Approve/Reject |
| 8 | Package | final mp4 path, caption đăng, hashtag, hướng dẫn đăng tay (**no auto publish**) |

> **Cập nhật (E-UI-1/3):** UI triển khai dạng **3 NÚT LỚN** cho Operator dễ dùng,
> 8 panel ở trên là mô hình nội bộ. Nút 1 = Tải link (panel 1). Nút 2 = **Sản xuất
> video** gộp panel 2–7: bấm 1 lần chạy chuỗi **analyze→montage→script** rồi DỪNG ở
> **GATE 1** (bảng duyệt script bám lời gốc) — chưa voice/render (E-UI-4+). Nút 3 =
> Đóng gói/đăng tay (panel 8, E-UI-6). 2 gate Operator giữ nguyên, không auto qua.

---

## 6. API — namespace riêng `/api/studio/entertainment/...`

**Tách hẳn khỏi `jobs/[jobId]` (máy móc Product Review).** Tất cả route:
**local-only guard** (chỉ 127.0.0.1/::1) + **sanitize response** (không leak path
profile/secrets) + wrap CLI bằng `runRepoScript({ shell: false })`. Không fork
logic engine vào API.

| Method · Route | Engine | Ghi chú |
|---|---|---|
| POST `/entertainment/jobs` | `01-fetch` | create job + intake URL → manifest |
| GET `/entertainment/jobs`, `/jobs/[id]` | manifest | list / detail (đọc `ent_job.json`) |
| POST `/jobs/[id]/analyze` | `02`+`03`+`03b` | clip mining vision-anchored |
| POST `/jobs/[id]/montage` | `10` | build montage visual |
| POST `/jobs/[id]/script` | `13`(+`11b`) | transcreation → review (CONTENT GATE) |
| POST `/jobs/[id]/script/approve` | manifest | set `reviewGates.scriptApproved` |
| POST `/jobs/[id]/voice-render` | `12` | voice+caption (hash audit ép) |
| POST `/jobs/[id]/audio?mode=` | `15` / `14` | audioMode + Demucs/ambient |
| POST `/jobs/[id]/approve` · `/reject` | manifest | GATE 2 |
| POST `/jobs/[id]/package` | `16` | package + hướng dẫn đăng tay (no publish) |
| GET `/jobs/[id]/preview` | serve | trả mp4 preview |

> **Cập nhật (E-UI-3) — gộp analyze/montage/script thành CHUỖI:** các bước này vượt
> 120s ⇒ chạy **DETACHED** qua engine wrapper `scripts/ent-vlog/20-pipeline.ts`
> (`--step analyze|montage|script|produce`), ghi status `data/temp/ent/<id>/steps/
> <step>.json` (engine sở hữu; API chỉ đọc → không race với `ent_job.json`).
> Route thật đã làm: **POST `/jobs/[id]/produce`** (chuỗi analyze→montage→script,
> dừng GATE 1), **POST `/jobs/[id]/script`** (chạy lại riêng `13` sau khi sửa text),
> **GET `/jobs/[id]/script`** (dữ liệu duyệt: beats Việt hóa + lời gốc + review.md),
> **POST `/jobs/[id]/script/approve`** (GATE 1). GET `/jobs/[id]` reconcile state
> machine từ artifact + overlay step status.
>
> **Robustness (chống treo/kill — E-UI-4):** (a) **Global single-flight** — chỉ 1
> step chạy tại 1 thời điểm trên TOÀN bộ job (`findRunningStep`), chặn 2
> render/Demucs đồng thời gây cạn RAM. (b) **pid stale-detection** — engine ghi
> `pid` vào `steps/<step>.json`; nếu status treo `running` mà process không còn
> sống (`process.kill(pid,0)`) → API tự coi `failed` ⇒ UI không treo, cho retry
> sạch (fallback: no-pid + >120s cũng coi stale). Engine chạy DETACHED nên không
> chết theo request; nếu vẫn bị kill ngoài (OOM…) thì 2 cơ chế trên xử lý gọn.
>
> **Cập nhật (E-UI-4/5) — render (voice + audio policy) + GATE 2:** **POST
> `/jobs/[id]/voice-render`** chạy `20-pipeline --step render` DETACHED = **chuỗi
> 12-voice-render → 15-audio-ambient-full**, tức là render đã GỘP **audio policy
> mặc định `remove_speech_keep_ambient`** (Demucs `no_vocals`: bỏ giọng Trung,
> GIỮ ambient biển/gió/nước; ambient 0.8 + ducking, BGM none). `startStep('render')`
> **ÉP GATE 1** (từ chối nếu `scriptApproved !== true`). QA render đọc từ
> `montage_v2/montage_v2_render_report.json` (marker riêng của 12); audio policy đọc
> từ `montage_v2/montage_v2_audio_report.json` (15 ghi: audioMode, demucs, ambient
> level, VO>ambient dB). Preview ưu tiên `montage_v2_short_ambient.mp4` (bản đã áp
> policy), fallback `montage_v2_short.mp4` nếu 15 chưa/được chạy. **GET
> `/jobs/[id]/preview`** stream (Range/206). **POST `/jobs/[id]/approve`** = GATE 2
> (previewApproved, APPROVED); **POST `/jobs/[id]/reject`** quay lại PREVIEW_PENDING.
> State: …SCRIPT_APPROVED→PREVIEW_PENDING→(GATE2)→APPROVED. **READY ≠ đăng** —
> đóng gói/đăng tay là E-UI-6, no auto-publish.
>
> **Cập nhật (E-UI-6) — package đăng tay:** **POST `/jobs/[id]/package`** chạy
> `16-package.ts` SYNC (yêu cầu GATE 2 `previewApproved`) → caption gpt-5.5
> (fallback template nếu lỗi/không key) + hashtag + checklist đăng tay →
> `montage_v2/package.json` (+`package.md`). State APPROVED→**PACKAGED**. UI nút 3
> `PackagePanel`: chọn job đã duyệt preview → đóng gói → final mp4 (mở qua
> `/preview`) + caption/hashtag copy được + checklist. **KHÔNG auto-publish,
> KHÔNG TikTok API, KHÔNG affiliate** (giai đoạn xây kênh).
>
> **Cập nhật (E-UI-7) — gom UI còn ĐÚNG 4 nút / 3 phần:** Tải link · Sản xuất
> video · Duyệt (1 nút đổi ngữ cảnh cho 2 cổng: script ở cuối khối, **video DƯỚI
> player**) · Đăng lên TikTok. 1 ô chọn job DÙNG CHUNG (`EntLaneProvider`/
> `EntJobSelector`). **Bỏ khái niệm "Render lại"** — nút chính luôn "Sản xuất
> video", render là phần của sản xuất, tự chạy ngầm sau duyệt script; kết quả chỉ
> *hoàn thành* hoặc *lỗi→báo lỗi*. Duyệt script → tự `/voice-render`. Chỉ UI,
> không đụng API/engine/artifact. Nút "Đăng lên TikTok" roadmap: nối TikTok API
> tự đăng + caption như lane Review.
>
> **Cập nhật (E-UI-5) — KHÓA audio integration thật (no fake-success):** Engine
> `15-audio-ambient-full` là **all-or-nothing** — Demucs fail → exit, KHÔNG ghi
> report, KHÔNG fallback ladder (note "fallback stock/mute" cũ đã bỏ). Lock ở
> `lib/entertainment/jobs.ts::audioPolicyApplied(id)` = TRUE chỉ khi: có
> `montage_v2_short_ambient.mp4` **+** audio_report `demucs==='htdemucs/ok'` &
> `fallbackUsed==null` & `hasAudio===true` **+** ambient KHÔNG stale (mtime ≥ base
> `montage_v2_short.mp4`). **GATE 2 `approvePreview` và `runPackage` đều CHẶN**
> (`AUDIO_NOT_APPLIED`) nếu chưa áp thật; `16-package` từ chối VO-only
> (`NO_AMBIENT`); UI disable nút "Duyệt video" + báo lý do. Không bao giờ duyệt/
> đóng gói bản chưa bỏ giọng Trung. `audio.applied` trong manifest = strict check.
>
> **Cập nhật (E-UI-8) — GỘP còn 1 cổng + video chỉ hiện khi render xong:** Bỏ GATE
> 1 (duyệt script). **Cổng tay DUY NHẤT = Duyệt video** (vẫn no auto-publish nên
> No-Go #3 giữ). Engine `20-pipeline`: **`produce` = FULL chain**
> `analyze→montage→script→12-voice→15-audio` chạy 1 process tới preview rồi dừng.
> `startStep('produce')` set `scriptApproved=true` tự động (script auto-duyệt để
> reconcile/approvePreview chạy). UI: nút chính LUÔN "Sản xuất video" → `/produce`;
> **bỏ nút "Duyệt script"** (block script còn lại chỉ HIỂN THỊ tham khảo). **Video
> + nút Duyệt video CHỈ hiện khi `render && !running`** (xong hẳn cả 12+15) —
> không hiện preview lúc đang render; player chỉ phát bản đã áp audio. Route
> `/script/approve`·`/voice-render`·`/reject` còn để debug, UI không dùng.
>
> **Cập nhật (E-UI-9) — money-shot anchors THẬT + coverage gate:** Trước đây 10/12/
> 13/15 **hardcode** anchors của riêng video squid `[3.5,136.5,227.5,290.5,346.5]`
> nên mọi video khác chỉ trúng ~1 cảnh ăn tiền. Fix: `scripts/ent-vlog/lib/
> anchors.ts` (`deriveAnchors` cụm catch_moments theo lead+reaction, giữ peak,
> cap max; `readAnchorPlan` đọc anchors.json→catch_moments→fallback). Step mới
> **`03c-moneyshot-coverage`** (chèn NGẦM vào produce giữa vision và montage):
> chọn anchors từ `catch_moments.json` → ghi **`anchors.json`** (10/12/13/15 đọc
> CHUNG, sync video↔audio) + **`moneyshot_coverage_report.json`**; **GATE** exit≠0
> nếu < min (mặc định 3) cảnh ăn tiền → produce DỪNG, KHÔNG render/preview giả
> PASS. UI hiện summary nhỏ "Đã phát hiện X, dùng Y" (đỏ khi FAIL). Không thêm
> nút, không thao tác mới. `EntJob.coverage` overlay từ report.

---

## 7. QA checklist (panel Preview — GATE 2)

- [ ] hash voice == caption PASS
- [ ] caption overlap = 0
- [ ] voice end ≤ montage end (câu cuối không cắt)
- [ ] voice không tràn money-shot
- [ ] scrub chữ Hán: số vùng + xác nhận mắt (không fake "sạch 100%")
- [ ] tiếng Trung không nghe rõ thành câu (tai Operator)
- [ ] ambient sinh động (tai Operator)
- [ ] nhịp video + punch đúng money-shot
- [ ] caption dễ đọc, không chật

---

## 8. Phase plan E-UI-1 → E-UI-6

| Phase | Nội dung | Files dự kiến đụng | Rủi ro | Test/Proof | Rollback | PASS |
|---|---|---|---|---|---|---|
| **E-UI-1** | UI skeleton 8 panel (tĩnh, no action) | `lanes/content/page.tsx`, `components/entertainment/*` | Thấp (page riêng) | dev `:3002`, xem mắt | revert page | 8 panel render; Product Review nguyên vẹn |
| **E-UI-2** | Job intake + status | `api/studio/entertainment/jobs/route.ts`, `scripts/ent-vlog/ent-job-manifest.ts`, panel 1 | TB (chạy CLI từ API) | tạo job từ UI → source tải + manifest | revert routes/page | Job tạo, manifest trong `data/temp/ent`, 0 chạm Review |
| **E-UI-3** | Script review panel (GATE 1) | `.../analyze\|montage\|script\|script/approve`, panel 2–4 | TB (vision/gpt cost) | analyze→montage→script→duyệt | revert | Review render từ artifact thật; gate chặn voice trước duyệt |
| **E-UI-4** | Render/preview wiring | `.../voice-render\|preview`, panel 5+7 | TB | render→preview→QA PASS | revert | Preview + QA hiện; hash audit ép |
| **E-UI-5** | KHÓA audio integration thật | `jobs.ts::audioPolicyApplied`, `approve`/`package`, `16-package`, panel 6 | Thấp | chặn duyệt/gói khi chưa áp thật | revert | no fake-success: GATE2/package chặn `AUDIO_NOT_APPLIED`; 15 all-or-nothing; no stale/fallback |
| **E-UI-6** | Package panel | `.../package`, `scripts/ent-vlog/16-package.ts`, panel 8 | Thấp | package→manifest | revert | Gói + hướng dẫn đăng tay; no publish |

**Thứ tự khuyến nghị:** E-UI-1 → 2 → 3 → 4 → 5 → 6 (đúng dòng workflow). Mỗi phase
1 vòng nhỏ, self-review + Operator duyệt trước khi sang phase sau.

---

## 9. File touch map (toàn lane)

- **Mới (an toàn, namespace riêng):**
  `docs/00_DIEU_HANH/VFOS_ENTERTAINMENT_LANE_SPEC.md` (file này);
  `apps/studio/src/app/api/studio/entertainment/**`;
  `apps/studio/src/components/entertainment/**`;
  `scripts/ent-vlog/ent-job-manifest.ts`, `scripts/ent-vlog/16-package.ts`.
- **Sửa (UI riêng):** `apps/studio/src/app/lanes/content/page.tsx` (+ có thể
  `lanes/fishing-vlog/page.tsx` → redirect vào content).
- **KHÔNG đụng:** `lanes/product-review/*`, `api/studio/jobs/[jobId]/*`,
  `vfos-job-manager`, review orchestrator, Product Card, Shopee, publish, `nav.ts`.

---

## 10. Risk map

- **R1 Regression Product Review** (cao→thấp): API namespace `/entertainment`
  riêng, page riêng, không sửa shared component/nav/orchestrator.
- **R2 Chạy CLI từ API** (injection/leak): `runRepoScript({shell:false})` +
  local-only guard + sanitize (chuẩn Shopee skill).
- **R3 Demucs venv vắng/chậm/fail**: fallback ladder §3, báo status, no fake pass.
- **R4 Cost vision/gpt-5.5**: chạy theo nút, cache vision, báo cost trước khi gọi.
- **R5 Runtime lọt git**: `data/temp/ent` + `tools/demucs-sep` đã gitignore;
  commit scope đích danh, không `git add .`.

---

## 11. Product Review isolation (bằng chứng)

- Grep `scripts/ent-vlog` cho `registry|publish|jobs|productBinding|orchestrator|
  product_card`: chỉ ra **COMMENT cam kết** "no registry/no jobs", **0 import/ghi
  thật**.
- 17/17 script dùng `workDir → data/temp/ent/<id>`; render modules gọi subprocess
  I/O cô lập.
- Thiết kế UI/API: namespace `/api/studio/entertainment` tách hẳn `jobs/[jobId]`;
  không sửa `nav.ts` (lane `/lanes/content` đã tồn tại), không sửa Review
  page/orchestrator/Product Card.

---

## 12. Để dành (ngoài scope phase đầu)

- Affiliate theo ngữ cảnh (1 link chủ đạo + 2 link comment) — chỉ bật sau khi kênh
  có view; không gắn ở phase xây kênh.
- Multi-channel/multi-niche (Vlog Xe…) — manifest đã có field `niche`; mở rộng sau
  khi 1 niche chạy mượt.
- Voice ElevenLabs — đổi `provider` khi hết kẹt billing; schema không đổi.
- `stock_ambient` file thu thật (thay synthetic) cho production.

---

*Spec version: E-UI-0 · chốt 2026-06-20. Sửa thiết kế phải cập nhật file này trước
khi code phase tương ứng.*
