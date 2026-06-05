---
name: vfos-shopee-affiliate-skill
description: Use this skill whenever working on VFOS Shopee Affiliate integration, Product Card, Shopee registry, affiliate owner validation, CDP link extraction, “Lấy link Shopee mới”, productImageUrl capture, Shopee modal link reading, or any API/CLI/UI that touches Shopee affiliate links. Enforces owner ID validation (an_17376660568), single-link CDP extraction (target-count=1, max-clicks=5), SUSPENDED handling for CAPTCHA/login/OTP, and sanitized responses with no credential leakage (cookie, token, session).
---

# VFOS Shopee Affiliate Skill

Skill này quy định chuẩn và kiểm soát luồng thu nạp liên kết Shopee Affiliate trong VFOS Studio. Skill hướng dẫn Claude triển khai các cơ chế trích xuất qua CDP trình duyệt một cách an toàn, hợp lệ và bảo mật.

## When to use this skill

* Khi sửa đổi hoặc mở rộng bất kỳ đoạn mã nguồn, API endpoint hay giao diện người dùng nào tương tác với liên kết Shopee Affiliate (gói `packages/shopee` hoặc các route API trong `apps/studio/src/app/api/studio/commerce/*`).
* Khi phát triển các tính năng trích xuất liên kết bằng Playwright/CDP (Cốc Cốc browser automation).
* Khi kiểm duyệt thông tin sản phẩm (Product Card), Registry sản phẩm (`shopee_link_registry.json`) và thông tin định danh chủ sở hữu (Affiliate Owner ID).

## 1. Core Rule

> **Shopee Affiliate link intake is a core workflow inside VFOS Product Review Command Center Action 1.**

* **Vị trí tích hợp**: Chức năng "Lấy link Shopee mới" là một trong những tương tác cốt lõi thuộc Action 1 của Command Center `/lanes/product-review`.
* **Không cô lập**: Không được giấu tính năng trích xuất link mới trong các route debug khuất hoặc chỉ chạy qua dòng lệnh CLI. Operator phải chạy được từ UI Command Center.
* **Tự động kích hoạt**: Khi Operator bấm nút trích xuất trên giao diện và hoàn thành cụm từ xác nhận, hệ thống phải tự kích hoạt CDP chạy ngầm (headless/headful tùy cấu hình) để lấy liên kết thật, không được chỉ giả lập (stub/mock) trên UI.

## 2. Mandatory Owner

* **ID chủ sở hữu bắt buộc**: Mọi liên kết affiliate được sử dụng phải thuộc về ID chủ sở hữu duy nhất sau:
  ```text
  an_17376660568
  ```
* **Quy trình kiểm tra (Owner validation)**:
  - Hệ thống phải kiểm tra xem affiliate link có thuộc quyền sở hữu của ID bắt buộc trên hay không (kiểm tra `utm_source` hoặc cấu trúc tracking URL của Shopee).
  - Nếu ID chủ sở hữu không khớp (`ownerVerified === false`), giao diện phải hiển thị cảnh báo đỏ và **khóa hoàn toàn Action 2** (không cho phép chạy sản xuất video cho sản phẩm này).
  - Registry Picker và Current Product Card phải hiển thị rõ trạng thái xác thực chủ sở hữu (`verified` hoặc `mismatch`).

## 3. Existing Proven CLI Flow

Hệ thống đã có kịch bản chạy CLI tự động hóa trích xuất qua CDP trình duyệt Cốc Cốc hoạt động ổn định:
```bash
pnpm shopee:extract-links-cdp --target-count=1 --max-clicks=5
```
Kịch bản này thực hiện:
1. Kết nối với trình duyệt Cốc Cốc (qua cổng debug 9222).
2. Điều hướng đến trang Shopee Affiliate Product Offer.
3. Click vào nút "Lấy link" của sản phẩm mục tiêu.
4. Trích xuất short link (`https://s.shopee.vn/...`) từ modal Shopee.
5. Xác thực chủ sở hữu ID `an_17376660568` của link affiliate dài đã giải mã.
6. Lưu thông tin hợp lệ vào Registry.

> **Lưu ý cho Claude**: Đây là tính năng đã chạy được bằng CLI. Khi thiết kế API/UI, ta chỉ cần gọi script CLI này một cách an toàn và trả về kết quả đúng cấu trúc, không cần phát minh lại luồng trích xuất mới.

## 4. UI Command Center Behavior

Trong Panel 1 của giao diện `/lanes/product-review`, Operator tương tác qua các thành phần:
* **Current Product Card**: Thẻ thông tin sản phẩm đang được chọn.
* **Compact Registry Picker**: Danh sách 10 sản phẩmverified gần nhất từ registry.
* **Dùng sản phẩm này**: Nút chọn sản phẩm inline.
* **Lấy link Shopee mới**: Nút kích hoạt luồng CDP.

