# VFOS North Star (v2 — outcome-based)

> **Phiên bản**: v2 — Operator chốt 2026-06-11, thay bản v1 (content-led affiliate thuần mô tả).
> Đây là nguồn sự thật cho mọi quyết định ưu tiên, mọi đề xuất kiến trúc và mọi lệnh `/goal` của task lớn.
> North Star ghi theo **KẾT QUẢ CUỐI CÙNG Operator mong muốn**, không chỉ scope kỹ thuật hiện tại.

## 1. Core mission — kết quả cuối cùng

VFOS là hệ thống giúp Operator xây và vận hành **nhiều kênh nội dung affiliate trên Facebook/TikTok, theo nhiều ngách khác nhau**, được quản lý rõ ràng, không bị rối.

Mục tiêu cuối của VFOS **không phải** là "render video", "edit video" hay "đăng bài". Mục tiêu cuối là một pipeline có **bằng chứng thật**:

> video nguồn → video tiếng Việt đã biên tập/biến đổi → đăng thật lên Facebook/TikTok → có người xem → có click affiliate → có đơn hàng/doanh thu thật.

**Chiến lược mặc định**: Content-led affiliate — nội dung kéo view trước, sau đó ghép sản phẩm affiliate liên quan hợp lý đến nội dung, bối cảnh và tệp người xem. KHÔNG mặc định chạy theo product-first affiliate.

## 2. Business ambition & milestone ladder

Đích dài hạn: **100–200 triệu VNĐ/tháng** từ affiliate video Facebook/TikTok tại Việt Nam. Đây là mục tiêu tham vọng, phải được kiểm chứng bằng thử nghiệm thật, dữ liệu thật và tối ưu liên tục — không được xem là kết quả mặc định đảm bảo.

Các mốc trung gian theo **kết quả kinh doanh thật** (chỉ tick khi có bằng chứng thật):

| Mốc | Kết quả cần đạt | Bằng chứng yêu cầu |
|---|---|---|
| M1 | Video đầu tiên được tạo/biến đổi và đăng thật lên Facebook Page | **PASS kỹ thuật (VFOS/Claude)**: postId/permalink thật + readback verify từ Graph API. **Kiểm tra bổ sung (Operator/nền tảng)**: nick ngoài xác nhận xem được công khai — Operator tick M1 khi xác nhận xong |
| M2 | Video đầu tiên đăng thật lên TikTok (khi TikTok publish được xây) | post/video id thật trên TikTok |
| M3 | Click affiliate đầu tiên | số liệu click trên Shopee affiliate dashboard |
| M4 | Đơn hàng affiliate đầu tiên | đơn ghi nhận thật trên dashboard |
| M5 | Doanh thu affiliate đầu tiên | hoa hồng ghi nhận thật |
| M6 | Mốc doanh thu lớn dần: 10tr → 50tr → 100–200tr VNĐ/tháng | dữ liệu doanh thu thật theo tháng |

## 3. Hai luồng nội dung chính

### Luồng 1 — Ngách review sản phẩm

- Operator tự tìm hoặc add video nguồn phù hợp để VFOS edit/biến đổi thành video review tiếng Việt.
- VFOS tự động tìm/chọn/gắn link Shopee affiliate đúng sản phẩm hoặc đúng ngữ cảnh.
- Mục tiêu: video review có nhiều phương án caption, hook, voice, nhạc, QA đầy đủ và link affiliate phù hợp để kéo view, click và đơn hàng.

### Luồng 2 — Ngách nội dung/giải trí

- Operator add video nguồn nước ngoài hoặc Trung Quốc trước; VFOS phân tích nội dung gốc, nhận diện ngữ cảnh/câu chuyện/ý chính, dịch và chuyển ngữ sang tiếng Việt tự nhiên, sau đó edit/biến đổi thành nội dung phù hợp thị trường Việt Nam mà **không bị nền tảng nhận diện là kênh reup đơn thuần**.

### Chuẩn localization (áp dụng cả 2 luồng)

VFOS không chỉ dịch từng chữ, mà phải:

