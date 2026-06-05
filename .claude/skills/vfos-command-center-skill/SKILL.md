---
name: vfos-command-center-skill
description: Use this skill whenever working on VFOS Studio UI, lane pages, sidebar, workflow panels, operator actions, or any route under apps/studio that affects how the Operator runs VFOS. Enforces the VFOS Workflow Command Center architecture and prevents reverting to navigation-shell or technical-module UI. Prevents exposure of raw technical routes (/products, /create, /raw-visual, /script, /render, /qa, /publish) as primary navigation flows, enforcing back-to-lane behavior and inline workflow orchestration instead.
---

# VFOS Command Center Skill

Skill này dùng để chuẩn hóa và khóa chặt tư duy thiết kế giao diện VFOS Studio theo mô hình Workflow Command Center tích hợp, ngăn chặn việc quay lại mô hình navigation shell cũ hoặc lộ các module kỹ thuật rời rạc cho Operator.

## When to use this skill

* Khi làm việc với giao diện người dùng (UI/UX) của VFOS Studio trong thư mục `apps/studio`.
* Khi chỉnh sửa thanh điều hướng (sidebar), cấu trúc menu hoặc sơ đồ các trang lane (`/lanes/*`).
* Khi xây dựng, chỉnh sửa hoặc kiểm duyệt các Workflow Panels và các nút bấm vận hành (Operator actions).
* Khi điều chỉnh hoặc audit bất kỳ route kỹ thuật chi tiết nào như `/products`, `/create`, `/raw-visual`, `/script`, `/render`, `/qa`, `/publish`.

## 1. Core Principle

> **VFOS Studio is a Workflow Command Center, not a navigation shell.**

* **UI chính không phải danh sách module kỹ thuật**: Giao diện chính của hệ thống phải là các bảng điều khiển tích hợp (Command Center) tương ứng với từng luồng nội dung (Lane). Operator chỉ cần làm việc tại các Command Center này để hoàn thành công việc.
* **Giao diện chính là bảng điều khiển vận hành**: Mọi hành động lớn phải được tích hợp inline vào các workflow action panels trên Command Center.
* **Không bắt Operator điều hướng thủ công**: Operator không phải tự đi qua từng route kỹ thuật đơn lẻ để thực hiện dây chuyền sản xuất video.
* **Phân định rõ ràng**: Các route kỹ thuật rời rạc chỉ được giữ lại để phục vụ lập trình viên (Developer) hoặc hiển thị chi tiết (debug/detail). Chúng không được là luồng đi (flow) chính của Operator.

## 2. Product Review Command Center Standard

Luồng hoạt động chuẩn cho lane `Review Sản phẩm` phải tuân thủ nghiêm ngặt mô hình 3 Action Panels tích hợp trên giao diện chính `/lanes/product-review`:

```text
Review Sản phẩm Command Center (/lanes/product-review)
├── Action 1: Lấy / chọn sản phẩm
├── Action 2: Chạy sản xuất video
└── Action 3: Đăng bài / Đóng gói
```

### Action 1 — Lấy / chọn sản phẩm
* **Nội dung hiển thị**:
  - Thẻ thông tin sản phẩm hiện tại (Current Product Card).
  - Kho lưu trữ sản phẩm thu gọn (Compact registry picker) hiển thị tối đa 10 sản phẩm verified gần nhất từ registry.
  - Chức năng chọn sản phẩm nhanh không cần click trình duyệt (Promote no-click) thông qua API `/api/studio/commerce/shopee-card-from-registry`.
  - Nút "Lấy link Shopee mới" dùng cho việc trích xuất liên kết trực tiếp bằng CDP.
* **Quy tắc quan trọng**:
  - Chức năng "Lấy link Shopee mới" là tính năng chính, bắt buộc phải nằm trực tiếp trong Action 1. Không được đẩy ra ngoài hoặc coi nó là tính năng debug phụ.
  - Phải thực hiện kiểm tra chủ sở hữu (Owner validation) và trạng thái sẵn sàng của thẻ sản phẩm trước khi cho phép đi tiếp sang Action 2.

