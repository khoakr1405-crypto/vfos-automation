---
name: vfos-strategic-next-step
description: Evaluate the current VFOS project state and recommend the single most valuable next step before implementation.
---

# VFOS Strategic Next Step

Skill này dùng để suy nghĩ chiến lược, đọc trạng thái dự án và đề xuất bước tiếp theo có giá trị nhất trước khi triển khai.

## When to use this skill

* Khi người dùng hỏi VFOS nên làm gì tiếp theo
* Khi cần chọn ưu tiên sau một phase stabilization, cleanup hoặc hoàn thiện nền tảng
* Khi có nhiều hướng phát triển nhưng chưa rõ hướng nào đáng đầu tư nhất
* Khi cần đánh giá dự án theo góc nhìn sản phẩm + kỹ thuật trước khi triển khai
* Không dùng skill này để bắt đầu code ngay

## Strategic decision standard

Mỗi đề xuất phải được đánh giá dựa trên các tiêu chí sau:

1. **Product value** — bước này có làm VFOS tiến gần hơn tới một hệ thống có thể dùng thật hay không?
2. **Leverage** — nó có tận dụng tốt những nền tảng đã xây như Kernel, Queue, Audit, Cockpit, Plugin không?
3. **Timing** — đây có phải việc nên làm ngay ở giai đoạn hiện tại không?
4. **Proofability** — sau khi làm xong, có thể demo hoặc kiểm chứng rõ ràng không?
5. **Scope discipline** — có đủ nhỏ để hoàn thành gọn, nhưng đủ ý nghĩa để tạo tiến triển thật không?
6. **Risk reduction** — nó có làm giảm rủi ro lớn tiếp theo của dự án không?

## Strategic workflow

1. **Establish the current project state**

   * Đọc `docs/ANTIGRAVITY_HANDOFF.md` trước.
   * Xem các tài liệu định hướng hoặc kiến trúc liên quan nếu có: README, docs, package/app structure.
   * Xác định:

     * VFOS đã có những năng lực lõi nào
     * phần nào vừa được hoàn thiện hoặc verify
     * phần nào còn thiếu để trở thành một hệ thống có giá trị sử dụng thực tế
   * Không kết luận dựa trên cảm giác; phải dựa trên bằng chứng từ repo/docs.

2. **Identify the project’s current bottleneck**

   * Tìm “điểm nghẽn quan trọng nhất” đang chặn bước tiến tiếp theo của VFOS.
   * Ưu tiên bottleneck làm dự án:

     * chưa demo được giá trị thật
     * chưa có workflow end-to-end
     * chưa chứng minh được kiến trúc lõi hoạt động trong use case thực tế
     * hoặc có rủi ro nền tảng lớn cần xử lý trước
   * Phải nói rõ: “Hiện tại bottleneck lớn nhất là gì và vì sao?”

3. **Generate candidate next steps**

   * Đề xuất tối đa 3 hướng có thể làm tiếp.
   * Mỗi hướng phải đủ cụ thể để đánh giá, không nêu chung chung kiểu “mở rộng tính năng”.
   * Với từng hướng, đánh giá ngắn theo:

     * Product value
     * Leverage
     * Timing
     * Proofability
     * Scope discipline
     * Risk reduction

4. **Choose one recommended next step**

   * Chốt duy nhất **1 hướng khuyến nghị mạnh nhất**.
   * Không để kết luận lửng lơ kiểu “cả 3 đều tốt”.
   * Giải thích:

     * vì sao hướng này thắng
     * vì sao nên làm ngay bây giờ
     * vì sao 2 hướng còn lại chưa nên ưu tiên lúc này

5. **Define the recommended step as an actionable slice**

   * Biến hướng được chọn thành một lát cắt có thể triển khai rõ ràng.
   * Nêu:

     * Objective
     * Expected outcome
     * In scope
     * Out of scope
     * Definition of done
     * Main risks / open questions
   * Definition of done phải đủ cụ thể để về sau agent khác có thể triển khai và kiểm chứng.

6. **Produce a handoff-ready recommendation**

   * Kết quả cuối phải đủ rõ để người dùng có thể:

     * chấp nhận hướng đi
     * hoặc chuyển ngay sang skill triển khai/build feature
   * Không bắt đầu code trong skill này.
   * Không sửa file dự án trừ khi người dùng yêu cầu cập nhật tài liệu chiến lược.

## Required output format

Khi dùng skill này, báo cáo cuối cùng phải theo format:

1. **Current state of VFOS**
2. **Most important bottleneck**
3. **Candidate next steps** — tối đa 3 lựa chọn
4. **Recommended next step** — chỉ 1 lựa chọn
5. **Why this wins now**
6. **Why the other options wait**
7. **Actionable implementation brief**

   * Objective
   * In scope
   * Out of scope
   * Definition of done
   * Risks / open questions
8. **Decision requested from the user**

## Strategic anti-patterns to avoid

* Không đề xuất hướng chỉ vì nó “nghe hiện đại” hoặc mở rộng bề mặt tính năng mà chưa giải quyết bottleneck hiện tại.
* Không ưu tiên polish, refactor hoặc mở rộng UI nếu VFOS vẫn chưa chứng minh được một workflow giá trị chạy end-to-end.
* Không nhầm “nhiều thành phần kỹ thuật đã có” với “sản phẩm đã tạo ra giá trị sử dụng”.
* Không đưa ra 3 lựa chọn ngang nhau rồi né quyết định.
* Không chọn hướng quá lớn, quá trừu tượng hoặc khó xác minh trong một iteration rõ ràng.
* Không đánh giá cao một hướng chỉ vì nó dễ làm; phải ưu tiên bước có tỷ lệ **giá trị / công sức / khả năng chứng minh** tốt nhất.
* Không đề xuất triển khai ngay khi còn thiếu thông tin nền tảng; phải nêu rõ open questions nếu chúng ảnh hưởng trực tiếp đến quyết định.
