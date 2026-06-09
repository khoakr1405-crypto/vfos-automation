# VFOS SIDEBAR-BASED GUARDIAN WORKFLOWS STANDARD

## 1. Mục tiêu

VFOS không được phát triển như một tập hợp nhiều trang rời rạc. Mỗi mục lớn trên sidebar phải được xem là một **module nghiệp vụ hoàn chỉnh**, có workflow riêng, dữ liệu riêng, guard riêng và cơ chế review riêng.

Từ giờ, khi Claude/Agent sửa bất kỳ module sidebar nào trong VFOS, phải áp dụng chuẩn:

**Sidebar Module → Workflow → Guardian → Code/UI/API Guards → Verification Report**

Không task nào được coi là hoàn thành chỉ vì code chạy được hoặc build pass. Task chỉ hoàn thành khi module đó pass đúng logic, đúng dữ liệu, đúng UI vận hành và đúng guard an toàn.

---

## 2. Luật lõi

### Luật 1 — Sidebar là bản đồ kiến trúc nghiệp vụ

Mỗi mục trên sidebar không chỉ là route UI. Nó đại diện cho một khu vực vận hành của VFOS.

Ví dụ:

* Tổng quan
* Review Sản phẩm
* Vlog Về Câu cá
* Vlog Về xe
* Xuất bản & Lịch
* Cụm kênh & Kênh
* Lịch đa nền tảng
* Hiệu suất / Analytics
* Bình luận & Mắt thần

Khi sửa một mục sidebar, agent phải hiểu module đó đang phục vụ workflow gì, dữ liệu gì, ai là Operator, và hành động nào có rủi ro.

---

### Luật 2 — Mỗi sidebar module phải có Guardian Workflow riêng

Mỗi module lớn phải có một Guardian tương ứng để review:

* Logic nghiệp vụ
* Liên kết dữ liệu
* Trạng thái workflow
* UI/UX cho Operator
* Guard chống thao tác sai
* Server-side validation nếu có action thật
* Báo cáo pass/warn/block rõ ràng

Không dùng một “mắt thần chung chung” cho mọi thứ. Guardian phải đúng theo module.

---

### Luật 3 — Không action nào được chạy chỉ vì “có dữ liệu”

Action chỉ được chạy khi dữ liệu đó thuộc đúng workflow context.

Ví dụ sai:

* Có Product Card → cho chạy production
* Có preview → cho approve
* Có caption → cho publish
* Có analytics → cho report

Ví dụ đúng:

* Product Card phải thuộc đúng job hiện tại
* Preview phải được sinh ra từ đúng job hiện tại
* Caption/link phải thuộc đúng product/video
* Analytics phải map đúng jobId/publishedPostId

---

### Luật 4 — Không dùng floating state cho workflow thật

Không được dùng các nguồn mơ hồ trong action thật:

* latest product
* latest job
* latest preview
* latest affiliate link
* current product không rõ context
* mock data làm source of truth
* catalog demo làm source of truth
* runtime output không bind job rõ ràng

Trong workflow thật, phải ưu tiên các hàm dạng:

* getProductForJob(jobId)
* getSourceForJob(jobId)
* getPreviewForJob(jobId)
* getPublishPlanForJob(jobId)
* getAnalyticsForJob(jobId)
* validateReadiness(jobId)

---

### Luật 5 — UI guard chưa đủ, API phải tự chặn

Nếu một module có action thật như:

* run production
* approve
* reject
* publish
* schedule
* auto-reply
* fetch/post API
* update registry
* generate affiliate link

thì UI disable nút là chưa đủ.

Backend/API phải tự kiểm:

* ID hợp lệ
* entity tồn tại
* entity thuộc đúng workflow context
* trạng thái đủ điều kiện
* không dùng path/link/client input nguy hiểm
* không cho chạy nếu mismatch/missing/blocked

Nếu fail, API phải trả lỗi rõ:

