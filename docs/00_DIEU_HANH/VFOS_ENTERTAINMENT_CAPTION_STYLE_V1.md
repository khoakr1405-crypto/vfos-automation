# VFOS — Entertainment Caption Style V1 (Vlog Câu Cá)

> **Chuẩn caption/script CHÍNH THỨC cho lane Giải trí/Fishing-Vlog.** Tổng hợp từ
> round **script v2** đã PASS + Operator duyệt (commit `34b83e4`). Đây là **hướng
> caption nền** cho mọi video lane này, không còn là fix tạm cho 1 video.
>
> Lane: `entertainment/fishing-vlog` · Bước sinh script: [`scripts/ent-vlog/13-source-bound.ts`](../../scripts/ent-vlog/13-source-bound.ts)
> · Nguồn nghĩa: `asr_zh.json` (ASR Trung) + `catch_moments.json` (vision).
> Bám spec lane: [VFOS_ENTERTAINMENT_LANE_SPEC.md](VFOS_ENTERTAINMENT_LANE_SPEC.md).

---

## 0. Nguyên tắc nền

- Caption = voice text (1 nguồn duy nhất `montage_v2_script.json`, hash voice==caption).
- **Không** auto-publish, **không** TikTok API, **không** affiliate ở phase này.
- Script là **runtime** (gitignored) — sửa tay được, khóa bằng `reviewStatus: OPERATOR_EDITED`.
- **Không fake success**: QA fail thì chặn thật (exit ≠ 0), không báo pass giả.

---

## 1. Luật nền caption/script (BẮT BUỘC)

| # | Luật | Diễn giải |
|---|---|---|
| L1 | **Câu đủ 8–14 từ** (khi phù hợp) | Mỗi beat là MỘT câu tiếng Việt hoàn chỉnh, có chủ–vị. KHÔNG cắt vụn 2–6 từ rời rạc. |
| L2 | **Dấu câu tự nhiên cho TTS** | Mỗi câu kết bằng `.`/`!`/`?`, dùng `,` giữa câu → ElevenLabs đọc có ngắt nghỉ, không cụt. |
| L3 | **Hook/persona trong 3–5s đầu** | Beat đầu (`role:hook`, t≈0.5–3s) dựng nhân vật + chốt kèo. |
| L4 | **Bám ASR tiếng Trung** | Mỗi beat `line` neo vào lời gốc (`srcId` → `asr_zh` segment). Không bịa tình tiết. |
| L5 | **Dùng ASR mở đầu làm ngữ cảnh** | Đọc lời gốc TRƯỚC money-shot đầu (id0…firstWindow) để giữ "hồn video"/persona, dù cảnh đó không lên hình (B-light). |
| L6 | **Giữ meme/lóng Trung → Việt hóa** | KHÔNG xóa meme tạo độ vui; Việt hóa cho người Việt hiểu. Bảng meme ở §3. |
| L7 | **Không dịch khô từng chữ** | Gộp nhiều câu gốc gần nhau thành 1 câu Việt mượt nếu hợp lý. |
| L8 | **Không câu cụt / vô nghĩa / filler generic** | Không "vì khách quy đám", "vội nhé lúc nã"…; không micro-filler tả cảnh chung chung ("biển nhấp nhô nhẹ"). |
| L9 | **Đúng loài/sự vật theo vision** | `subject` theo niche + `catch_moments.what`. Cá là cá, KHÔNG gọi thành mực. KHÔNG đổi loài. |
| L10 | **Caption vừa đọc vừa nhìn** | Độ dài câu khớp khung thời gian money-shot (step 12 QA caption crowding/overlap). |

---

## 2. Cấu trúc beat chuẩn

- Tổng **18–28 beat** cho video ~2 phút (~138s).
- Vai trò: `hook` (1, mở đầu) · `line` (kể chuyện, đa số) · `react` (cảm thán ngắn, §3).
- Tổng thời lượng đọc ≤ thời lượng video (chừa khoảng cho ambient sóng/gió).

---

## 3. Humor Reaction Layer (CHÍNH THỨC)

Lớp phản ứng vui kiểu người Việt xem vlog câu cá — **thêm sức hấp dẫn, không lố**.

**Whitelist cụm phản ứng:** `Ha ha,` · `He he,` · `Ơ kìa,` · `Trời ơi,` · `Đúng bài rồi,`

**Luật đặt:**
- **Chỉ 3–5 lần** trong 1 video ~2 phút. KHÔNG thêm vào mọi beat.
- **Chỉ ở money-shot thật**: cá dính/kéo mạnh · một phát hai con · cá thứ bảy/tám/chín · con to cuối.
- Ghép vào ĐẦU câu hiện có (vd "Dính rồi nha!" → "**Ơ kìa,** dính rồi nha!").
- **Không** làm mất nghĩa gốc Trung / meme đã Việt hóa.
- **Không** làm câu > 16 từ. Giữ dấu câu.
- **Không** lố/kịch — phản ứng phải tự nhiên như đang xem cùng.

**Ví dụ chuẩn (job 114910, đã duyệt):**
| Cảnh | Câu |
|---|---|
| cá dính | "Ơ kìa, dính rồi nha!" |
| một phát hai con | "Trời ơi, vẫn là cá nhỏ lanh lẹ, một phát lên hai con!" |
| cá thứ tám | "He he, thứ tám lên luôn, còn một con đang bám theo." |
| con to cuối | "Ha ha, con này to hơn tất cả, anh cả tới rồi!" |

