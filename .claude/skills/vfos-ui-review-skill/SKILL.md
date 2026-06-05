---
name: vfos-ui-review-skill
description: Use this skill whenever modifying VFOS Studio UI, React components, pages, layout, sidebar, Command Center panels, buttons, labels, forms, navigation, lane banners, or any Operator-facing screen. Ensures the dev server is run, review URLs are provided (localhost:3002), and Operator visually approves the UI before commit.
---

# VFOS UI Review Skill

Skill này quy định quy trình chuẩn và bắt buộc để kiểm tra giao diện người dùng (UI/UX) của VFOS Studio trước khi thực hiện commit hay đề xuất nghiệm thu mã nguồn UI.

## When to use this skill

* Khi sửa đổi hoặc bổ sung bất kỳ thành phần giao diện nào (React components, TSX/JSX, styles CSS) trong thư mục `apps/studio`.
* Khi thay đổi cấu trúc trang (pages, layouts), thanh điều hướng (sidebar, lane banners), bảng điều khiển (Command Center panels), nhãn (labels), nút bấm (buttons) hay form nhập liệu.

## 1. Core Rule

> **UI changes are not complete until Operator visually reviews them in the running app.**

* **Build pass là chưa đủ**: Việc vượt qua các biên dịch tĩnh (typecheck pass, build pass) hay trả về mã HTTP 200 tại API không đảm bảo giao diện hiển thị đúng ý Operator.
* **Kiểm thử trực quan**: Claude phải khởi chạy dev server thực tế và cung cấp các địa chỉ URL xem trước để Operator tự tay nhấp chuột kiểm thử bằng mắt.
* **Quy tắc phê duyệt**: Tuyệt đối không thực hiện commit hay đề xuất stage mã nguồn UI khi Operator chưa xác nhận đã xem giao diện và đồng ý.

## 2. Required Dev Server Flow

Khi thực hiện bất kỳ thay đổi nào liên quan đến UI, Claude phải chạy và xác nhận tính ổn định của môi trường phát triển Next.js thông qua luồng lệnh chuẩn sau:

```bash
pnpm studio:dev:clean --no-start
pnpm --filter @vfos/studio typecheck
pnpm --filter @vfos/studio build
pnpm studio:dev:clean
```

Sau khi khởi chạy thành công, Claude phải đưa ra chỉ dẫn rõ ràng:
> Dev server đang chạy ở http://localhost:3002

Nếu tiến trình dev server gặp lỗi và không thể chạy được, Claude phải báo cáo rõ ràng nguyên nhân (lỗi compile, thiếu dependencies, xung đột cổng) và **không được xin phép commit**.

## 3. Required Review URLs

Tùy thuộc vào phạm vi thay đổi giao diện, Claude phải cung cấp chính xác các đường dẫn URL để Operator truy cập trực tiếp:

* **Đối với giao diện chính Command Center (lane Review Sản phẩm)**:
  `http://localhost:3002/lanes/product-review`
* **Đối với các trang chi tiết / debug kỹ thuật (kèm ngữ cảnh lane)**:
  - Kho sản phẩm: `http://localhost:3002/products?lane=product-review`
  - Tạo Job: `http://localhost:3002/create?lane=product-review`
  - Tiền xử lý Raw Visual: `http://localhost:3002/raw-visual?lane=product-review`
  - Script & Voice-over: `http://localhost:3002/script?lane=product-review`
  - Tiến độ Render: `http://localhost:3002/render?lane=product-review`
  - Kiểm định QA: `http://localhost:3002/qa?lane=product-review`
  - Đóng gói / Xuất bản: `http://localhost:3002/publish?lane=product-review`
* **Đối với thanh điều hướng phụ hoặc trang chủ**:
  - Trang chủ: `http://localhost:3002/`
* **Đối với các phân hệ vận hành và thống kê khác**:
  - Analytics: `http://localhost:3002/analytics`
  - Quản lý Kênh: `http://localhost:3002/channels`
  - Bình luận & Tương tác: `http://localhost:3002/comments`
  - Lịch xuất bản: `http://localhost:3002/schedule`

*Claude phải in các URL cụ thể này ra màn hình chat, không dùng các câu nói chung chung như "hãy mở trang web lên xem".*

<h2>4. What Operator Must Check</h2>

Khi yêu cầu Operator kiểm duyệt, Claude cần liệt kê các danh mục kiểm tra cụ thể tùy theo scope chỉnh sửa:
* **Khả năng hiển thị**: Các nút bấm, nhãn chữ, icon có xuất hiện đúng vị trí và không bị vỡ bố cục (responsive layout) không?
* **Wording & Trải nghiệm**: Nhãn chữ có rõ nghĩa, dễ hiểu hay gây hiểu nhầm không?
* **Luồng tương tác**: Bấm nút có kích hoạt đúng hành động ngầm hoặc mở đúng form/kết quả tương ứng không?
* **Giữ ngữ cảnh**: Khi thao tác có bị chuyển trang (redirect) rời khỏi màn hình Command Center không mong muốn không?
* **Nút quay lại**: Các trang kỹ thuật đã hiển thị nút quay lại Command Center ở góc trái trên cùng chưa?
* **Sidebar**: Thanh điều hướng bên hông có giữ đúng cấu trúc tối giản không?
* **Phản hồi trạng thái**: Các kết quả SUCCESS, SUSPENDED, hay FAIL có hiển thị trực quan và rõ ràng nội dung chi tiết không?

## 5. Command Center Specific UI Review