* 400 MISSING
* 409 MISMATCH
* 403 BLOCKED
* 422 INVALID_STATE

---

## 3. Khung chuẩn cho mỗi sidebar module

Mỗi module phải được mô tả bằng 7 phần.

### 3.1. Module Identity

Ghi rõ:

* Tên module trên sidebar
* Route UI
* Vai trò của module
* Operator dùng module này để làm gì
* Module này thuộc nhóm nào: điều hành, lane nội dung, vận hành, báo cáo/tương tác

Ví dụ:

Module: Review Sản phẩm
Vai trò: sản xuất video review sản phẩm affiliate
Operator dùng để: chọn sản phẩm, chạy production, xem preview, duyệt video

---

### 3.2. Workflow Map

Mỗi module phải có workflow chính.

Ví dụ Product Review:

1. Chọn/bind Product Card
2. Intake source video
3. Approve clean source
4. Run production
5. Review preview
6. Approve/reject
7. Package/publish readiness

Không được chỉ làm UI rời rạc mà không biết workflow bước nào nối bước nào.

---

### 3.3. Data Binding Map

Mỗi module phải biết các entity chính bind với nhau bằng gì.

Ví dụ:

* jobId ↔ productCardPath
* jobId ↔ sourceVideoPath
* jobId ↔ previewPath
* jobId ↔ qaReportPath
* jobId ↔ affiliateLink
* jobId ↔ publishPlan
* jobId ↔ analytics record

Nếu không có binding rõ, phải đánh dấu MISSING hoặc BLOCKED, không tự đoán.

---

### 3.4. Guardian Checklist

Mỗi module phải có checklist riêng.

Checklist tối thiểu gồm:

* Module có lấy dữ liệu từ đúng source of truth không?
* Có trộn mock data với data thật không?
* UI có cho Operator biết đang thao tác với entity nào không?
* Action nguy hiểm có bị khóa khi thiếu điều kiện không?
* API có chặn nếu gọi thẳng không?
* Trạng thái PASS/WARN/MISMATCH/MISSING/BLOCKED có rõ không?
* Có audit/log/report đủ để truy lỗi không?

---

### 3.5. UI/UX Operator Check

Khi sửa UI của module, agent phải tự kiểm:

* Operator nhìn vào có biết đang ở module nào không?
* Có biết đang làm việc với job/product/channel/post nào không?
* Có biết bước hiện tại là gì không?
* Có biết vì sao nút bị khóa không?
* Có cảnh báo mismatch/missing không?
* Có nút nguy hiểm nào thiếu confirm không?
* UI có đang tạo cảm giác “đã sẵn sàng” trong khi backend chưa ready không?

---

### 3.6. Code/API Guard

Nếu module có API/action, phải có guard rõ trong code.

Guard có thể nằm ở:

* lib helper
* route handler
* validator
* service layer
* workflow-integrity helper
* publish guard
* analytics validator

Không copy-paste logic rời rạc nếu có thể dùng helper chung.

---

### 3.7. Verification Report

Báo cáo cuối của mọi task sidebar phải có:

1. Module sidebar đã sửa
2. Guardian đã áp dụng
3. Workflow bị ảnh hưởng
4. Data binding đã kiểm
5. UI guard đã kiểm
6. API/server guard đã kiểm nếu có
7. Test happy path
8. Test bad path/mismatch/missing
9. File đã sửa
10. Git status cuối
11. Có commit không, commit hash nếu có
12. Xác nhận không commit runtime/secrets/media/logs
13. Rủi ro còn lại

---

## 4. Guardian gợi ý theo sidebar hiện tại

### 4.1. Tổng quan

Guardian: System Overview Guardian

Kiểm:

* Trạng thái tổng thể của các lane
* Job đang chạy/chờ duyệt/bị block
* Workflow mismatch
* Cảnh báo hệ thống
* Không hiển thị sai trạng thái từ dữ liệu cũ

---

### 4.2. Review Sản phẩm

