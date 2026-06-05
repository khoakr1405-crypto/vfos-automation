---
name: vfos-product-review-workflow-skill
description: Use this skill whenever working on VFOS Product Review workflows, product review lanes, product/channel/niche selection, Product Card readiness, video production flow, QA inside production, packaging, publishing, or any code/UI under /lanes/product-review. Enforces the standard 3-action Product Review workflow and prevents splitting the flow into technical modules. Prevents route-hopping between /products, /create, /raw-visual, /script, /render, /qa, /publish by consolidating actions inline.
---

# VFOS Product Review Workflow Skill

Skill này chuẩn hóa toàn bộ quy trình làm việc (workflow) và các trạng thái của lane **Review Sản phẩm** trong VFOS Studio. Skill giúp đảm bảo tính nhất quán của quy trình 3 hành động tích hợp và ngăn chặn việc phân mảnh giao diện thành nhiều module kỹ thuật rời rạc.

## When to use this skill

* Khi làm việc trên giao diện hoặc logic điều phối luồng của lane Review Sản phẩm (`/lanes/product-review`).
* Khi chỉnh sửa hoặc cấu trúc lại các bước: lựa chọn sản phẩm (Product Card), kiểm tra chủ sở hữu (Affiliate Owner ID), sản xuất video (video production), kiểm duyệt chất lượng (QA), đóng gói (packaging), và đăng tải (publishing/caption/CTA).
* Khi điều chỉnh mô hình Kênh/Ngách (Channel/Niche selection) phục vụ vận hành.

## 1. Core Workflow

Giao diện lane Review Sản phẩm bắt buộc phải sử dụng đúng cấu trúc 3 hành động (Action) lớn:

```text
Review Sản phẩm Workflow:
1. Lấy / chọn sản phẩm (Action 1)
2. Chạy sản xuất video (Action 2)
3. Đăng bài / Đóng gói (Action 3)
```

* **Workflow vận hành chính**: 3 hành động này là giao diện duy nhất để Operator hoàn thành công việc của mình từ đầu đến cuối cho mỗi video.
* **Không phân mảnh**: Các module kỹ thuật chi tiết chỉ là các bước con chạy ngầm (backend steps). Operator không phải đi qua nhiều route kỹ thuật khác nhau để sản xuất xong một video.
* **Tập trung tại Command Center**: Mọi tương tác cốt lõi của Operator phải được hiển thị và điều hành inline ngay trên màn hình `/lanes/product-review`.

## 2. Action 1 — Lấy / chọn sản phẩm

Hành động 1 chịu trách nhiệm thiết lập đầu vào thương mại (affiliate entry point) cho luồng sản xuất.

* **Các thành phần chính**:
  - Thẻ thông tin sản phẩm hiện tại (Current Product Card).
  - Danh sách chọn sản phẩm thu gọn (Compact registry picker) hiển thị tối đa 10 verified items từ registry.
  - Thao tác promote no-click (chuyển sản phẩm thành card hiện tại mà không cần mở trình duyệt).
  - Nút "Lấy link Shopee mới" gọi CDP trích xuất link live.
  - Quy trình kiểm tra chủ sở hữu (Validate owner).
  - Trạng thái sẵn sàng của Product Card (Product Card readiness).
  - Lựa chọn Kênh (Channel selection) và lựa chọn Ngách (Niche selection).
* **Quy tắc vận hành**:
  - **Affiliate Owner ID bắt buộc**: ID chủ sở hữu hiện tại phải khớp chính xác với `an_17376660568`. Nếu Product Card không hợp lệ hoặc sai ID chủ sở hữu, **khóa hoàn toàn Action 2**.
  - **Inline Shopee CDP**: Nút "Lấy link Shopee mới" là tính năng chính và phải nằm trực tiếp trong Action 1, không đẩy ra ngoài route phụ. Phải có confirm phrase và xử lý trạng thái SUSPENDED khi gặp CAPTCHA/Login.
  - **No-click promotion**: Việc chọn link từ registry và promote phải xảy ra hoàn toàn inline.

## 3. Channel and Niche Model

Mỗi kênh Review Sản phẩm phục vụ vận hành được phân rã thành tối đa 3 ngách/chủ đề con:

```text
Lane: Review Sản phẩm
└── Channel (Kênh)
    ├── Niche 1 (Ngách 1)
    ├── Niche 2 (Ngách 2)
    └── Niche 3 (Ngách 3)
```

