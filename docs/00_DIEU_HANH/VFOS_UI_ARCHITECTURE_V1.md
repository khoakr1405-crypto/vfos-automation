# VFOS UI ARCHITECTURE V1 — Spec chuẩn (Operator duyệt 2026-06-12)

> **Nguồn gốc**: Audit UI toàn diện 2026-06-12 + North Star v2 (`docs/VFOS_NORTH_STAR.md`).
> **Trạng thái**: Operator đã duyệt hướng audit + kiến trúc. Implement theo phase, không phá Action 1–2–3.
> **PASS UI** = Operator chạy nhiều job liên tiếp trơn tru, không kẹt state, không nhầm job cũ/mới,
> luôn có đường quay về trạng thái bắt đầu, evidence/history đầy đủ. Không chỉ là "đẹp".

## 1. Kết luận audit (2026-06-12, HEAD `781cc42`)

### Lỗi chính phải sửa
| # | Vấn đề | Phase sửa |
|---|---|---|
| A1 | Tổng quan ~70% component mock (KPI, attention, cluster, weekly, pipeline, readiness) trộn cạnh 2 queue thật | A |
| A2 | Header Tổng quan ghi "Product-first" — North Star v2 chốt content-led | A |
| A3 | CTA "Tạo nội dung" trỏ `/create` (route kỹ thuật deprecated) thay vì lane | A |
| A4 | 2 bề mặt publish song song: `/publish` (mock) vs lane Action 3 (thật) | A (gỡ khỏi nav) |
| A5 | Không có đường "Bắt đầu video mới" sau khi job PUBLISHED — vòng lặp đứt ở Reset-to-ready | B |
| A6 | Không có màn History/Evidence cho job đã hoàn thành | C |
| A7 | Không có cấu trúc Niche → Channel; page hardcode qua env | D |
| A8 | Outcome sau publish (view/click/đơn/doanh thu — M3–M6) không có chỗ nhập/xem thật | E |
| A9 | Nút debug đứng ngang nút vận hành trong lane | B/C (dọn dần) |
| A10 | 2 lane stub vlog chiếm sidebar, mơ hồ | A (gộp thành lane 2 roadmap) |

### Giữ nguyên (xương sống đúng)
- Lane Review Sản phẩm: 3 Action + gate cứng server-side + binding job-theo-Product-Card + per-job state reset.
- Dark dashboard style, GateHint giải thích nút khóa, confirm phrase, publish chỉ chạy khi Operator bấm.
- Chuẩn publish: **Graph xanh = API publish** (PASS kỹ thuật); public visibility = kiểm tra bổ sung Operator.

## 2. Sitemap chuẩn V1

```
TRUNG TÂM ĐIỀU HÀNH
 1. Tổng quan            — CHỈ data thật: job queue, product queue, CTA tiếp tục/video mới
LANE NỘI DUNG (mỗi lane = vòng lặp 9 bước)
 2. Review Sản phẩm      — lane đang chạy (Page "Review Nhà bạn" là kênh thử nghiệm đầu tiên)
 3. Nội dung / Giải trí  — LANE 2 North Star; Vlog Câu cá + Vlog Về xe là NGÁCH bên trong (roadmap)
CẤU TRÚC
 4. Ngách & Kênh         — Niche → Channel config: platform, page/account, style, loại sản phẩm,
                            quy tắc gắn link, lịch sử job, trạng thái publish (Phase D)
KẾT QUẢ / TƯƠNG TÁC
 5. Hiệu suất / Analytics — M3–M6 thật per job (Phase E: manual import trước, API sau)
 6. Bình luận & Mắt thần  — gắn comment đúng jobId
(+ Lịch sử & Evidence — màn mới Phase C, vào từ Tổng quan/lane)
```

Gỡ khỏi nav (URL vẫn truy cập trực tiếp được, không xóa file): `/publish`, `/schedule`,
`/lanes/fishing-vlog`, `/lanes/car-vlog`. `/publish`+`/schedule` chỉ quay lại nav khi nối data thật.

## 3. Vòng lặp vận hành bắt buộc (mỗi lane)

```
① Start → ② Select (ngách/kênh/sản phẩm/nguồn) → ③ Produce (edit/voice/caption/QA)
→ ④ Review (Operator duyệt preview + link) → ⑤ Package → ⑥ Publish/Dry-run (gate cứng)
→ ⑦ Evidence (jobId, product, source, manifest, QA, affiliate, publish result, permalink, metrics)
→ ⑧ Complete → ⑨ Reset-to-ready ("Bắt đầu video mới" — màn hình sạch, job cũ vào history)
```

Nguyên tắc: không xóa data job hoàn thành; job xong nằm trong history; màn hình mới sạch
(không carry card/publishResult/permalink/error/loading của job cũ); trạng thái "Thành công"
không được làm kẹt workflow; mỗi màn hình luôn trả lời: đang ở bước nào / bước tiếp theo /
nút nào bấm được / nút nào khóa vì sao / xong thì đi đâu.

## 4. Bộ nút chuẩn

| Chức năng | Vị trí | Trạng thái |
|---|---|---|
| Chọn ngách/kênh | Channel selector đầu lane | Phase D |
| Chọn/lấy sản phẩm Shopee | Action 1 | ✅ có |
| Thêm nguồn / phân tích nguồn / sản xuất / QA / duyệt preview | Action 2 | ✅ có |
| Package / dry-run / publish thật | Action 3 (gate cứng) | ✅ có |
| Bắt đầu video mới | Completion panel + Tổng quan | Phase B |
| Xem history/evidence | Màn Lịch sử & Evidence | Phase C |
| Theo dõi view/click/đơn/doanh thu | Màn Hiệu suất + nhập số liệu per job | Phase E |

## 5. Phases (đã duyệt)

| Phase | Nội dung | Trạng thái |
|---|---|---|
| A | Tổng quan chỉ data thật + sửa wording content-led + CTA đúng lane + sidebar mới (gộp lane 2, gỡ publish/schedule) | 2026-06-12 round này |
| B | Completion panel + "Bắt đầu video mới" + stepper vòng lặp trong lane Review Sản phẩm | 2026-06-12 round này |
| C | Màn "Lịch sử & Evidence" read-only (registry + manifest + publish status, sanitized) | Chờ |
| D | "Ngách & Kênh" v0 — `config/channels.json` (không secret; token vẫn .env); lane đọc channel config | Chờ |
| E | Hiệu suất M3–M6 v0 — Operator manual import view/click/đơn từ Shopee/Meta dashboard, gắn jobId | Chờ |
| F | Lane 2 "Nội dung / Giải trí" thật — tái dùng khung 3 Action + niche selector (Câu cá, Vlog xe) | Sau A–E mượt |

## 6. Ràng buộc an toàn (mọi phase)

Không fake success · không mock lẫn data thật · không Math.random ID · không floating state
(latest/jobs[0]) · publish luôn là cổng duyệt thủ công · không đụng .env/token/secret/runtime/media
· UI guard chưa đủ — API phải tự chặn (chuẩn Sidebar Guardian).