Guardian: Product Review Guardian

Kiểm:

* Product Card có bind đúng job không
* Source video có đúng job không
* Script/voice/caption có đúng sản phẩm không
* Affiliate link có đúng product và owner không
* Preview có đúng job không
* Action 1/2/3 có nối nhau không
* Production readiness có pass thật không

---

### 4.3. Vlog Về Câu cá

Guardian: Fishing Lane Guardian

Kiểm:

* Nội dung đúng lane câu cá
* CTA/link liên quan tự nhiên
* Không biến vlog thành review sản phẩm thô
* Source/script/caption phù hợp người xem câu cá
* Product nếu có phải đúng ngữ cảnh

---

### 4.4. Vlog Về xe

Guardian: Auto Lane Guardian

Kiểm:

* Nội dung đúng lane xe/chăm sóc xe
* Product/CTA không lạc chủ đề
* Visual/script/caption đúng tệp người xem
* Không gắn nhầm sản phẩm từ lane khác

---

### 4.5. Xuất bản & Lịch

Guardian: Publish Safety Guardian

Kiểm:

* Video đã được Operator approve chưa
* Caption/link/package đã sẵn sàng chưa
* Publish đúng job/video/product chưa
* Có confirm trước publish không
* Không auto-publish khi chưa được phép
* Có audit log không

---

### 4.6. Cụm kênh & Kênh

Guardian: Channel Structure Guardian

Kiểm:

* Lane map đúng channel/page/profile
* Không đưa nội dung sai kênh
* Channel có role rõ
* Không trộn kênh thử nghiệm với kênh thật
* Cấu trúc cụm kênh dễ hiểu cho Operator

---

### 4.7. Lịch đa nền tảng

Guardian: Cross-Platform Schedule Guardian

Kiểm:

* Job được lên lịch đúng nền tảng
* Không trùng lịch nguy hiểm
* Video đúng format nền tảng
* Không schedule video chưa approve
* Posting plan map đúng jobId/channel/platform

---

### 4.8. Hiệu suất / Analytics

Guardian: Analytics Integrity Guardian

Kiểm:

* View/click/comment map đúng job
* Không dùng mock data làm report thật
* Published post khớp jobId
* CTA metrics khớp product/link
* Không tối ưu dựa trên dữ liệu sai entity

---

### 4.9. Bình luận & Mắt thần

Guardian: Comment Intelligence Guardian

Kiểm:

* Comment intent phân loại đúng
* Reply draft an toàn
* Không spam link
* Không auto-reply nếu chưa đủ safe
* Link trong reply đúng product/job
* Không trả lời sai ngữ cảnh video

---

## 5. Quy trình bắt buộc khi agent sửa module sidebar

Khi nhận task sửa một module sidebar, Claude/Agent phải làm theo quy trình:

### Bước 1 — Identify Module

Xác định task thuộc sidebar module nào.

Nếu task chạm nhiều module, phải liệt kê module chính và module phụ.

---

### Bước 2 — Load Guardian

Áp dụng Guardian tương ứng với module.

Nếu module chưa có Guardian cụ thể, dùng Sidebar Guardian Base Standard và đề xuất tạo Guardian riêng.

---

### Bước 3 — Read Context

Đọc các file liên quan:

* page/component của module
* API route liên quan
* data loader liên quan
* type/schema liên quan
* guard/helper hiện có
* docs/skill module nếu có

Không code trước khi hiểu data flow.

---

### Bước 4 — Map Workflow & Binding

Trước khi sửa phải trả lời:

* Workflow hiện tại gồm những bước nào?
* Entity chính là gì?
* Bind bằng key nào?
* Có floating state không?
* Có mock data lẫn data thật không?
* Có action nào nguy hiểm không?
* UI và API có cùng hiểu một context không?

---

### Bước 5 — Code Surgically

Sửa nhỏ, đúng mục tiêu, không scope creep.

Không redesign lớn nếu chưa được yêu cầu.

