# Workflow Rules

## Quy trình xử lý task

1. **Đọc trước, sửa sau** — luôn `Read` file gốc trước khi `Edit`.
2. **Plan cho task non-trivial** — task >3 bước hoặc đụng nhiều file thì dùng `TodoWrite`.
3. **Update todo realtime** — đánh dấu `completed` ngay khi xong từng bước, không dồn cuối.
4. **Test trước khi báo done**:
   - Code logic → chạy unit test
   - UI/frontend → mở browser, click thật
   - API/automation → curl/postman thật, không tin mock

## Git workflow

- **Branch naming:** `feat/<scope>`, `fix/<scope>`, `chore/<scope>`
- **Commit message:** imperative, dưới 70 ký tự cho title
- **Không amend** trừ khi user yêu cầu — tạo commit mới luôn
- **Không force push lên `main`/`master`**

## Communication

- Trả lời tiếng Việt, technical terms giữ tiếng Anh
- Ngắn gọn, 2-3 câu nếu là câu hỏi exploratory
- Khi reference code, dùng format `[file.ts:42](src/file.ts#L42)` để IDE click được
