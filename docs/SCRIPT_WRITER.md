# VFOS Script Writer — Workflow Doc

> **Bước trong pipeline VFOS**: AI Script Writer (vòng 2026-05-18).
> **Mục đích**: thay thế khâu viết voiceover thủ công bằng OpenAI structured output.
> **Trạng thái**: v0 — single-shot generation, đã chạy thật trên `yt_005`.

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

## 8. Cảnh báo / Anti-patterns

- ❌ Không feed video URL trực tiếp vào OpenAI — model không xem được video. Bắt buộc convert thành `scene_timeline` JSON trước.
- ❌ Không paste script AI vào TTS mà chưa review — AI có thể đưa giá/tính năng không đúng, dù prompt cấm. Luôn operator-review.
- ❌ Không phụ thuộc duy nhất vào structured output để bảo vệ chất lượng prose — schema chỉ chặn được shape, không chặn được câu sến.
- ❌ Không bypass input validation khi chỉnh `scene_input.json` thủ công — schema zod ở CLI là last line of defense.

---

## 9. Roadmap

- v1: variant generation (cuốn hơn / tự nhiên hơn / bán mềm hơn) trong 1 lần call
- v1: auto-tune duration — nếu word count lệch >10% thì re-prompt với hint
- v2: chained `script:generate → voice:generate` qua 1 syscall
- v2: prompt caching (OpenAI hỗ trợ) để giảm cost system prompt lặp
