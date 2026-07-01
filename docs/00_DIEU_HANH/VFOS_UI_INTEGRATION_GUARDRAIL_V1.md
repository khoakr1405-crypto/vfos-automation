# VFOS UI INTEGRATION GUARDRAIL V1

> **Bản chất**: Luật ràng buộc cho **Round UI Integration** — đưa logic 3 command read-only diagnostic (`/ent-status`, `/review-status`, `/gate-check`) vào UI `apps/studio`.
> **Nguồn gốc**: Doc này **HỢP NHẤT** luật đã rải rác (CLAUDE.md, No-Go rules, `vfos-command-center-skill`, `vfos-ui-review-skill`, `vfos-product-review-workflow-skill`, `VFOS_UI_ARCHITECTURE_V1`, `ent-status/review-status/gate-check` SKILL) + **BỔ SUNG** các luật còn thiếu (đặc biệt T2/T7/T10). Nó **KHÔNG định nghĩa lại** Product Review workflow 5 bước hay bất kỳ pipeline nào.
> **Phạm vi**: chỉ round status/gate UI (read-only). Produce/action là round riêng, có guard.

Mỗi mục ghi rõ: **[HỢP NHẤT]** = luật đã có nơi khác, gom lại; **[MỚI]** = luật bổ sung lần này.

---

## 1. UI là nơi vận hành chính
- **[HỢP NHẤT]** VFOS Studio là **Workflow Command Center**, không phải navigation shell (nguồn: `vfos-command-center-skill`). UI là bề mặt vận hành lâu dài.
- **[MỚI]** Slash command (`/ent-status`, `/review-status`, `/gate-check`) chỉ là **GIÀN GIÁO TẠM** để xác minh logic; **không** phải sản phẩm cuối.
- **[MỚI]** **UI KHÔNG được gọi slash command.** UI phải dùng **shared read-only lib/service/API** để lấy cùng dữ liệu mà 3 command đọc.

## 2. Tích hợp 3 logic vào UI (mapping ràng buộc)
- **[MỚI]** `/ent-status` → **Entertainment Status panel**.
- **[MỚI]** `/review-status` → **Product Review Status panel**.
- **[MỚI]** `/gate-check <jobId>` → nút **"Kiểm tra gate"** trong **job card/modal** (per-job).
- **[HỢP NHẤT]** Tích hợp **inline** theo lane, không phân mảnh thành route kỹ thuật rời (nguồn: `vfos-command-center-skill`, `vfos-product-review-workflow-skill`).
- **[MỚI]** **Không tạo thêm slash command mới** cho các phần này.