* **Ví dụ phân bố**:
  - *Kênh Mẹ & Bé*: Đồ sơ sinh, Đồ mẹ bỉm, Đồ chơi/giáo dục sớm.
  - *Kênh Đồ xe*: Phụ kiện xe máy, Đồ chăm sóc xe, Đồ tiện ích đi đường.
  - *Kênh Gia dụng*: Đồ bếp, Đồ dọn dẹp, Đồ tiện ích gia đình.
* **Quy tắc thiết kế**:
  - Cấu trúc 3 Action giữ nguyên trên mọi kênh. Kênh/Ngách chỉ là cấu hình vận hành, không được tạo app UI riêng biệt cho từng kênh.
  - Mỗi bản ghi Job cần mang đầy đủ thông tin: `lane`, `channel`, `niche`, `product`, `platform`, `content tone`, `CTA style`.
  - Thông tin Kênh/Ngách được sử dụng để điều phối sản phẩm, sinh script, chọn giọng voice-over, chọn nhạc nền BGM, viết caption và tạo link CTA phù hợp.

## 4. Action 2 — Chạy sản xuất video

Hành động 2 đảm nhận toàn bộ khâu xử lý kỹ thuật và mỹ thuật để tạo ra video thành phẩm.

* **Các thành phần chính**:
  - Dán và lưu nguồn (Source URL).
  - Khởi tạo bản nháp Job (Job draft).
  - Làm sạch nguồn / Tải video (Clean source / source intake).
  - Phê duyệt độ sạch của nguồn từ Operator (Cleanliness approval gate) nếu cần.
  - Tiền xử lý hình ảnh (Raw Visual) nếu cần.
  - Sinh kịch bản (Script).
  - Thu âm giọng nói AI (Voice).
  - Trộn nhạc nền (BGM).
  - Biên tập và xuất video (Render).
  - Chèn phụ đề (Caption).
  - Kiểm duyệt chất lượng (QA / Kiểm tra).
  - Phim xem trước (Preview video).
* **Quy tắc quan trọng**:
  - **QA / Kiểm duyệt thuộc Action 2**: Khâu kiểm duyệt chất lượng QA phải nằm tích hợp bên trong Action 2. Tuyệt đối không tách QA thành Action độc lập thứ 4.
  - **Điều phối ngầm (Orchestration)**: Bấm "Chạy sản xuất video" → hệ thống tự chạy ngầm các bước con và hiển thị tiến trình, gate duyệt, thông báo lỗi kỹ thuật ngay trong panel Action 2.

## 5. Action 3 — Đăng bài / Đóng gói

Hành động 3 quản lý khâu xuất bản và xuất xưởng video thành phẩm.

* **Các thành phần chính**:
  - Xem lại video đã qua kiểm duyệt QA.
  - Đóng gói tài nguyên (Package video/metadata).
  - Chuẩn bị nội dung đăng (Caption).
  - Liên kết affiliate (Affiliate link) và lời kêu gọi hành động (CTA).
  - Hình thu nhỏ (Thumbnail) nếu có.
  - Hướng dẫn đăng thủ công (Manual publish guidance).
  - Trạng thái sẵn sàng của từng nền tảng (Platform readiness).
  - Tùy chọn đăng bài tự động có kiểm soát (Gated live publish) nếu được cấu hình.
* **Quy tắc vận hành**:
  - **Không tự động đăng**: Tuyệt đối không đăng bài tự động khi chưa có sự phê duyệt rõ ràng từ Operator.
  - **Hiển thị chính thức**: Đóng gói & đăng bài phải hiển thị như một Action Panel chính, không giấu dưới nhãn debug.
  - **Độc lập nền tảng**: Trạng thái sẵn sàng (READY) của một nền tảng không đồng nghĩa với các nền tảng khác cũng sẵn sàng.

## 6. Product Review Job State

Dưới đây là các trạng thái của Job ở mức workflow để Claude tham chiếu khi tư duy logic:

* `PRODUCT_READY`: Đã chốt sản phẩm hợp lệ trong Action 1.
* `SOURCE_DRAFT_READY`: Đã lưu liên kết nguồn thô.
* `JOB_DRAFT_READY`: Bản nháp Job đã được khởi tạo thành công.
* `WAITING_FOR_SOURCE_VIDEO`: Đang tải video gốc.
* `SOURCE_READY`: Video gốc đã tải xong.
* `WAITING_OPERATOR_SOURCE_APPROVAL`: Chờ Operator duyệt nguồn sạch (không dính watermark/logo).
* `PRODUCTION_RUNNING`: Tiến trình sinh script/voice/render đang chạy.
* `RENDER_READY`: Video đã render xong.
* `QA_PENDING`: Đang chờ kiểm duyệt chất lượng (phát hiện lỗi timing/voice).
* `QA_PASS`: Đã vượt qua khâu QA kỹ thuật.
* `APPROVED`: Video đã được Operator bấm duyệt thủ công.
* `PACKAGED`: Tài nguyên đã đóng gói thành công.
* `READY_TO_PUBLISH`: Sẵn sàng để đăng bài.
* `PUBLISHED` / `MANUAL_PUBLISHED`: Đã đăng tải thành công.
* `FAILED`: Tiến trình con bị thất bại.
* `SUSPENDED`: Tiến trình bị tạm dừng (chờ Operator xử lý captcha hoặc lỗi).

## 7. Old Technical Route Mapping

Khi cần hiển thị chi tiết hoặc debug cho lập trình viên, các route kỹ thuật cũ được ánh xạ như sau:
* `/products` ──> Xem chi tiết & Debug Action 1 (Sản phẩm & Link).
* `/create` ──> Cấu hình & Debug Action 2 (Tải video & Job draft).
* `/raw-visual` ──> Debug chi tiết xử lý hình ảnh Action 2.
* `/script` ──> Xem chi tiết Script / Voice / BGM của Action 2.
* `/render` ──> Xem tiến độ Render / Caption của Action 2.
* `/qa` ──> Trực quan hóa kết quả kiểm duyệt QA của Action 2.
* `/publish` ──> Cấu hình & Debug đóng gói/xuất bản Action 3.

**Quy tắc**: Không đưa lại các route kỹ thuật này lên sidebar của Operator. Nếu truy cập từ lane context, giao diện trang kỹ thuật phải có nút quay lại để quay về màn hình Command Center chính.

## 8. Anti-patterns (Lỗi cần tránh)

* ❌ Tách QA thành một Action Panel lớn độc lập trên Command Center.
* ❌ Bắt Operator phải chuyển trang liên tục (`/products` -> `/create` -> `/script` -> `/render` -> `/qa`) để làm việc.
* ❌ Đưa các route kỹ thuật chi tiết lên sidebar chính làm thanh menu.
* ❌ Bố trí giao diện Review Sản phẩm thành 6 card kỹ thuật ngang hàng.
* ❌ Giấu chức năng "Lấy link Shopee mới" ra khỏi Action 1 hoặc giấu "Đóng gói / Đăng bài" khỏi Action 3.
* ❌ Nhân bản giao diện UI thành các ứng dụng riêng biệt cho từng kênh/ngách.
* ❌ Thiết kế Action 2 hoặc Action 3 trên Command Center chỉ là một link trỏ sang trang khác.

## 9. Correct UI Behavior (Thiết kế tương tác đúng)

* Màn hình `/lanes/product-review` là giao diện làm việc chính duy nhất của Operator.
* Trạng thái và tiến trình thật của Job phải được phản ánh trực quan trên 3 Action Panels.
* Nút hành động phải thực hiện inline hoặc hiển thị confirm/progress inline.
* Nếu tính năng chưa được nối dây (unwired), nút bấm có thể disabled hoặc hiển thị trạng thái "coming next" ngay trong panel đó.
* Trình diễn lỗi hoặc trạng thái tạm ngưng (SUSPENDED/FAIL) phải ghi chi tiết stage và lý do, tránh dùng thông báo lỗi chung chung.
* Sau khi trích xuất Shopee link thành công, phải hiển thị kết quả rõ ràng tại vùng phản hồi của Action 1, tránh gây nhầm lẫn với các ô nhập liệu khác.

## 10. Safety

Mọi tính năng an toàn phải được cài đặt inline trong lòng Command Center:
* Yêu cầu nhập phrase xác nhận trước khi chạy CDP.
* Ràng buộc local-only và giới hạn số lượng tác vụ (max action limits).
* Kiểm tra chủ sở hữu sản phẩm (owner validation) và duyệt nguồn sạch (cleanliness approval gate).
* Trả về kết quả sạch (sanitized response) không lộ bí mật hệ thống.
* Không sử dụng an toàn như một lý do để đẩy tính năng chính ra khỏi giao diện Command Center tích hợp.
