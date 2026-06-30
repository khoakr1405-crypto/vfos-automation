---
name: vfos-evidence-gated-research
description: Use this skill whenever VFOS work makes a claim that needs a source — external URLs/videos/products/metrics/citations, or internal repo files/paths/logs/artifacts. Forbids fabricated evidence, enforces verification_status tagging, and blocks unverified data from going downstream.
---

# VFOS Evidence-Gated Research Skill

> **Nguyên tắc gốc**: Không có bằng chứng đủ mạnh → không được trình bày như sự thật. Thà thiếu còn hơn sai.

## Purpose
Ngăn Agent đưa dữ liệu bịa / suy đoán / chưa xác minh vào bất kỳ quyết định nào của VFOS. Bài học: Market Validation 001 từng suýt hỏng vì 10 URL video bị hallucinate hoàn toàn (kèm views + transcript bịa) — skill này tồn tại để lỗi đó không lặp lại.

## When to use (tự kích hoạt)
Bất kỳ task nào có claim cần nguồn:
- **External evidence**: tìm URL video (YouTube/TikTok/Douyin), GitHub repo, tool/API/vendor, sản phẩm/nguồn hàng/affiliate link, trend/competitor/case study, metrics (views/likes/shares/CTR), trích transcript/caption/metadata, tạo candidate batch cho Market Validation.
- **Internal evidence**: claim về repo file/path, log, manifest, artifact, state doc, commit/branch, kết quả test.

## Phân loại bằng chứng (BẮT BUỘC tách rõ)
| Loại | Claim ví dụ | Bằng chứng PHẢI có |
|---|---|---|
| **External** | "video có thật / repo X tồn tại / vendor có API Y" | nguồn NGOÀI mở & verify được (URL mở qua WebFetch, trang công khai) — KHÔNG suy từ trí nhớ |
| **Internal** | "file X tồn tại / log ghi Y / test pass" | file/path/log/artifact CỤ THỂ trong repo (đường dẫn + dòng/commit) |

→ Claim ngoài phải có **source ngoài**; claim nội bộ phải có **file/path/log/artifact** rõ. Không dùng "trí nhớ" thay cho cả hai.

## verification_status — 4 cấp (gắn cho mỗi item)
| Status | Nghĩa | Dùng downstream? |
|---|---|---|
| `VERIFIED` | đã mở/xác minh nguồn cụ thể, bằng chứng trực tiếp | ✅ |
| `PARTIALLY_VERIFIED` | bằng chứng gián tiếp, verify một phần | ⚠️ kèm cảnh báo |
| `UNVERIFIED` | chưa xác minh, chỉ là ứng viên | ❌ trừ khi gắn nhãn rõ |
| `INVALID` | link chết / sai / mâu thuẫn | ❌ tuyệt đối |

Mỗi item quan trọng kèm: `verification_status` + `verification_note` (cách đã kiểm) + `evidence_source` (URL hoặc đường dẫn).

## Must do
- Tìm & verify nguồn thật TRƯỚC khi claim. Không lấy được → ghi `unknown` / `not_found` / `needs_manual_verification`, nói thẳng "chưa xác minh được trong môi trường hiện tại".
- Thiếu thì báo thẳng — 3 item `VERIFIED` > 10 item đẹp mà không kiểm được.
- Môi trường không verify được (vd link TikTok/Douyin) → đề xuất Operator tự thu thập, không tự bịa.

## Must not do
- ❌ Bịa URL / video ID / slug, views/likes/CTR, tên kênh/creator, sản phẩm + giá, số liệu thị trường, trích dẫn.
- ❌ Gọi nội dung suy đoán là `transcript` (phải gọi `content_summary`); metrics không thấy trực tiếp → `unknown`.
- ❌ Force-pass item `UNVERIFIED`/`INVALID`; bàn giao downstream (VOE / Market Validation / Revenue Experiment) khi còn item chưa verify mà không gắn nhãn rõ.
- ❌ (No-Go nền VFOS) auto-publish · thay đổi Product Review workflow 5 bước · sửa entertainment pipeline/render/BGM/blur ngoài scope · đụng runtime/media/secret.

## Anti-patterns (tránh tuyệt đối)
- ❌ "Đã tìm thấy 10 video thật" nhưng link chưa từng mở.
- ❌ Dựng video ID cho file nhìn đầy đủ.
- ❌ Tự viết transcript cho video chưa xem.
- ❌ Ghi engagement number không nguồn.
- ❌ Đặt `data_status: READY_FOR_VOE` cho item chưa verify URL.

## Output / report format
1. **Research Objective** — nhiệm vụ cụ thể.
2. **Evidence Standard Used** — tiêu chuẩn xác minh đã áp.
3. **Results Table** — Item · `verification_status` · `verification_note` · missing fields.
4. **What Is Verified**.
5. **What Is Unverified / Invalid**.
6. **Can Use Downstream?** — `YES` / `NO` / `YES WITH WARNINGS`.
7. **Safe Next Step**.

## Pre-handoff checklist (tự soi trước khi báo done)
- [ ] Có item nào là dữ liệu tự dựng không?
- [ ] Có URL/nguồn ngoài nào chưa mở mà trình bày như thật?
- [ ] Có claim nội bộ nào thiếu file/path/log/artifact cụ thể?
- [ ] Có chỉ số nào là ước đoán bị viết như fact?
- [ ] Có transcript nào không phải transcript thật?
- [ ] Có batch downstream nào bị hiểu nhầm "ready" dù chưa đủ bằng chứng?

**Bất kỳ câu trả lời "CÓ" → phải sửa trước khi bàn giao.**