### Quy trình tương tác:
1. Operator bấm "Lấy link Shopee mới".
2. Hệ thống hiển thị hộp xác nhận inline yêu cầu nhập chính xác cụm từ:
   ```text
   GET 1 SHOPEE LINK
   ```
   *Lưu ý: Hộp nhập phải ghi rõ đây là ô xác nhận hành động, tránh để Operator nhầm lẫn là ô dán link.*
3. Operator nhập xong và xác nhận → Tiến trình chạy ngầm.
4. Khi chạy xong, kết quả hiển thị ở khu vực riêng: `Kết quả lấy link mới` (New extraction result block).

### Các trạng thái kết quả hiển thị trên UI:
* **SUCCESS**: Hiển thị rõ các thông tin `shortLink`, `productName`, `shopid`/`itemid`, `ownerVerified`, `expectedOwner`, trạng thái ghi registry (`inserted`/`duplicate`), và ảnh sản phẩm `productImageCaptured`. Hiển thị nút "Dùng sản phẩm này" để nạp vào Product Card hiện tại.
* **SUSPENDED**: Hiển thị lý do tạm dừng rõ ràng (ví dụ: *"Shopee yêu cầu xác thực"* hoặc *"Cần giải CAPTCHA"*). Hướng dẫn Operator: *"Vui lòng mở trình duyệt Cốc Cốc, hoàn thành giải CAPTCHA/Login/OTP, sau đó bấm chạy lại tại đây."*
* **FAIL**: Hiển thị chi tiết lỗi đã được lọc sạch nhạy cảm, chỉ rõ bước lỗi (`stage`), mã lỗi (`reasonCode`) và nội dung thông báo. Không được hiển thị thông báo lỗi chung chung kiểu *"Trích xuất thất bại"*.

## 5. Live Extraction Rules

Khi gọi tiến trình trích xuất tự động qua API, hệ thống phải tuân thủ nghiêm ngặt các giới hạn:
* **Tham số cứng**: Luôn truyền `--target-count=1` và `--max-clicks=5` (hoặc tương đương ở code API). Tuyệt đối không nhận tham số đếm link từ client.
* **Giới hạn hành vi**:
  - Không lấy quá 1 link mỗi lượt bấm.
  - Trình tự click phải bám sát nút "Lấy link" của sản phẩm, không click lung tung.
  - Cấm click vào các nút cấu hình nhạy cảm khác trên Shopee Affiliate (như Payment, Security, Profile, Logout).
  - Không bao giờ tự động nhập password/OTP của Operator.
  - Không bao giờ tìm cách bypass CAPTCHA tự động bằng các thư viện bên thứ ba.
  - Sau khi Operator đã nhập đúng confirm phrase và bấm chạy, hệ thống thực thi ngay lập tức, không hỏi xác nhận vòng vo thêm một lần nào nữa.

## 6. CAPTCHA / Login / OTP Handling

> **CAPTCHA/login/OTP is a SUSPENDED state, not a reason to abandon the workflow.**

* **Cách xử lý**: Khi kịch bản automation gặp trang đăng nhập, hình ảnh CAPTCHA, hoặc yêu cầu mã OTP, hệ thống phải dừng tiến trình và trả về trạng thái `SUSPENDED` kèm lý do chi tiết.
* **Nghiêm cấm**:
  - Không cố gắng giải CAPTCHA tự động.
  - Không tự điền credentials/mã OTP để tránh khóa tài khoản của Operator.
  - Không tự động retry liên tục khi đang bị chặn.
  - Không hiển thị hộp thoại hỏi Operator có muốn bypass không.

## 7. Shopee Modal Link Reading

Khi nút "Lấy link" được click trên Shopee Affiliate, một modal sẽ hiển thị chứa link affiliate.

* **Quy tắc đọc link**: Script Playwright phải đọc trực tiếp nội dung link từ modal của Shopee bằng cách kiểm tra các thẻ DOM trong modal (như `textarea.value`, `input.value` hoặc `textContent` có chứa dạng `https://s.shopee.vn/...`).
* **Không phụ thuộc Clipboard**: Tuyệt đối không viết code phụ thuộc duy nhất vào Clipboard hệ thống (như nút "Sao chép Link" của Shopee để ghi vào clipboard của server) vì môi trường chạy docker/headless server có thể không có clipboard.
* **Xử lý lỗi**: Nếu modal xuất hiện nhưng không trích xuất được link từ DOM, trả về trạng thái `FAIL` với `stage: "modal_read"` và `reasonCode: "ERR_MODAL_UNRECOGNIZED"`.

## 8. Product Image Capture