- hiểu nội dung gốc;
- dịch/chuyển ngữ sang tiếng Việt dễ hiểu;
- Việt hóa caption/subtitle/voice/hook;
- chỉnh lại câu chữ cho hợp người xem Việt Nam;
- giữ đúng ý chính nhưng không sao chép máy móc;
- tạo nhiều phiên bản caption, hook, voice, nhạc, Việt sub và QA.

### Chuẩn gắn affiliate theo ngữ cảnh

Sau khi nội dung đã rõ ngữ cảnh, VFOS tự động tìm sản phẩm/link affiliate liên quan để gắn vào. Mỗi nội dung có thể có:

- 1 link chủ đạo;
- 2 link phụ gợi ý dưới comment.

Mục tiêu: nội dung tự nhiên, dễ xem, không bán hàng quá lộ, nhưng vẫn gắn link affiliate đúng ngữ cảnh để kéo view, click và đơn hàng.

## 4. Mô hình quản lý hệ thống

Cấu trúc quản lý bắt buộc: **Niche → Channel → Video Job → Affiliate Link → Publish Result**.

- Một ngách có thể có nhiều kênh Facebook/TikTok khác nhau.
- Mỗi kênh/ngách phải có cấu hình riêng: nền tảng, page/account, phong cách nội dung, loại sản phẩm, quy tắc gắn link, lịch đăng, lịch sử video, trạng thái publish, dữ liệu hiệu quả.
- Phải có Command Center/dashboard để Operator quản lý nhiều ngách/nhiều kênh/nhiều workflow rõ ràng.
- KHÔNG gom tất cả chức năng vào một màn hình gây rối.

**Vị trí các kênh hiện tại trong North Star**:

- Facebook Page **"Review Nhà bạn"** (`1169116176282221`) là kênh thử nghiệm product review **đầu tiên/hiện tại**, không phải kênh duy nhất mãi mãi, không phải giới hạn cuối cùng của VFOS.
- **TikTok publish** không nằm ngoài mục tiêu cuối — là mục tiêu chính trong roadmap; giai đoạn kỹ thuật hiện tại ưu tiên Facebook Page trước.
- Nhiều page, nhiều ngách (ví dụ: Vlog Câu cá, Vlog Về xe) và nhiều kênh là mục tiêu dài hạn trong North Star, chưa thuộc scope kỹ thuật ngắn hạn.

## 5. Giai đoạn hiện tại (cập nhật 2026-06-11)

> **MILESTONE M1 — PASS kỹ thuật ĐÃ ĐẠT; public visibility = kiểm tra bổ sung của Operator (chuẩn cập nhật 2026-06-12)**
>
> Chuẩn trách nhiệm publish Facebook — **"Graph xanh = API publish"**:
> - **PASS kỹ thuật (VFOS/Claude chịu trách nhiệm)**: API publish có bằng chứng thật —
>   videoId/postId + permalink + Graph readback verify. Không fake success.
> - **Kiểm tra bổ sung (Operator/nền tảng)**: nick ngoài xem được công khai → nâng
>   `publishVisibility` lên `PUBLIC_CONFIRMED`. Đây KHÔNG phải điều kiện PASS mà Claude
>   tự chịu trách nhiệm — Facebook có thể hold distribution mà không expose qua API.
>
> Trạng thái `job_20260609_001` (địu EMOON):
> - **PASS kỹ thuật ĐÃ ĐẠT**: postId/videoId thật `1028983246151885`, permalink thật,
>   `verifiedByGraphReadback: true`, status ready, published=true, privacy EVERYONE,
>   nằm trong /video_reels /videos /published_posts /feed.
> - **Kiểm tra bổ sung**: `publishVisibility = UNCONFIRMED` — Operator dùng nick ngoài
>   mở permalink chưa thấy Reel (ghi nhận 2026-06-11). Operator theo dõi tiếp; việc này
>   không chặn các vòng kỹ thuật kế tiếp.
> - **Tick M1 (mốc kinh doanh)**: do Operator quyết khi xác nhận xem được công khai.
>   Bằng chứng Graph readback ở commit `4ddb643` vẫn hợp lệ làm bằng chứng PASS kỹ thuật.