Không hardcode dữ liệu cụ thể để qua lỗi.

---

### Bước 6 — Verify

Phải kiểm:

* typecheck/build/lint hoặc command tương ứng
* happy path
* bad path
* mismatch/missing case nếu module có workflow data
* UI guard
* API guard nếu có
* git status/diff

---

### Bước 7 — Report

Báo cáo cuối phải có mục:

* Guardian Applied
* Workflow Integrity Result
* Operator UI Result
* Server-side Guard Result
* Known Issues / Next Round

Không được chỉ báo “đã build thành công”.

---

## 6. Luật chống scope creep

Guardian review không có nghĩa là agent được tự mở rộng vô hạn.

Agent chỉ được tự sửa lỗi trong phạm vi task.

Nếu phát hiện lỗi lớn ngoài scope:

* Không tự redesign
* Không tự mở lane mới
* Không tự thêm database mới
* Không tự publish
* Không tự chạy production thật nhiều lần
* Báo BLOCKED/SUSPENDED hoặc đề xuất round sau

Vòng lặp tối đa trong một task:

1. Code
2. Review
3. Fix lỗi trong scope
4. Verify lại
5. Report

Nếu sau vòng này vẫn còn lỗi lớn, báo thật.

---

## 7. Luật runtime và bảo mật

Không commit:

* data/temp/
* runs/
* video output
* preview mp4
* voice mp3
* QA report runtime
* logs runtime
* .env
* token/secret
* cookie/session/storage state
* browser profile
* node_modules
* build cache
* file ảnh/video artifacts nếu không được yêu cầu commit

Trước khi commit phải kiểm:

* git status
* git diff --name-only
* git diff --cached --name-only

---

## 8. Định nghĩa hoàn thành

Một task trong sidebar module chỉ được coi là DONE khi đạt đủ:

* Technical PASS
* Workflow/Data Binding PASS
* Guardian Checklist PASS hoặc WARN có giải thích
* UI Operator Check PASS
* API Guard PASS nếu có action server
* Bad path/mismatch/missing đã được test nếu liên quan
* Không runtime/secrets/media/logs bị commit
* Báo cáo cuối trung thực

Nếu thiếu một mục quan trọng, trạng thái phải là:

* PARTIAL
* BLOCKED
* SUSPENDED
* NEEDS_OPERATOR_REVIEW

Không được báo DONE giả.

---

## 9. Câu lệnh ngắn để gọi chuẩn này trong prompt sau

Khi tôi nói:

“Áp dụng Sidebar-Based Guardian Workflows”

thì Claude/Agent phải hiểu là:

* Xác định module sidebar liên quan
* Áp dụng Guardian tương ứng
* Kiểm workflow/data binding/UI/API guard
* Không dùng floating state
* Không trộn mock data với data thật
* Test happy path và bad path
* Báo cáo theo chuẩn Guardian
* Không commit runtime/secrets/media/logs

---

## 10. SELF-REVIEW BẮT BUỘC TRƯỚC KHI BÁO CÁO CUỐI

Trước khi báo cáo cuối, agent phải tự kiểm:

* Tôi đã xác định đúng sidebar module chưa?
* Tôi đã áp dụng đúng Guardian chưa?
* Tôi đã hiểu workflow của module chưa?
* Tôi đã kiểm data binding chưa?
* Tôi có dùng latest/current/floating state nguy hiểm không?
* Tôi có trộn mock data với workflow thật không?
* UI có làm Operator hiểu đúng không?
* Action nguy hiểm có guard không?
* API có tự chặn nếu gọi thẳng không?
* Tôi đã test happy path chưa?
* Tôi đã test bad path/mismatch/missing chưa?
* Tôi có scope creep không?
* Tôi có commit runtime/secrets/media/logs không?
* Git status cuối đã sạch hoặc giải thích rõ chưa?
* Báo cáo có trung thực phần chưa làm/chưa chắc không?