* **Dẫn truyền dữ liệu**: Thông tin ảnh sản phẩm được lấy từ DOM card Shopee khi trích xuất: `image_url` (từ DOM) ──> `product_image_url` (registry) ──> `productImageUrl` (API/UI Product Card).
* **Sanitize URL**: URL ảnh phải được làm sạch (chạy qua helper `sanitizeProductImageUrl`), loại bỏ các tham số tracking hay credentials ẩn trong query string trước khi ghi vào registry hoặc trả ra UI.
* **Fallback**: Đối với các sản phẩm cũ trong registry chưa có thông tin ảnh (như BABYJOY), hệ thống hiển thị fallback *"Chưa có ảnh sản phẩm"* trên UI. Đây là hành vi đúng thiết kế, không phải lỗi. Các sản phẩm mới trích xuất sau này sẽ tự động nạp ảnh nếu DOM Shopee cung cấp link ảnh sạch.

## 9. Registry / Product Card

* **Phân định vai trò**:
  - **Registry** (`shopee_link_registry.json`) là kho lưu trữ bền vững, chứa tất cả các liên kết affiliate đã được verified.
  - **Product Card hiện tại** (`selected_product_card.json`) là sản phẩm được Operator chọn để làm việc cho job hiện tại.
* **Inline promote**: Nút "Dùng sản phẩm này" nạp liên kết từ Registry sang Product Card hiện tại mà không cần mở trình duyệt hay thực hiện lại CDP. Sau khi chọn, giao diện Command Center phải tự động reload/refresh thông tin Product Card hiện tại.
* **Đồng bộ Registry**: Sau khi lấy link mới thành công (SUCCESS), registry picker phải tự cập nhật và hiển thị sản phẩm mới này lên đầu danh sách để Operator bấm chọn nhanh.
* **Tách biệt luồng**: Không tự động tạo job hay chuyển sang Action 2 ngay sau khi lấy link Shopee mới thành công. Hãy để Operator chủ động bấm chọn sản phẩm và bấm chạy sản xuất.

## 10. API / Security Rules

Để bảo vệ tài khoản Shopee và các thông tin nhạy cảm:
* **Local-only guard**: Các API route thực thi live action (như gọi CDP scraper) phải chặn truy cập từ xa, chỉ cho phép chạy từ localhost (`127.0.0.1` hoặc `::1`).
* **Sanitize Response**:
  - Không bao giờ trả về canonical URL gốc (URL dài sau giải mã) ra giao diện UI nếu nó chứa thông tin nhạy cảm.
  - **Tuyệt đối cấm** trả về các trường sau ra client: `credential_token`, `mmp_pid`, `gads_t_sig`, cookies, session token, path tới browser profile, hay các biến cấu hình hệ thống.
* **Safe runner**: Sử dụng helper `runRepoScript` với tham số `{ shell: false }` để chạy CLI CDP, tránh lỗi command injection.
* **Standard Fail Response**: Trả về lỗi dạng JSON có cấu trúc gồm: `status: "FAIL"`, `stage` (bước bị lỗi), `reasonCode` (mã lỗi lập trình), và `message` (nội dung lỗi đã sanitize).

## 11. Anti-patterns (Lỗi cần tránh)

* ❌ Đẩy chức năng "Lấy link Shopee mới" ra một trang debug/route riêng.
* ❌ Viết code UI/API trích xuất giả lập (stub/mock) không gọi chạy CDP thật khi Operator đã confirm.
* ❌ Hỏi Operator xác nhận thêm một lần nữa sau khi Operator đã điền đúng cụm từ xác nhận.
* ❌ Coi CAPTCHA/Login là lỗi kết thúc tiến trình và hủy bỏ registry thay vì trả về trạng thái `SUSPENDED`.
* ❌ Tìm cách tự động bypass CAPTCHA hoặc tự điền mật khẩu/mã OTP của Operator.
* ❌ Lấy nhiều hơn 1 link hoặc click lung tung vào các nút quản trị tài khoản Shopee.
* ❌ Trả canonical URL thô hoặc cookies ra ngoài giao diện UI.
* ❌ Commit các file lưu trữ cookies/session của Shopee hoặc registry tạm vào Git.
* ❌ Tự ý tạo bản nháp Job (Job draft) ngay sau khi trích xuất thành công sản phẩm.

## 12. Correct Safety Pattern (Thiết kế an toàn đúng)

```text
Operator bấm nút ──> Nhập "GET 1 SHOPEE LINK" ──> Chạy CDP ngầm ──> Trả kết quả SUCCESS/SUSPENDED/FAIL ──> Hiển thị Result Box inline
```
*Không được thiết kế luồng:* Operator bấm nút ──> Claude chat hỏi lại Operator có muốn chạy thật không ──> Claude bảo Operator tự mở terminal chạy CLI.
