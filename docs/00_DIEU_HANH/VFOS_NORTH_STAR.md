# VFOS NORTH STAR

> Đọc trước mọi task code VFOS. Chuẩn vận hành; bổ trợ cho `docs/VFOS_NORTH_STAR.md` (chiến lược dài).

## 0. Mục tiêu

Nâng VFOS thành hệ thống **UI/workflow** để Operator sản xuất **nhiều video affiliate liên tiếp, nhiều job/ngày**, qua nhiều **lane/ngách/kênh/page**, có **evidence thật, tracking thật, publish safety, comment operator, số liệu thật** — **không phụ thuộc Claude chạy CLI từng video**. Đích: tiến tới nhiều video/ngày ra doanh thu affiliate trên Facebook/TikTok VN.

## 1. Khung vận hành

- **Sidebar-Based Guardian Workflows.**
- Module: **VFOS Operating System / Multi-Agent Architecture / UI Workflow.**
- Guardian bắt buộc: **Workflow Integrity Guardian + Product Review Guardian + Publish Safety Guardian.**
- **Fable 5** chỉ cho task lớn: được chia sub-agent song song (audit/thiết kế/implement/review) **nhưng phải có orchestrator tổng hợp cuối**. Không dùng Fable 5 cho task nhỏ lẻ. **Không chạy từng video thay Operator.**

## 2. 12 outcome dài hạn

1. **Product Review UI nhiều video liên tiếp** — Operator tạo nhiều job/video lặp lại qua UI Lane, quản lý nhiều page/kênh, không phụ thuộc CLI từng video.
2. **Multi-video batch/queue** — xử lý nhiều video/ngày: pause/resume; lỗi một job không làm hỏng batch; mỗi job có trạng thái/evidence riêng.
3. **Niche → Channel → Job** — chuẩn hóa nhiều ngách, nhiều page/kênh, nhiều nền tảng; "Review Nhà bạn" chỉ là channel đầu tiên.
4. **Content/Entertainment Affiliate Lane** — phân tích video nước ngoài/Trung Quốc, Việt hóa caption/sub/voice/hook, gắn link affiliate theo ngữ cảnh tự nhiên.
5. **Evidence & Tracking M3–M6** — view/click/đơn/doanh thu theo job/channel/niche cho Facebook và TikTok; bắt đầu bằng manual import v0 nếu chưa có API thật.
6. **Publish Safety & Platform Readiness** — dry-run, launch-check, Graph xanh = API publish, double-publish lock, approval gate, token health, publish evidence.
7. **Anti-fake-success hardening** — audit toàn repo loại fake success, mock lẫn thật, `Math.random` ID, fixture bị hiểu nhầm là real, UI xanh nhưng backend chưa chạy.
8. **Operator Command Center tổng thể** — tổng quan thật: job đang chạy / chờ duyệt / lỗi / đã publish, next action, channel/niche status, batch queue.
9. **Source Intake Lab** — intake URL Douyin/TikTok, file local, video inbox; clean source check, watermark check, source-job binding, operator approval.
10. **Quality system script/voice/BGM** — nhiều hook, nhiều caption, voice style, BGM theo mood; QA chống overclaim, chống sai sản phẩm, chống thoại lặp.
11. **Comment Operator (mắt thần bình luận)** — theo dõi comment theo video/job/channel, hiện ngữ cảnh sản phẩm/link/video, gợi ý trả lời, Operator duyệt trước khi rep; kéo tương tác, xử lý câu hỏi sản phẩm/link để tăng click/đơn.
12. **Real-data UI** — mọi số liệu là data thật hoặc gắn nhãn rõ nguồn; không trộn mock/fixture/demo với thật; chưa có dữ liệu thì hiện "chưa có dữ liệu thật / chờ import / roadmap", không bịa KPI/view/click/đơn/doanh thu.

## 3. Nguyên tắc bắt buộc (no-go)

- Không để Claude/Fable 5 làm video thay Operator từng cái; mục tiêu là **UI/workflow** để Operator sản xuất nhiều video.
- Không publish / API thật nếu chưa có lệnh rõ.
- Không đụng `.env`/token/secret/runtime/media.
- Không fake success. Không mock lẫn data thật. Không sửa lan man ngoài scope.
- Core Action 1 đang chạy tốt thì **không đổi** nếu không có bằng chứng cần đổi.
- CAPTCHA/OTP/login do Operator xử lý; hệ thống chỉ **WAITING_FOR_OPERATOR** và tự resume an toàn.
- **PASS phải có evidence thật**, không báo PASS chỉ vì xong code/plumbing.

## 4. Cách làm (round audit lớn)

1. Tự đọc North Star / state / docs / workflow hiện tại.
2. Audit toàn hệ thống theo 12 outcome.
3. Được tạo/dùng Dynamic Workflows, chia sub-agent song song khi cần: **UI/UX · Workflow/State · Product Review · Channel/Niche · Publish Safety · Evidence/Tracking · Source Intake · Quality QA · Comment Operator · Anti-fake-success Review.**
4. Mỗi sub-agent nhiệm vụ rõ, **không trùng nhau, không sửa lan man**.
5. Phải có **orchestrator tổng hợp cuối**: gom kết quả, phát hiện mâu thuẫn, chọn hướng an toàn nhất.
6. Đề xuất roadmap theo phase; chọn phase **giá trị cao nhất + rủi ro thấp nhất** làm trước.
7. Không cố làm hết 12 outcome trong một lần nếu rủi ro cao. Phase nào cần Operator quyết → **dừng hỏi trước**.

## 5. PASS vòng audit khi

- Đã audit 12 outcome + xác định hiện trạng từng cái: **READY / PARTIAL / MISSING**.
- Đã đề xuất roadmap theo phase + đã chọn phase value-cao/risk-thấp làm trước.
- Chưa implement lớn nếu chưa có Operator duyệt.
- Không fake success, không đụng secret/runtime/publish.

## 6. Báo cáo cuối phải có

**Guardian · State · Multi-Agent Plan · 12-Outcome Audit · Phase Roadmap · Phase Implementation · Evidence · Missing Gaps · Next Goal · Git Status.**

**SELF-REVIEW BẮT BUỘC TRƯỚC KHI BÁO CÁO CUỐI.**
