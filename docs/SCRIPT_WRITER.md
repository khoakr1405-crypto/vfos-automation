# VFOS Script Writer — Workflow Doc

> **Bước trong pipeline VFOS**: AI Script Writer.
> **Mục đích**: thay thế khâu viết voiceover thủ công bằng OpenAI structured output.
> **Trạng thái**: **v3 — Extender Pass đóng word-count gap, chạy thật trên `yt_005`** (vòng 2026-05-18).
> **v2**: ép duration trong 1 pass + temp 0.5 → 119 từ (target 148, vẫn dưới). Pass cấu trúc nhưng FAIL word count.
> **v1**: few-shot + quality guard. Đẩy prose tốt nhưng gpt-4o underwrite (88 từ ÷ target 140).
> **v0**: single-shot, không few-shot, không quality guard — failed quality bar.

---

## 1. Bước này làm gì?

Nhận đầu vào là **timeline scene** của một video đã download, sinh ra **voiceover tiếng Việt** dạng JSON typed có block khớp từng scene — paste thẳng được vào ElevenLabs TTS.

Thay thế việc operator phải:
- Tự nghĩ hook
- Tự chia block khớp window scene
- Tự cân số từ cho khít duration
- Tự xử lý scene off-topic không liên quan

---

## 2. Vì sao tách bước

Bước này tách khỏi voice/render vì:
- Cho phép iterate script độc lập (rẻ, nhanh, không re-render video)
- Output JSON dễ feed cho TTS hoặc qua review pipeline khác
- Một bug ở script writer không ảnh hưởng tới ffmpeg/voice
- Có thể thay backend (OpenAI → Claude → local) mà không đụng renderer

---

## 3. Input chuẩn

File `scene_input.json` mỗi video. Schema ở [packages/script-writer/src/types.ts](../packages/script-writer/src/types.ts):

| Field | Ý nghĩa | Ví dụ |
|---|---|---|
| `video_id` | ID nội bộ | `"yt_005"` |
| `content_goal` | mục đích nội dung | `"content-led affiliate Shopee VN"` |
| `target_platform` | nền tảng đích | `"tiktok"` |
| `duration_target_s` | duration mục tiêu của voice | `50` |
| `tone` | giọng/phong cách | `"nam, năng lượng cao kiểu reviewer Shopee livestream"` |
| `affiliate_angle` | góc bán | `"5 món đồ bếp Trung Quốc giá rẻ"` |
| `cta_style` | kiểu CTA | `"soft — kiểu 'link mình để bio nha'"` |
| `scene_timeline[]` | array scene khớp visual của video | xem dưới |

Mỗi `scene_timeline[i]`:
- `window_start_s`, `window_end_s` — mốc thời gian trong video gốc
- `scene_type` — `HOOK | KITCHEN | FILLER | TRANSITION | CTA | OFF_TOPIC`
- `visual_summary` — mô tả ngắn cái gì đang xảy ra trong cảnh
- `notes` — gợi ý cho writer (nullable)

Cách build input: chạy ffmpeg scene-detect + extract keyframe + visual_summary (manual hoặc multimodal). Quy trình này đã làm cho `yt_005` trong vòng trước, lưu thành `production/batch_001/yt_005/scene_input.json`.

---

## 4. Output

Hai file:

- `script_ai_vX.json` — full output (input + output + meta + timestamp)
- `script_ai_vX.txt` — chỉ `full_script` để paste vào ElevenLabs

Output JSON cốt:

```json
{
  "hook": "...",
  "blocks": [
    { "block_id": "b1", "window_start_s": 0, "window_end_s": 5,
      "intent": "HOOK", "line": "...", "notes": null },
    ...
  ],
  "cta": "...",
  "full_script": "...",
  "writer_notes": ["..."]
}
```

---

## 5. Cách chạy

```powershell
# Chuẩn bị scene_input.json
# (manual hoặc tự sinh từ scene-detect pipeline)

pnpm script:generate `
  --input  production\batch_001\yt_005\scene_input.json `
  --output production\batch_001\yt_005\script_ai_v1.json `
  --text-output production\batch_001\yt_005\script_ai_v1.txt