**Bảng meme đã Việt hóa (giữ chuẩn cho lane):**
| Gốc Trung | Việt hóa |
|---|---|
| 这片海最快的男人 | "tay câu nhanh nhất cái vùng biển này" (persona hook) |
| 跟拔萝卜一样 | "câu cá như nhổ củ cải / bốc thăm" |
| 快到碗里来 | "mau chui vào thùng cho anh nào" |
| 葫芦娃救爷爷 / 七娃八娃九娃 / 大娃 | "cá kéo nhau cứu ông / đứa thứ bảy–tám–chín / anh cả" |
| 清补凉 | "đổi bát chè sâm bổ lượng" |
| 敢不敢三连抽 | "dám kéo liền ba phát không" |

---

## 4. QA Gate chuẩn (chặn câu xàm/lủng củng)

QA **fail thật** (exit 5) nếu vi phạm. Ngưỡng chuẩn V1:

| Gate | Ngưỡng |
|---|---|
| Số beat | 14 ≤ n ≤ 34 |
| TB từ/beat | ≥ 7 (mục tiêu 8–14) |
| Tỷ lệ câu < 5 từ (trừ `react`) | ≤ 0.30 |
| Tỷ lệ câu có dấu câu | ≥ 0.65 (thực tế đạt ~1.0) |
| Câu > 16 từ | ≤ 1 |
| Filler không bám gốc | ≤ 4 |
| Hook trong 5s đầu | bắt buộc có |
| Câu cụt nghi vô nghĩa (`line` < 4 từ, không dấu câu) | = 0 |
| Tổng đọc | ≤ thời lượng video |
| **Reaction (Humor Layer)** | **3 ≤ số `react`/reaction-prefix ≤ 5; chỉ ở gần money-shot** *(đề xuất bổ sung — xem §6)* |

---

## 5. Đối chiếu code ↔ chuẩn (tính tới `34b83e4`)

| Luật | Trạng thái trong [`13-source-bound.ts`](../../scripts/ent-vlog/13-source-bound.ts) |
|---|---|
| L1 câu 8–14 từ | ✅ Prompt `buildScriptSys` + QA `avgWords≥7` & `>16từ≤1` (band 8–14 chưa siết chặt 2 đầu) |
| L2 dấu câu | ✅ Prompt + QA `punctRatio≥0.65` |
| L3 hook 3–5s | ✅ Prompt + QA `hook≤5s` |
| L4 bám ASR | ✅ cắt `asr_zh` theo cửa sổ, `srcId` |
| L5 ASR mở đầu (B-light) | ✅ `introLines` đưa vào prompt làm context |
| L6 giữ+Việt hóa meme | 🟡 Prompt có bảng meme (D); **không QA tự kiểm** (không verify được meme có mặt) |
| L7 không dịch khô | ✅ Prompt (gộp câu) |
| L8 không cụt/filler | ✅ QA `shortRatio`, `suspect`, `fillerBeats` (heuristic cấu trúc) |
| L9 đúng loài | 🟡 `subject`+`visionWhat`+prompt "KHÔNG đổi loài"; **không QA chặn token sai loài** |
| L10 vừa đọc vừa nhìn | ✅ một phần ở step 12 (caption crowding/overlap QA) |
| QA §4 (9 cổng) | ✅ Đã có đủ 9 cổng |
| **Humor Reaction Layer §3** | ❌ **CHƯA tự động**: prompt chỉ cho "tối đa 3 câu cảm thán"; 4 reaction job 114910 là **Operator sửa tay** + khóa `OPERATOR_EDITED`. Whitelist + đặt đúng money-shot + đếm 3–5 **chưa thành code/QA**. |

---

## 6. Đề xuất bổ sung code (PLAN — chưa code)

**Mục tiêu:** đưa Humor Reaction Layer thành luật chạy được + QA, thay vì chỉ sửa tay.

**Phạm vi: chỉ [`scripts/ent-vlog/13-source-bound.ts`]** (không đụng ElevenLabs/audio/scrub/Product Review).

1. **Prompt**: bổ sung chỉ thị Humor Layer — chèn 3–5 cảm thán từ whitelist Ở money-shot (cá dính/một phát hai con/thứ bảy–tám–chín/con to cuối), ghép đầu câu, không lố.
2. **QA gate mới**:
   - `reactionCount ∈ [3,5]` (đếm beat `react` hoặc câu mở bằng cụm whitelist).
   - **Đặt đúng cảnh**: mỗi reaction có `montageTime` gần 1 money-shot anchor (±~4s).
   - (tùy chọn) **Token loài**: fail nếu beat chứa từ loài sai (vd "mực" khi subject=cá).
3. **Giữ nguyên**: edit-lock `OPERATOR_EDITED` để Operator vẫn tinh chỉnh tay sau cùng.

**Lựa chọn vận hành** (Operator chọn ở round sau):
- **(A)** Auto trong 13 (prompt + QA tự sinh reaction) — ít thao tác tay.
- **(B)** Giữ manual-edit + lock (như job 114910 đã làm) — kiểm soát tay, doc hóa quy trình.
- **(C)** Hybrid: 13 tự thêm reaction, Operator vẫn sửa/khóa cuối.

---

## 7. Quy trình vận hành (hiện tại)

1. `produce` chạy `13-source-bound` → sinh `montage_v2_script.json` (QA gate tự chặn).
2. Operator đọc `montage_v2_script_review.md`, chỉnh tay nếu cần (thêm reaction theo §3).
3. Đặt `reviewStatus: OPERATOR_EDITED` để khóa (produce sẽ không ghi đè).
4. Render (step 12 ElevenLabs + 15 ambient) — **cần lệnh Operator** (tốn credit).

---

*V1 — chốt từ round script v2 (`34b83e4`) + Humor Reaction Layer (job 114910). Cập nhật khi có V2.*
