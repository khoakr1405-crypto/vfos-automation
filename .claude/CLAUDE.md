# CLAUDE.md — Bộ não dự án

> File này được Claude Code tự động đọc mỗi lần khởi động trong workspace này.
> Mọi quy tắc CHUNG (public, commit lên GitHub) đặt ở đây.
> Quy tắc riêng tư / secrets → `CLAUDE.local.md`.

## 1. Bối cảnh dự án

**Tên:** AI Automation Workflow
**Mục tiêu:** Xây dựng và vận hành các pipeline tự động hóa dựa trên AI (n8n, LangChain, multi-agent, content factory, affiliate automation).
**Ngôn ngữ giao tiếp:** Tiếng Việt, giữ technical terms tiếng Anh.

## 2. Quy tắc dự án (modular)

Các quy tắc chi tiết được tách thành module, gọi qua `@import`:

@rules/workflow.md
@rules/design.md
@rules/tech-defaults.md

## 3. Nguyên tắc cốt lõi

- **Không tự ý refactor / cleanup** khi user chỉ yêu cầu sửa bug.
- **Không thêm comment thừa** — code self-explanatory; chỉ comment WHY khi không hiển nhiên.
- **Không tạo file `.md` mới** trừ khi user yêu cầu rõ ràng.
- **Edit ưu tiên hơn Write** — sửa file có sẵn thay vì tạo mới.
- **Test trước khi báo done** — đặc biệt là UI/frontend, phải mở browser xem thật.

## 4. Sub-agents khả dụng

Khai báo trong `.claude/agents/`:
- `researcher` — research độc lập, tổng hợp tài liệu, so sánh tool.
- `reviewer` — code review cuốn chiếu, soi security & logic.

Gọi bằng `Agent(subagent_type: "researcher", ...)`.

## 5. Skills tái sử dụng

Khai báo trong `.claude/skills/`:
- `shop-amazon` — workflow đặt hàng Amazon affiliate.

## 6. Tham chiếu external

- Memory cá nhân (cross-session): `C:\Users\Admin\.claude\projects\<hash>\memory\`
- Memory dự án (commit được): `./MEMORY.md` ở root project
- Settings runtime: `.claude/settings.json` (public) + `settings.local.json` (private)