Focus tiếp theo: Operator theo dõi public visibility reel `1028983246151885` (kiểm tra
bổ sung); pipeline kỹ thuật tiến tới M3–M5 theo lệnh Operator.

- Job `job_20260609_001`: state PUBLISHED (API publish confirmed), `publishVisibility=UNCONFIRMED`, safety locks `uploaded/published=true` (chặn double-publish). **Không publish lại.**
- Lưu ý vận hành: `FACEBOOK_PAGE_ACCESS_TOKEN` hiện là token ngắn hạn theo session — cân nhắc đổi sang long-lived token (~60 ngày) cho các lần publish sau.
- TikTok publish (M2): roadmap chính, chưa làm (repo hiện chỉ có TikTok read-only connector).

## 6. Decision filter

Mọi đề xuất tính năng, kiến trúc và ưu tiên triển khai phải trả lời được:

> "Việc này có đưa VFOS tiến gần hơn tới kết quả cuối — video Việt hóa đăng thật → view → click → đơn/doanh thu thật trên Facebook/TikTok — không?"

**Cảnh báo "Product-First Tunnel Vision"**: chặn mọi luồng tư duy chỉ chăm chăm tìm video có sản phẩm để bán mà bỏ qua tiềm năng traffic của video. Nếu không tạo ra view, không ưu tiên.

**Cảnh báo "Plumbing Success"**: không báo thành công chỉ vì xong plumbing/code/build pass. PASS chỉ khi đạt kết quả cuối có bằng chứng thật.

## 7. Nguyên tắc bắt buộc

- PASS chỉ khi đạt kết quả cuối có bằng chứng thật.
- Không fake success — lỗi phải fail rõ ràng, không bịa kết quả.
- Không báo thành công chỉ vì xong plumbing/code.
- Không publish/API thật nếu chưa có lệnh rõ từ Operator; publish luôn là cổng duyệt thủ công riêng.
- Không sửa ngoài scope.
- Mọi task lớn sau này dùng `/goal` theo **kết quả cuối cùng cần đạt**, không chỉ theo từng phần nhỏ.
- Chi tiết luật cấm nền: xem "VFOS Global No-Go Rules" trong `CLAUDE.md`.

## 8. Anti-goals

- Không biến VFOS thành nền tảng AI automation chung chung, lệch khỏi bài toán video affiliate kiếm tiền.
- Không chỉ xây công cụ nội dung rời rạc mà bỏ quên pipeline cốt lõi: tìm video → reup/edit/localize → đăng Facebook/TikTok affiliate → đo hiệu quả.
- Không ưu tiên hạ tầng, dashboard hoặc plugin chỉ vì kỹ thuật thú vị nếu chưa phục vụ trực tiếp mục tiêu video affiliate.
- Không đánh đồng "hệ thống kỹ thuật lớn" với "công cụ tạo ra kết quả kinh doanh".
- Không đánh đồng "code chạy được / build pass" với "kết quả cuối đã đạt".

## 9. /goal template chuẩn cho task lớn

```text
/goal VFOS: [KẾT QUẢ CUỐI CÙNG cần đạt — bám pipeline: video nguồn → video Việt đã biến đổi → đăng thật → view → click → đơn/doanh thu thật].

Áp dụng Sidebar-Based Guardian Workflows.
Module: [module sidebar liên quan].
Guardian: [guardian tương ứng module].

Tự kiểm repo/state trước, tự lập plan, làm từng bước nhỏ nhưng đánh giá kết quả theo goal cuối.
Không fake success. Không sửa ngoài scope. Không publish/API thật nếu chưa có lệnh rõ.
Không động .env/token/secret/runtime/media/log nếu task không yêu cầu.
PASS chỉ khi có bằng chứng thật.
Báo cáo Guardian / State / Actions / Evidence / Result / Git Status.

SELF-REVIEW BẮT BUỘC TRƯỚC KHI BÁO CÁO CUỐI.
```