### Action 2 — Chạy sản xuất video
* **Nội dung hiển thị**:
  - Form/nút nhận liên kết nguồn (Source URL).
  - Quản lý bản nháp Job (Job draft) và quá trình làm sạch nguồn (Clean source / source intake).
  - Tích hợp và hiển thị trạng thái của các khâu: Raw Visual, Script, Voice (Giọng nói AI), BGM (Nhạc nền), Render và tạo phụ đề (Caption).
  - Khâu kiểm duyệt và đánh giá chất lượng (QA / Kiểm tra).
* **Quy tắc quan trọng**:
  - Khâu QA / Kiểm tra phải được tích hợp và hiển thị trực tiếp bên trong Action 2.
  - Tuyệt đối không tách khâu QA thành một Action Panel lớn độc lập trên Command Center.

### Action 3 — Đăng bài / Đóng gói
* **Nội dung hiển thị**:
  - Xem và phê duyệt video thành phẩm (Final video preview).
  - Đóng gói dữ liệu (Packaging) và chuẩn bị nội dung đăng bài (Caption, affiliate link, CTA).
  - Hỗ trợ đăng bài thủ công (Manual publish support) hoặc đăng tự động có kiểm duyệt.
* **Quy tắc quan trọng**:
  - Đăng bài / Đóng gói là hành động cốt lõi ở cuối quy trình, bắt buộc phải hiển thị như một Action Panel chính.
  - Không được ẩn hoặc đẩy phần này thành chức năng debug phụ.

## 3. Anti-patterns (Lỗi cần tránh)

* ❌ Không biến thanh điều hướng (sidebar) thành danh sách các module kỹ thuật rời rạc.
* ❌ Không để các route `/products`, `/create`, `/raw-visual`, `/script`, `/render`, `/qa` làm luồng vận hành chính cho Operator.
* ❌ Không hiển thị 6 card kỹ thuật ngang hàng trong giao diện Review Sản phẩm.
* ❌ Không biến 3 hành động chính của luồng Review Sản phẩm thành các liên kết điều hướng đơn thuần.
* ❌ Không tách khâu QA thành hành động riêng biệt ngoài Action 2.
* ❌ Không giấu các chức năng quan trọng (Lấy link Shopee mới, Đăng bài / Đóng gói) thành các chức năng debug phụ.
* ❌ Không giải quyết rủi ro bảo mật/an toàn bằng cách đẩy tính năng chính ra ngoài route kỹ thuật rời rạc.

## 4. Correct UX Pattern (Mẫu thiết kế đúng)

Mọi tương tác của Operator trên Command Center phải tuân thủ nguyên tắc:
`Button click` → `Backend action / Orchestration` → `Status / Progress / Gate / Result inline`.

* **Ví dụ luồng lấy link Shopee**:
  Operator bấm "Lấy link Shopee mới" → Hiện confirm panel yêu cầu nhập phrase `GET 1 SHOPEE LINK` → Kích hoạt CDP extraction → Trả về kết quả SUCCESS/SUSPENDED/FAIL và cập nhật giao diện ngay lập tức trên Panel 1.
* **Ví dụ luồng sản xuất video**:
  Operator dán link nguồn và bấm "Chạy sản xuất video" → Hệ thống tự tạo Job và chạy ngầm → Hiển thị thanh tiến trình (progress) hoặc gate kiểm duyệt ngay tại Panel 2.
* **Ví dụ luồng đăng bài**:
  Operator bấm "Đăng bài / Đóng gói" → Hệ thống kiểm tra điều kiện QA/Package → Chuẩn bị sẵn video và link → Hiển thị kết quả hoặc nút đăng bài ngay tại Panel 3.