Khi sửa đổi giao diện chính `/lanes/product-review`, Claude phải tự kiểm tra và bảo vệ cấu trúc layout:
- Đảm bảo giữ đúng 3 Workflow Action Panels theo chiều ngang/dọc rõ ràng.
- Đảm bảo **khâu QA nằm trong Action 2** chứ không tách ra ngoài.
- Đảm bảo **Shopee new link extraction nằm trong Action 1** chứ không giấu đi.
- Đảm bảo các nút hành động nguy hiểm/CDP đều có confirm gate inline.
- Đảm bảo các kết quả trích xuất hoặc trạng thái sản xuất video được phản hồi inline trong panel tương ứng.

## 6. Back-to-Lane UX Rule

Bất kỳ trang kỹ thuật nào được Operator mở từ một lane (khi URL chứa tham số `?lane=product-review`) **bắt buộc** phải hiển thị rõ ràng nút quay lại ở đầu trang:

```text
← Quay lại Review Sản phẩm
```

Nút này phải dẫn trực tiếp về `/lanes/product-review`. 

Nếu Operator phản hồi hoặc chụp ảnh màn hình cho thấy thiếu nút quay lại này trên các trang kỹ thuật khi truy cập từ lane, task UI đó được coi là **chưa đạt yêu cầu**.

## 7. Wording / Label Clarity

Claude phải chú ý đặc biệt đến sự rõ ràng của từ ngữ hiển thị trên giao diện, tránh làm Operator hiểu sai luồng vận hành:
* **Hộp xác nhận (Confirm phrase input)**: Đối với các trường nhập từ khóa xác thực (như `GET 1 SHOPEE LINK`), nhãn input phải ghi rõ: *"Nhập cụm xác nhận để chạy (đây là ô xác nhận, không phải ô dán link sản phẩm)"*.
* **Vùng kết quả**: Sau khi trích xuất hoặc promote, kết quả phải được bọc trong một vùng tiêu đề rõ ràng (ví dụ: `Kết quả lấy link mới` hoặc `Sản phẩm hiện tại`) để phân biệt với các hộp nhập liệu đầu vào.

## 8. Visual Review Before Commit

> **No Operator visual approval, no UI commit.**

Trước khi đề xuất Operator phê duyệt commit cho các thay đổi UI, Claude phải cung cấp báo cáo trạng thái kiểm thử trực quan chứa:
1. Trạng thái dev server (đang chạy hay đã tắt).
2. Đường dẫn URL xem trước cụ thể.
3. Operator đã mở xem trực tiếp giao diện chưa?
4. Ý kiến phản hồi / phê duyệt của Operator (Đã OK hay cần sửa thêm?).
5. Trạng thái Git status hiện tại.

Nếu Operator chưa tiến hành xem trực quan UI, Claude chỉ được ghi:
> *Chưa commit, chờ Operator review UI.*

Tuyệt đối không xin commit chỉ dựa trên build/typecheck thành công.

## 9. Screenshots / Media Policy

Trong quá trình Operator review UI, có thể có các file trung gian phát sinh:
- **Tuyệt đối cấm commit**: các ảnh chụp màn hình (screenshots), các video quay màn hình (recordings), các file video test, các file tài liệu hướng dẫn tạm thời (`walkthrough.md`, `task.md`, `implementation_plan.md` ở các thư mục tạm), và các file media tự động sinh ra bởi các công cụ kiểm thử browser.
- Mọi file media hoặc file nháp trên phải được dọn dẹp hoặc cho vào `.gitignore` trước khi commit.

## 10. Anti-patterns (Lỗi cần tránh)

* ❌ Báo cáo "HTTP 200" hoặc "build pass" rồi lập tức xin commit mà không mở app thực tế cho Operator.
* ❌ Sửa đổi CSS/HTML nhưng không khởi chạy dev server để kiểm tra.
* ❌ Yêu cầu Operator kiểm tra giao diện nhưng chỉ nói chung chung không kèm theo URL cụ thể.
* ❌ Commit mã nguồn UI trước khi Operator phê duyệt trực quan.
* ❌ Thiết kế nút chính chỉ là link điều hướng (navigation link) nhưng gắn nhãn là nút chạy quy trình (workflow button).
* ❌ Đặt nhãn gây nhầm lẫn luồng nhập liệu.
* ❌ Thiếu nút quay lại Command Center trên các route kỹ thuật khi mở bằng lane query.
* ❌ Vô tình commit các file ảnh chụp màn hình hoặc video preview vào repository.

## 11. Correct Final Report For UI Tasks

Báo cáo cuối turn cho mọi task UI phải tuân thủ khuôn mẫu:
1. **File đã sửa/tạo**: Liệt kê các file nguồn liên quan.
2. **Trạng thái Dev Server**: Xác nhận dev server đang chạy cổng 3002.
3. **URL cần mở**: Danh sách URL cụ thể để Operator kiểm duyệt.
4. **Mô tả thay đổi**: Tóm tắt ngắn gọn giao diện đã đổi những gì.
5. **Operator cần check gì**: Danh sách các điểm Operator cần tương tác kiểm thử.
6. **Kết quả kiểm tra kỹ thuật**: Trạng thái typecheck, build, biome check.
7. **Trạng thái Visual Review**: Ghi rõ Operator đã duyệt UI hay chưa.
8. **Git status cuối**: Đảm bảo sạch sẽ và không leak file cấm.
9. **Trạng thái commit**: YES/NO (mặc định là NO nếu Operator chưa duyệt UI).