## 3. Read-only boundary
Status/gate UI **chỉ được ĐỌC dữ liệu**. **CẤM tuyệt đối** (nguồn hợp nhất: `gate-check/SKILL.md`, No-Go #2, `ent-status/SKILL.md`):
- ❌ chạy production · ❌ render · ❌ chạy QA mới · ❌ package · ❌ publish/live
- ❌ gọi Facebook/TikTok API · ❌ mutate job state · ❌ sửa artifact · ❌ ghi `data/temp`
- ❌ bypass/mở khoá gate (No-Go #1)
- **[MỚI]** `git status` phải **sạch** sau mọi thao tác read-only của UI dev/test.

## 4. Product Review workflow (bất biến)
- **[HỢP NHẤT]** **Không** thay đổi workflow **5 bước** đã chốt; QA nằm trong Action 2, không tách Action 4 (nguồn: `vfos-product-review-workflow-skill`).
- **[HỢP NHẤT]** **Không** thêm gate nội dung mới; **Operator vẫn là người duyệt preview cuối** (No-Go #3, #8).
- **[HỢP NHẤT]** Bước 3 production vẫn **auto-run sau clean-source PASS** (No-Go #8: agent tự PASS/FAIL bước kỹ thuật).
- **[MỚI]** **Không** thêm nút produce chính phá workflow trong round này. Retry production (nếu cần) là **round riêng, có guard**.

## 5. Entertainment workflow (bất biến)
- **[HỢP NHẤT]** **Không** đụng pipeline/render/BGM/blur trong round status/gate UI (nguồn: `ent-status/SKILL.md`, `VFOS_ENTERTAINMENT_LANE_SPEC`).
- **[MỚI]** **Không** tự thêm action produce/render vào Entertainment status panel.
- Panel chỉ **hiển thị trạng thái + gate diagnostic**.

## 6. Produce/action boundary
- **[MỚI]** **Không** tạo `/produce` slash command.
- **[HỢP NHẤT]** Produce phải là **UI action riêng, CÓ xác nhận/guard** (No-Go #2, #3).
- **[MỚI]** Produce round **tách riêng**, chỉ làm **sau khi** status/gate UI ổn.
- **[HỢP NHẤT]** **Không auto-publish**; READY ≠ được đăng (No-Go #3).

## 7. Shared logic
- **[HỢP NHẤT]** **Không** duplicate logic 3 command lung tung trong component; **single source of truth** (nguồn: `.claude/rules/design.md`).
- **[MỚI]** Tách **shared read-only service/lib** nếu phù hợp (đọc registry/manifest/ent_job/gate-mapping một chỗ).
- **[MỚI]** API route (nếu có) cho status/gate phải là **GET/read-only**.
- **[MỚI]** **POST/action route chỉ làm ở round produce/action riêng** — không thêm vào round này.

## 8. Data truthfulness
- **[HỢP NHẤT]** **Không tin mock** nếu có dữ liệu thật (nguồn: `.claude/rules` test-trước-khi-done; `vfos-evidence-gated-research`).
- **[HỢP NHẤT]** Field thiếu → `—`; artifact thiếu → `MISSING`; JSON hỏng → `PARSE_ERROR` (**không sửa file**).
- **[HỢP NHẤT]** `publishVisibility=UNCONFIRMED` giữ **nguyên văn** — **không** kết luận live/public (nguồn: 3 command SKILL).

## 9. UI validation
- **[HỢP NHẤT]** Phải **chạy dev server** đúng setup hiện tại (`pnpm studio:dev:clean`…), mở **browser xem thật**, không chỉ tin code diff; **Operator duyệt trực quan trước commit** (nguồn: `vfos-ui-review-skill`, port 3002).
- **[HỢP NHẤT]** Screenshot/notes UI làm **bằng chứng** nhưng **KHÔNG commit** ảnh/video/walkthrough/plan tạm (nguồn: `vfos-ui-review-skill`, No-Go #5).
- **[HỢP NHẤT]** `git status` phải **sạch** sau thao tác read-only.

## 10. Cleanup sau khi UI PASS
- **[MỚI]** **Sau khi** UI thay thế PASS (Operator duyệt), tạo **round cleanup RIÊNG** để xoá:
  - `.claude/skills/ent-status/`
  - `.claude/skills/review-status/`
  - `.claude/skills/gate-check/`
  - `.claude/_archive/skills/chay/`
- **[MỚI]** **KHÔNG xoá trước khi UI thay thế PASS.** Giàn giáo chỉ được tháo khi công trình đã đứng.

## 11. UI Integration PR Acceptance Checklist
**[MỚI]** Mỗi PR UI Integration **bắt buộc** báo checklist nghiệm thu dưới đây (thiếu mục nào → chưa được duyệt commit/merge):

- [ ] PR này thuộc loại **read-only** hay **action**?
- [ ] File **UI / API / lib** nào đã sửa?
- [ ] UI có **gọi slash command** không? *(Kỳ vọng: KHÔNG)*
- [ ] Có dùng **mock data** không? Nếu có → nêu rõ **vì sao**; nếu có dữ liệu thật thì **phải ưu tiên dữ liệu thật**.
- [ ] Dữ liệu thật lấy từ **path/API/lib** nào?
- [ ] Có chạy **production/render/QA/package/publish** không? *(Kỳ vọng: KHÔNG trong round status/gate UI)*
- [ ] Có gọi **Facebook/TikTok API** không? *(Kỳ vọng: KHÔNG)*
- [ ] Có **mutate job state** hoặc **ghi `data/temp`** không? *(Kỳ vọng: KHÔNG)*
- [ ] Có đụng **Product Review workflow 5 bước** không? *(Kỳ vọng: KHÔNG)*
- [ ] Có đụng **Entertainment pipeline/BGM/blur** không? *(Kỳ vọng: KHÔNG)*
- [ ] Đã **mở browser xem UI thật** chưa?
- [ ] Có **screenshot/ghi chú bằng chứng UI** không?
- [ ] `git status` sau test có **sạch** không?
- [ ] Nếu có **ngoại lệ** → phải **ghi rõ** và **chờ Operator duyệt trước commit**.

---

## Ghi chú áp dụng
- Doc này là **luật nền cho round UI Integration**; khi đề xuất/thao tác chạm vào các điểm trên mà không chắc → **dừng và xác nhận Operator** (theo tinh thần CLAUDE.md).
- Không nới các No-Go toàn repo (#1–#9); doc này **siết thêm**, không nới.