```

Mặc định model `gpt-4o-mini`. Override bằng `--model gpt-4o` cho chất lượng prose cao hơn (tốn hơn ~10x).

---

## 6. Tiêu chí script đạt

Operator review thủ công trước khi sang TTS:

| # | Tiêu chí | Đạt |
|---|---|---|
| 1 | Hook 3s đầu kéo viewer dừng | có câu khẳng định/đặt vấn đề mạnh |
| 2 | Bám visual từng scene | mỗi block khớp scene tương ứng |
| 3 | Scene OFF_TOPIC | SILENT hoặc FILLER tease nhẹ, không mô tả thẳng |
| 4 | Tự nhiên tiếng Việt | đọc nghe như người nói chứ không như AI |
| 5 | Không bịa tính năng/giá | không gán spec chưa có trong input |
| 6 | CTA mềm | không "mua ngay", không "bấm vào link giảm X%" |
| 7 | Tổng từ vừa duration | gần `duration_target_s × 2.8` (±10%) |
| 8 | Không lặp cliché | không "đỉnh thật sự" >1, không "thực sự", không "tuyệt vời" |

Khi không đạt: chỉnh `scene_input.json` (thêm notes, đổi tone, refine scene type) → re-gen.

---

## 7. So sánh với script_v2 (manual) — chạy thật yt_005

**Setup**: model `gpt-4o-mini`, 1 lần gọi, 13.8s, 2077 input tokens / 887 output tokens (~$0.0008).

| Tiêu chí | script_v2 (manual) | script_ai_v1 (gpt-4o-mini) | Đánh giá |
|---|---|---|---|
| Word count | 151 | 112 | AI thiếu — 2 block SILENT chiếm 10s |
| Est. duration @ 170 WPM | ~53s | ~40s | AI dưới target 48-52s (cần re-gen với hint) |
| Hook (block 1) | "5 đồ bếp Trung Quốc nhìn cứ tưởng đồ chơi. Mà thử rồi là không bỏ xuống nổi đâu!" | "Nè, nhìn cái cốc nấm này kìa! Thích quá đi! 😍➡️" | **v2 tốt hơn** — đặt vấn đề so sánh "nhìn cứ tưởng đồ chơi" mạnh hơn "kìa! thích quá đi!" |
| Hook field (tóm tắt) | n/a | "Đồ bếp ngầu như mộng, không lo tốn tiền!" | Cụm "ngầu như mộng" lạ, không tự nhiên |
| Scene off-topic cartoon | "Khoan đã, xem món tiếp đã nha!" (FILLER tease) | SILENT | **v2 tốt hơn** retention; AI chọn safer nhưng để gap audio thật |
| Scene off-topic monkey | "Cả con khỉ cũng cười với mình kìa." (user complain gượng) | SILENT | **AI tốt hơn** — không gượng vì im hẳn |
| CTA | "Link Shopee mình để bio. Rẻ lắm, mua thử cả 5 món luôn nha!" | "Muôi hồng quẫy trong nồi... ai thích thì ghé link mình để bio nha!" | v2 mềm + direct hơn; AI chèn miêu tả visual ("muôi hồng quẫy") rồi mới CTA → mất nhịp |
| Tự nhiên VN | giọng người review, có từ địa phương ("tăm tắp", "đỉnh") | dùng nhiều cliché quảng cáo | v2 tự nhiên hơn |
| Bám visual | có | có | tương đương |

### Vi phạm system prompt phát hiện được

AI v1 vi phạm 4 anti-pattern đã ghi rõ trong system prompt:

1. **"Tuyệt vời"** (cấm) → vẫn xuất hiện ở b9: *"Lát cắt đều, mịn màng - tuyệt vời cho món ăn!"*
2. **CTA quảng cáo cứng** ("chắc chắn cần cho mọi nhà!" ở b6) — vi phạm rule "không quảng cáo cứng"
3. **Hook field không khớp block hook line** — system prompt yêu cầu khớp, nhưng AI cho "Đồ bếp ngầu như mộng" còn block b1 lại là "Nè, nhìn cái cốc nấm này kìa"
4. **Cụm sến/dịch máy**: "Thưởng thức canh sao mà không mê!", "Đảm bảo không sót lại gì đâu!" — không đạt chuẩn "tiếng Việt người nói".

→ Đây là **bằng chứng system prompt chưa đủ mạnh** với model gpt-4o-mini. Đề xuất vòng sau ở section 9.

### Trả lời thẳng

| Câu hỏi | Trả lời trung thực |
|---|---|
| AI v1 tự nhiên hơn v2 không? | **KHÔNG**. v2 (con người chỉnh sau 2 vòng) vẫn tự nhiên hơn. AI v1 còn cliché quảng cáo. |
| Hook AI tốt hơn? | **KHÔNG**. Hook v2 "nhìn cứ tưởng đồ chơi" gây tò mò mạnh hơn. |
| CTA AI mềm hơn? | **TƯƠNG ĐƯƠNG mềm** ("ai cần thì ghé link mình") nhưng bị chèn miêu tả visual phá nhịp. |
| Xử lý off-topic đỡ gượng hơn? | **CÓ phần** — SILENT ở cả 2 block off-topic tránh được câu khỉ gượng của v2. Bù lại mất retention 10s. |
| Đáng dùng làm TTS input ngay không? | **CHƯA**. Cần ít nhất 1 vòng re-prompt hoặc human edit để fix 4 vi phạm trên. |
| AI v1 có giá trị gì? | **CÓ**: baseline tự sinh tự động được, tiết kiệm thời gian draft đầu cho video tiếp theo. Operator chỉnh là OK; nhưng KHÔNG paste thẳng vào TTS. |

### Lý do AI v1 chưa đạt

1. Model `gpt-4o-mini` không đủ mạnh cho Vietnamese prose — bias về cliché quảng cáo TV/Shopee. Nâng lên `gpt-4o`/`gpt-4.1` hoặc `gpt-5` sẽ cải thiện chất.
2. System prompt thiếu **few-shot examples** — chỉ liệt kê rule văn bản. Đưa 3-5 cặp "câu xấu / câu tốt" sẽ ép model bắt chước đúng phong cách hơn.
3. Single-shot không có self-critique loop — model không kiểm tra lại output có vi phạm rule chính nó được dặn không.

---

## 8. Vòng v1: few-shot + quality guard (2026-05-18)

Áp dụng 2 trong 3 đề xuất ở section 7 (bỏ self-critique để tránh phình scope):

### Thay đổi prompt
- Thêm **7 cặp DỞ → TỐT** vào [packages/script-writer/src/system-prompt.ts](../packages/script-writer/src/system-prompt.ts): Hook, quảng cáo TV, mô tả sản phẩm sến, bịa tính năng, transition graphic, off-topic, CTA.
- Mở rộng rule cấm cụm (rule 10): thêm "đẳng cấp", "vô cùng", "siêu phẩm", "must-have", "chắc chắn cần", "cho mọi nhà".
- Thêm 2 rule cứng:
  - `hook` field phải EXACT bằng line block đầu HOOK (rule consistency).
  - `cta` field phải EXACT bằng line block cuối CTA.
- Cấm emoji trong `full_script` (TTS đọc tên emoji).

### Quality guard (mới)
File mới: [packages/script-writer/src/quality-guard.ts](../packages/script-writer/src/quality-guard.ts). Chạy sau gen, không gọi API lần 2. Check:

1. **Hard-banned phrases** (case-insensitive substring on `full_script`):
   `tuyệt vời`, `đáng kinh ngạc`, `không thể bỏ qua`, `kinh điển`, `chắc chắn cần`, `cho mọi nhà`, `mua ngay`, `đẳng cấp`, `vô cùng`, `siêu phẩm`, `must-have`, `must have`.
2. **Soft-banned phrases** (flag khi xuất hiện ≥2 lần): `thực sự`, `thật sự`, `đỉnh cao`, `đỉnh thật sự`.
3. **Hook/CTA consistency**: `output.hook === first HOOK block.line`, `output.cta === last CTA block.line` (sau khi normalize whitespace).
4. **Word count window**: count words trong `full_script.trim().split(/\s+/)` so với `duration_target_s × 2.8`, fail nếu ratio ngoài 0.80–1.20.

Output: `QualityReport` ghi vào JSON file dưới key `quality_report`. CLI in `Passed: YES/NO` + danh sách warnings.

`passed = false` không exit error — chỉ là tín hiệu cho operator review. Không gen lại tự động (đẩy sang vòng sau).

---

## 9. Thực nghiệm so sánh trên yt_005

Cùng `scene_input.json`, 3 cấu hình:

| # | Cấu hình | Words | Quality guard | Time | Cost (USD) |
|---|---|---|---|---|---|
| v1 | gpt-4o-mini, no few-shot, no guard | 112 | (guard chưa có; nếu chạy guard mới: FAIL — `tuyệt vời` + hook mismatch) | 13.8s | ~$0.0008 |
| v2 (mini) | gpt-4o-mini, **+ few-shot + guard** | 123 | **PASS** | 28.6s | ~$0.0011 |
| v2 (4o) | **gpt-4o** + few-shot + guard | 88 | **NO** — word count 0.63 ratio (88 vs 140); hard ban + consistency all PASS | 9.7s | ~$0.012 |

### Mẫu output cùng scene B1 (Hook) và B10 (CTA)

| | Hook (B1) | CTA (B10) |
|---|---|---|
| **v1 mini** | "Nè, nhìn cái cốc nấm này kìa! Thích quá đi! 😍➡️" | "Muôi hồng quẫy trong nồi... ai thích thì ghé link mình để bio nha!" |
| **v2 mini** | "Cốc cutter rau xanh dễ thương, nhìn mà chỉ muốn nấu ăn ngay! 🥳➡️" | "Ai cần thì ghé link mình để bio nha!" (đúng câu prompt nhãn DỞ ở ví dụ 7) |
| **v2 4o** | "Hai cốc rau xanh kiểu nấm này nhìn là ghiền, xem tiếp đi!" | "Món nào thấy hợp thì lưu lại, link mình để bio nha." (đúng câu prompt nhãn TỐT) |
| **script_v2 manual** | "5 đồ bếp Trung Quốc nhìn cứ tưởng đồ chơi. Mà thử rồi là không bỏ xuống nổi đâu!" | "Link Shopee mình để bio. Rẻ lắm, mua thử cả 5 món luôn nha!" |

### Đánh giá định tính (operator review)

| Tiêu chí | v1 mini | v2 mini | v2 4o | script_v2 manual |
|---|---|---|---|---|
| Hook hấp dẫn | Yếu, hời hợt | Có emoji, hơi nhạt | **Mạnh, chốt tò mò** | Mạnh, set listicle frame |
| Câu tự nhiên VN | Cliché TV | Vẫn nhiều cliché ("rất OK", "vui lên ngay") | **Tự nhiên, concise** | Tự nhiên, có nhịp |
| Cụm cấm | "tuyệt vời" + "chắc chắn cần cho mọi nhà" | (none hard) | (none hard) | (none) |
| Lặp "sản phẩm" | Không | "Sản phẩm thứ 3" (vi phạm rule 8) | Không | Không |
| Off-topic cartoon | Tự SILENT | FILLER "Khoan nha, lướt qua đoạn này" | FILLER "Khoan đã, đoạn sau mới thú vị" | FILLER "Khoan đã, xem món tiếp đã nha" |
| Off-topic monkey | Tự SILENT | Có line "Ai cười với mình đấy?" → wait, output thực không có. SILENT. | SILENT | "Cả con khỉ cũng cười với mình kìa" (user nói gượng) |
| CTA mềm | Acceptable | Cứng (DỞ example) | **Mềm tự nhiên** (TỐT example) | Direct + casual |
| Bịa tính năng | Không | "không sợ dính nước" (claim mới) | Không | "không đổ giọt nào" (mild claim) |
| Word coverage video | ~40s (mất 12s) | ~44s (mất 9s) | ~31s (mất 22s) | ~53s (gần full) |
| Emoji trong full_script | Có | Có (vi phạm rule mới) | Không | Không |

### Trả lời 6 câu hỏi yêu cầu

1. **Hook bản nào tốt hơn?** v2 4o và script_v2 ngang ngửa, đều mạnh. v2 mini và v1 yếu hơn.
2. **Câu tự nhiên hơn chưa?** v2 4o **CÓ** — đã tiệm cận hoặc vượt script_v2 ở nhiều block. v2 mini cải thiện vừa phải so v1 nhưng vẫn còn cliché.
3. **Còn câu sến/quảng cáo TV không?** v2 4o **gần như không**. v2 mini **vẫn còn** ("vui lên ngay", "rất OK"). v1 nhiều.
4. **CTA mềm hơn chưa?** v2 4o **rõ ràng mềm hơn** (copy đúng câu TỐT từ few-shot). v2 mini không (vẫn dùng câu DỞ trong few-shot).
5. **Xử lý off-topic tốt hơn chưa?** v2 4o + v2 mini **đều dùng FILLER cầu nối** đúng theo few-shot — tốt hơn cả v1 (SILENT) và script_v2 (gượng).
6. **Bản mới đủ tốt cho TTS vòng sau chưa?** **v2 4o ĐỦ về chất lượng prose** nhưng **THIẾU word coverage** (88 từ ≈ 31s trên video 53s → 22s im lặng). Cần một trong:
   - re-gen với hint "viết dài hơn", hoặc
   - chuyển sang v2 mini (123 từ, coverage tốt nhưng chất lượng prose kém hơn), hoặc
   - operator add 30-40 từ thủ công vào block kitchen.

### Bài học v0 → v1 (chính)

- **Few-shot examples đẩy chất lượng prose mạnh hơn rule văn bản**. Model thật sự copy câu TỐT từ ví dụ (CTA v2 4o trùng nguyên văn ví dụ 7).
- **Quality guard bắt được 100% lỗi cụm cấm v1** mà CLI v0 báo "đạt".
- **Model matter**: gpt-4o-mini + few-shot vẫn dưới gpt-4o; chỉ nâng prompt không đủ.
- **Few-shot KHÔNG fix mọi vấn đề**: v2 mini vẫn vi phạm rule 8 (lặp "sản phẩm"), thả emoji, dùng cliché không nằm trong hard-ban list. Quality guard chỉ chặn được cụm đã liệt.
- **Word count trade-off**: model mạnh hơn (gpt-4o) viết concise hơn → coverage thấp. Cần ép word count bằng cách khác (re-prompt với "viết dài hơn block X" hoặc tăng `duration_target_s` giả).

---

## 10. Vòng v2: duration coverage cho gpt-4o (2026-05-18)

**Vấn đề từ vòng v1**: gpt-4o + few-shot pass quality bar về prose nhưng underwrite mạnh (88 từ vs target 140 — coverage chỉ 63%). Re-gen 2-3 lần nhận được word count 88 / 111 / 128 / 134 — variance cao.

### Thay đổi vòng này

| Layer | Thay đổi | Vì sao |
|---|---|---|
| `scene_input.json` (yt_005) | `duration_target_s` 50 → 53 | duration audio thực = 53.43s |
| System prompt | Thêm "⚠️ DURATION TARGET" section cảnh báo gpt-4o underwrite phổ biến + cách mở rộng (KITCHEN dày, FILLER thay SILENT, CTA 2 câu) | gpt-4o thiên về concise; cần ép coverage tự nhiên |
| System prompt rule 4 | OFF_TOPIC ưu tiên FILLER (a) trước SILENT (b) | SILENT 2 lần liên tiếp mất coverage nặng |
| System prompt | Bảng word budget per `scene_type` (HOOK 12-18, KITCHEN window×2.8, TRANSITION 5+, FILLER 5+, CTA 8+, SILENT chỉ window<2s) | dạy model rõ từng kiểu scene cần bao nhiêu từ |
| `buildUserPayload` | Inject `target_words` + `min_words` + `max_words` (±5%) thay vì chỉ `duration_target_s` | model chỉ tin được số cụ thể, không tự suy ra |
| `buildUserPayload` | Inject per-scene budget kèm visual_summary mỗi line | model biết mỗi scene viết bao nhiêu từ |
| `buildUserPayload` | "MANDATORY 5-point final check" cuối payload | ép self-verify: word count, hook=B1, cta=B_N, no emoji, ≤1 "sản phẩm" |
| `openai-client.ts` | `temperature: 0.5` (vs default SDK ~1.0) | giảm variance giữa các lần gen (quan sát 88/111/128/134 ở temp mặc định) |
| `quality-guard.ts` | Word count window 0.80–1.20 → **0.95–1.05** | khớp `[min_words, max_words]` payload |
| `quality-guard.ts` | Warning hiển thị %delta thay vì ratio bounds | dễ đọc hơn cho operator |

### Kết quả chạy thật trên yt_005 (53s)

Cùng `scene_input.json` mới, gpt-4o, temperature 0.5:

| # | Cấu hình | Words | Banned | Hook=B1 | CTA=B_N | Notes |
|---|---|---|---|---|---|---|
| script_v2 manual | con người viết | ~133 | none | ✓ | ✓ | baseline có giá "50k" + 1 câu khỉ gượng |
| v2 (vòng trước, gpt-4o) | gpt-4o + few-shot only | 79 | none | ✓ | ✓ | 9 blocks (1 SILENT), quá ngắn |
| **v3 (vòng này)** | gpt-4o + duration ép + temp 0.5 | **119** | **none** | ✓ | ✓ | 10 blocks (2 FILLER thay SILENT), full coverage |

Files: [script_ai_v3_gpt4o.json](../production/batch_001/yt_005/script_ai_v3_gpt4o.json), [script_ai_v3_gpt4o.txt](../production/batch_001/yt_005/script_ai_v3_gpt4o.txt).

### Trả lời thẳng

| Câu hỏi | Trả lời |
|---|---|
| GPT-4o tạo script dài hợp lý cho 53s chưa? | **CHƯA HOÀN TOÀN**. 119 từ — short 19.6% so target 148. Cải thiện rõ vs vòng trước (79 → 119, +51%) nhưng chưa đạt window 141-156. |
| Đầy đủ KITCHEN coverage không? | **CÓ**. 5/5 KITCHEN scene đều có line tự nhiên (B2 muôi thiên nga, B5 rây hồng, B6 khay dao, B8 gọt vỏ, B9 slicer). Không SILENT. |
| Có sến không? | **KHÔNG**. Quality guard 0 banned. Prose concise, không cliché TV. |
| Có sai sự thật / bịa spec không? | **KHÔNG**. Không gán giá, không gán thông số chưa có trong input. |
| ≤1 lần "sản phẩm"? | **CÓ**. `full_script` không chứa "sản phẩm". |
| Sẵn sàng cho TTS vòng sau? | **CÓ ĐIỀU KIỆN**. Prose OK, hook/CTA OK, coverage thiếu ~8s. Hai lựa chọn: (a) chấp nhận TTS kết thúc sớm ~45s vs video 53s (8s im cuối), (b) operator add 1 câu vào B6 (window 9s, hiện 14 từ vs budget 25) trước khi feed TTS. |

### Bài học vòng v2

- **Constraint engineering có trần với gpt-4o**: dù cảnh báo system prompt, inject min/max words, per-scene budget, và 5-point self-check, model vẫn underwrite 15-25%. Đây là bias của model trên tiếng Việt, không phải prompt sai.
- **Temperature 0.5 giảm variance nhưng không đẩy mean**: vẫn miss target, nhưng output reproduce ổn định hơn (variance giảm rõ vs 88/111/128/134 ở temp mặc định).
- **FILLER thay SILENT tăng coverage thật**: trước 1 SILENT (5s im), nay 2 FILLER ≈ 15 từ ≈ 5s nói → +5s coverage. Quan trọng cho retention TikTok.
- **Không hy sinh chất lượng prose**: 119 từ chất hơn 148 từ filler-stuffed. Theo nguyên tắc "không nhồi chữ vô nghĩa chỉ để đủ word count".
- **Operator vẫn cần touch-up nhỏ** trước TTS — KHÔNG zero-touch.
- **Đường tiếp theo nếu cần đạt 95% coverage tự động** (out of scope vòng này, ghi vào roadmap):
  - (a) model mạnh hơn (`gpt-4.1`/`gpt-5` khi sẵn sàng),
  - (b) self-critique loop riêng kiểm word count + auto-extend block thiếu,
  - (c) hybrid: AI draft → rule-based extender chèn câu KITCHEN từ template bám visual.

---

## 11. Vòng v3: Extender Pass cho coverage closure (2026-05-18)

**Vấn đề từ vòng v2**: dù prompt + temp 0.5 đầy đủ, gpt-4o vẫn underwrite 15-25% trên VN voiceover. Constraint engineering trong 1 pass đã chạm trần — ép thêm sẽ phá prose.

**Hướng giải**: tách bài toán thành 2 pass riêng biệt.
- **Pass 1 (Writer)**: viết prose chất lượng, không bị áp lực coverage tuyệt đối.
- **Pass 2 (Extender)**: mở rộng có kiểm soát bản pass 1, chỉ làm 1 việc — đóng word-count gap, không động hook/CTA.

### Kiến trúc

| File | Vai trò |
|---|---|
| [packages/script-writer/src/extender-prompt.ts](../packages/script-writer/src/extender-prompt.ts) | System prompt riêng cho Extender — 7 quy tắc cứng (HOOK bất khả xâm phạm, CTA gần như bất khả xâm phạm, schema timeline khóa cứng, bám visual, cấm cụm sến, tránh "sản phẩm", không nhồi chữ). |
| [packages/script-writer/src/openai-client.ts](../packages/script-writer/src/openai-client.ts) | Thêm `ScriptWriterClient.expand(ExpandInput)`. Reuse `ScriptOutputSchema` → output drop thẳng qua quality guard lần 2. Temperature 0.3 (constraint chặt hơn pass 1). |
| [packages/script-writer/scripts/generate.ts](../packages/script-writer/scripts/generate.ts) | Orchestration: pass 1 → guard → auto-extend nếu đủ điều kiện → guard lần 2. Hỗ trợ 2 CLI flag mới: `--extender-output`, `--extender-text-output`. |

### Điều kiện auto-trigger Extender

Extender CHỈ chạy khi pass 1 đạt **tất cả** điều kiện sau:

| Điều kiện | Lý do |
|---|---|
| `--extender-output` được khai báo | Opt-in cho operator |
| `hook_consistent === true` | Extender không fix hook structure |
| `cta_consistent === true` | Extender không fix CTA structure |
| Không có hard-banned phrase | Phải fix prose root cause trước, không phải mở rộng thêm |
| `word_count < min_words` | Chỉ mở rộng khi UNDER, không cắt khi OVER |

Bất kỳ điều kiện nào fail → skip extender, exit code = pass 1 status. Lý do: Extender thiết kế để "kéo dài bản tốt", KHÔNG phải "fix bản sai".

### Schema và artifact

- Pass 1 và Pass 2 đều dùng cùng `ScriptOutputSchema` → guard chạy lại không cần code mới.
- File JSON pass 2 thêm `extender_meta` block: `pass1_word_count`, `pass1_response_id`, `pass2_response_id` cho audit trail.
- `writer_notes` của pass 2 ghi rõ block nào expand từ X→Y từ và lý do thêm câu gì.

### Kết quả chạy thật trên yt_005

| Pass | Words | Target | Guard | Hook | CTA | Banned | Time |
|---|---|---|---|---|---|---|---|
| Pass 1 (Writer) | 114 | 148 (±5% = 141-156) | **FAIL** (word_count -23%) | ✓ | ✓ | none | 11.7s |
| **Pass 2 (Extended)** | **151** | 148 | **PASS** | ✓ | ✓ | none | 11.2s |

Tổng latency: 22.9s, ~3600+2700 input tokens, ~800+1100 output tokens. Files: [script_ai_v4_gpt4o_base.json](../production/batch_001/yt_005/script_ai_v4_gpt4o_base.json), [script_ai_v4_gpt4o_extended.json](../production/batch_001/yt_005/script_ai_v4_gpt4o_extended.json).

### Extender đã expand block nào

Theo `writer_notes` của output:
- `b3 FILLER` 9→14 từ — thêm "Đảm bảo bạn sẽ bất ngờ." (tease)
- `b4 FILLER` 7→12 từ — thêm "Đừng bỏ lỡ nhé!" (tease)
- `b5 KITCHEN` 13→20 từ — thêm "Một món không thể thiếu khi làm món nước." (gợi ý dùng)
- `b6 KITCHEN` 11→21 từ — thêm "Một góc bếp gọn gàng với vài món tích hợp." (gợi ý dùng)
- `b8 KITCHEN` 13→18 từ — thêm "Dùng cho nhiều loại rau củ khác nhau." (gợi ý dùng)

Không động: b1 HOOK, b2 KITCHEN, b7 TRANSITION, b9 KITCHEN, b10 CTA.

### So sánh 3 phiên bản

| Tiêu chí | v3 (vòng trước, 119 từ) | **v4 extended (vòng này, 151 từ)** | script_v2 manual (~133 từ) |
|---|---|---|---|
| Word count | 119 (FAIL) | **151 (PASS)** | ~133 |
| Hook | "Hai cốc nấm xanh này vừa dễ thương, vừa tiện lắm…" | "2 cốc cutter rau xanh nhìn như cây nấm, nhìn là muốn thử ngay!" | "5 đồ bếp Trung Quốc nhìn cứ tưởng đồ chơi. Mà thử rồi là không bỏ xuống nổi đâu!" |
| CTA | "Món nào thấy hợp thì lưu lại, link mình để bio nha." | (same) | "Link Shopee mình để bio. Rẻ lắm, mua thử cả 5 món luôn nha!" |
| Bịa spec | No | No | "có 50 nghìn" (mild claim) |
| "sản phẩm" trong text | 0 | 0 | 0 |
| Coverage blocks | 10/10 | 10/10 | 10/10 (1 câu khỉ gượng) |
| TTS est @170 WPM | ~42s vs video 53s (-11s) | **~54s vs 53s** (khớp) | ~47s |
| Cần touch-up trước TTS | có (B6 thiếu) | **không** | (đã edit người) |
| Quality guard | FAIL | **PASS** | n/a |

### Trả lời thẳng

| Câu hỏi | Trả lời |
|---|---|
| Extender Pass giải quyết bài toán thiếu độ dài chưa? | **CÓ**. 114 → 151 từ trong 1 lần extend, trong window 141-156. |
| Script final đủ tốt để sang TTS/sync vòng sau chưa? | **CÓ**. Hook/CTA mềm, không banned, không bịa, coverage 10/10, TTS ước tính 54s ≈ video 53s. |
| Có nên xem Phần 1 AI Script Writer hoàn thiện tại mốc này? | **CÓ**, với điều kiện công nhận giới hạn (xem dưới). |
| Hook giữ nguyên sức hút chưa? | **CÓ** — Extender không động line block đầu HOOK. |
| CTA mềm chưa? | **CÓ** — Extender không động line block cuối CTA. |
| Có bịa claim không? | **KHÔNG**. Không gán giá/spec. Câu mở rộng đều bám visual ("vắt chanh", "rau củ", "món nước"). |
| Có block bị nhồi từ thiếu tự nhiên không? | **CÓ 3 câu mở rộng hơi generic** (xem dưới) — chấp nhận được nhưng đáng note. |

### Giới hạn còn lại của Extender Pass

Quan sát 3 câu mở rộng nghiêng nhẹ về ad copy, không banned nhưng generic:
- b3: "Đảm bảo bạn sẽ bất ngờ." — kiểu clickbait nhẹ
- b4: "Đừng bỏ lỡ nhé!" — gần "không thể bỏ qua" (banned) nhưng không khớp đúng cụm
- b5: "Một món không thể thiếu khi làm món nước." — borderline cliché, không trong banned list

Đây không phải failure — quality guard PASS, prose vẫn natural hơn ad copy TV. Nhưng có dư địa siết thêm bằng cách:
- (a) thêm các cụm "đảm bảo", "không thể thiếu", "đừng bỏ lỡ" vào SOFT_BANNED của quality guard (flag, không block),
- (b) hoặc mở rộng few-shot trong `extender-prompt.ts` thêm cặp DỞ→TỐT cho expansion sentences,
- (c) hoặc re-run extender với temp=0.2 để giảm clickbait variance.

Đề xuất: dừng tay vòng này, ghi vào roadmap. Risk siết quá sâu sẽ phá pass rate hiện tại.

### Bài học vòng v3

- **Tách concern win**: pass 1 chỉ lo prose, pass 2 chỉ lo coverage — model gpt-4o làm rất tốt mỗi việc một mình. 1 lần extend đủ để vào window 141-156 (không cần loop).
- **Constraint cứng + visual context giúp expander bám đề**: 5 block được mở rộng đều có câu bổ sung bám visual_summary, không bịa.
- **HOOK bất khả xâm phạm rule mạnh**: model tuân thủ 100% — line block đầu pass 1 và pass 2 byte-identical.
- **Temperature 0.3 cho extender** (vs 0.5 pass 1): cân bằng — đủ tự nhiên, không quá variance.
- **Cost ~2x pass 1** (≈ $0.02 cho video 53s, gpt-4o): vẫn rẻ so với rewrite hoặc human edit.

---

## 12. Cảnh báo / Anti-patterns

- ❌ Không feed video URL trực tiếp vào OpenAI — model không xem được video. Bắt buộc convert thành `scene_timeline` JSON trước.
- ❌ Không paste script AI vào TTS mà chưa review — AI có thể đưa giá/tính năng không đúng, dù prompt cấm. Luôn operator-review.
- ❌ Không phụ thuộc duy nhất vào structured output để bảo vệ chất lượng prose — schema chỉ chặn được shape, không chặn được câu sến.
- ❌ Không bypass input validation khi chỉnh `scene_input.json` thủ công — schema zod ở CLI là last line of defense.

---

## 13. Roadmap

- ✅ **DONE v3 (coverage closure)**: Extender Pass riêng — controlled expansion 1 lần là đủ vào window. Triển khai ở section 11.
- **v4 (extender polish)**: thêm cụm soft-banned cho expansion ("đảm bảo", "đừng bỏ lỡ", "không thể thiếu") để siết generic ad-copy còn sót.
- **v4 (model)**: thử `gpt-4.1` / `gpt-5` cho pass 1 khi sẵn sàng — nhiều khả năng giảm gap pass 1 → pass 2 (đỡ phải gọi extender).
- **v4 (variant)**: variant generation (cuốn hơn / tự nhiên hơn / bán mềm hơn) trong 1 lần call để A/B tự động.
- **v5 (chain)**: chained `script:generate → voice:generate` qua 1 syscall.
- **v5 (cost)**: prompt caching (OpenAI hỗ trợ) để giảm cost system prompt lặp giữa pass 1 và pass 2.