## 5. Technical Route Policy

Các trang kỹ thuật chi tiết vẫn tồn tại để phục vụ phát triển hoặc debug:
`/products`, `/create`, `/raw-visual`, `/script`, `/render`, `/qa`, `/publish`.

Tuy nhiên, chúng phải tuân theo quy tắc:
* Không xuất hiện trên menu điều hướng chính của Operator.
* Không được đóng vai trò là luồng vận hành chính.
* Nếu được truy cập từ ngữ cảnh của lane (ví dụ có tham số `?lane=product-review`), giao diện của các trang này **bắt buộc** phải hiển thị nút quay lại rõ ràng ở góc trái trên cùng:
  ```text
  ← Quay lại Review Sản phẩm
  ```
  Liên kết này phải trỏ chính xác về `/lanes/product-review`.

## 6. Sidebar Policy

Thanh điều hướng chính (Sidebar) phải được giữ cực kỳ tinh gọn và chỉ chứa các trung tâm điều hành hoặc lane hoạt động thực tế:

```text
TRUNG TÂM ĐIỀU HÀNH
- Tổng quan (/overview)

LANE NỘI DUNG
- Review Sản phẩm (/lanes/product-review)
- Vlog Về Câu cá (/lanes/fishing-vlog)
- Vlog Về xe (/lanes/car-vlog)

VẬN HÀNH
- Xuất bản & Lịch
- Cụm kênh & Kênh

BÁO CÁO / TƯƠNG TÁC
- Hiệu suất / Analytics
- Bình luận & Mắt thần
```

**Tuyệt đối cấm đưa ngược lại các mục sau làm menu chính**:
* Kho sản phẩm & Link
* Tạo nội dung mới
* Raw Visual AI
* Script / Voice / BGM
* Render & Caption
* QA & Duyệt

## 7. Safety Must Follow User Direction

> **Safety must be implemented inside the workflow, not by pushing core features out of the workflow.**

* **Cách làm đúng (Inline Safety)**:
  - Cài đặt cụm từ xác nhận (confirm phrase).
  - Thiết lập chế độ bảo vệ chỉ chạy nội bộ (local-only guard).
  - Sử dụng các trạng thái tạm dừng (SUSPENDED) khi gặp lỗi hoặc CAPTCHA.
  - Yêu cầu Operator xác nhận (operator approval gate) trước các bước quan trọng.
  - Lọc sạch dữ liệu nhạy cảm trong response (sanitized response).
* **Cách làm sai (Avoidance by isolation)**:
  - Giấu nút chức năng chính vào các route debug khuất.
  - Bắt Operator phải quay lại giao diện dòng lệnh CLI.
  - Chia nhỏ workflow ra thành nhiều trang riêng biệt để tránh lỗi.
  - Hỏi đi hỏi lại vòng vo khi Operator đã nhập đúng confirm phrase.

## 8. Self-Review Questions when modifying VFOS UI

Bất kỳ khi nào thực hiện chỉnh sửa giao diện VFOS Studio, Claude phải tự trả lời các câu hỏi sau:
1. Giao diện đang làm là Command Center tích hợp hay là một navigation shell?
2. Các bước trong luồng là các workflow action chạy ngầm hay chỉ là các link điều hướng đơn giản?
3. Operator có thể hoàn thành trọn vẹn luồng công việc mà không cần truy cập vào các trang kỹ thuật rời rạc hay không?
4. Các hành động nguy hiểm/nhạy cảm đã được bảo vệ (guard) trực quan inline chưa?
5. Trạng thái, tiến trình và kết quả của tác vụ có hiển thị trực quan ngay tại panel tương ứng không?
6. Khâu QA đã được nhúng vào Panel 2 của luồng sản xuất chưa?
7. Các trang kỹ thuật chi tiết chỉ được truy cập cho mục đích debug/detail và đã có nút quay lại Command Center chưa?
