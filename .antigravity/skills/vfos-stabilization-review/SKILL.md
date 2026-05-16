---
name: vfos-stabilization-review
description: Review and stabilize the VFOS project by following the handoff document, verifying behavior before making code changes, running browser checks when needed, updating documentation, and handling git safely.
---

# VFOS Stabilization Review

Skill này dùng để chuẩn hóa quy trình review, verify, browser test, cập nhật handoff và xử lý git an toàn cho project VFOS.

## When to use this skill

* Khi người dùng yêu cầu review, stabilization, verification hoặc tiếp tục từ `docs/ANTIGRAVITY_HANDOFF.md`
* Khi cần xác minh một subsystem đã hoàn thiện hay chưa
* Khi cần ưu tiên kiểm chứng thực tế trước khi sửa code

## Core principles

1. **North Star Alignment**: BẮT BUỘC đọc `docs/VFOS_NORTH_STAR.md` trước khi review, đánh giá ưu tiên hay quyết định task có đáng làm không. Khi review một subsystem hoặc handoff, agent phải phân biệt rõ:
   * task ổn định kỹ thuật thật sự cần thiết.
   * task chỉ làm hệ thống “đẹp hơn” nhưng không phục vụ North Star.
   Tuyệt đối không mở rộng stabilization sang những việc lệch khỏi mục tiêu lõi.
2. Read the handoff document first and extract the exact review scope.
2. Verify real behavior before proposing or making code changes.
3. Do not expand scope unless the user explicitly asks.
4. Prefer concrete evidence: commands run, browser checks, screenshots, test outputs.
5. Keep reports concise, factual, and separated into PASS / FAIL / INCONCLUSIVE when applicable.

## Standard workflow

1. **Read the handoff**

   * Mở `docs/ANTIGRAVITY_HANDOFF.md`
   * Xác định chính xác subsystem, checklist, rủi ro và các mục còn chưa verify
   * Tóm tắt phạm vi cần làm trước khi hành động

2. **Inspect current repository state**

   * Kiểm tra file, code path, test coverage hoặc cấu hình liên quan đến phạm vi review
   * Không sửa code chỉ dựa trên phỏng đoán

3. **Verify existing implementation**

   * Chạy test, smoke test hoặc command xác minh phù hợp
   * Trace integration/callsites nếu handoff yêu cầu
   * Ghi rõ bằng chứng từ output thực tế

4. **Run browser verification when UI is in scope**

   * Tự khởi động service cần thiết nếu có thể
   * Mở đúng route UI cần test
   * Click/test các thao tác được yêu cầu
   * Báo cáo PASS / FAIL / INCONCLUSIVE cho từng mục
   * Chụp screenshot nếu hữu ích

5. **Only fix code when a real gap is confirmed**

   * Chỉ chỉnh code khi test/verify chứng minh có thiếu sót hoặc lỗi thật
   * Nếu không phát hiện lỗi, nói rõ “no code changes required”

6. **Update handoff/documentation after completion**

   * Cập nhật trạng thái checklist
   * Ghi lại kết quả verify, cleanup hoặc quyết định quan trọng
   * Không thổi phồng kết luận vượt quá phạm vi đã test

7. **Apply safe git hygiene**

   * Chạy `git status` và xem `git diff`
   * Loại bỏ file auto-generated hoặc thay đổi không liên quan
   * Chỉ stage đúng file thuộc task
   * Không commit hoặc push nếu người dùng chưa xác nhận

8. **Close with a concise final report**

   * Nêu phần đã verify
   * Nêu code/docs đã đổi nếu có
   * Nêu trạng thái git nếu liên quan
   * Đề xuất bước tiếp theo duy nhất, ngắn gọn
