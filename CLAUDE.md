# CLAUDE.md

## VFOS North Star — Mandatory Context

Before making strategic recommendations, creating implementation plans, or modifying code for VFOS, always read:

`docs/VFOS_NORTH_STAR.md`

VFOS is not a generic AI automation platform.

Its core purpose is to build a system that helps:

* create videos
* find and reup promising videos from China and other foreign markets
* edit, transform, and localize those videos for the Vietnam market
* publish content for affiliate monetization on Facebook and TikTok
* increase the probability of attracting views, attaching affiliate links, and generating real revenue

The owner’s explicit business goal is to work toward 100–200 million VND/month from affiliate video monetization on Facebook and TikTok in Vietnam.
Treat this as the commercial North Star, but not as a guaranteed outcome.

## Decision Filter

Before recommending or implementing any work, evaluate:

“Does this move VFOS closer to creating or transforming reup videos into affiliate content for the Vietnam market on Facebook and TikTok, with a higher chance of gaining views and generating real revenue?”

If the relationship is unclear, do not prioritize it.

## What to Avoid

* Do not turn VFOS into a generic AI automation platform disconnected from affiliate-video monetization.
* Do not prioritize infrastructure, dashboards, abstractions, or refactors unless they clearly support the North Star.
* Do not focus only on isolated copywriting/content tools while ignoring the full pipeline:
  source video discovery → selection → reup/edit/localization → Facebook/TikTok affiliate publishing → performance learning.
* Do not mistake a technically impressive system for a system that improves real business outcomes.
* When making product or technical recommendations, explicitly connect them back to the VFOS North Star.

## VFOS Global No-Go Rules

> Đây là các **luật cấm nền (repo-level)**. Mặc định **luôn áp dụng** cho mọi task, kể cả khi prompt không nhắc lại. Chỉ được nới lỏng khi một task nêu **rõ ràng, cụ thể** sự cho phép — và ngay cả khi đó vẫn không vượt các ranh giới an toàn của Operator.

1. **Không bypass Product Binding Gate / Production Gate Standard.** Product Card là nguồn sự thật; binding `MISMATCH`/`MISSING` thì khóa, không tự mở khóa Action 2/3 bằng workaround.
2. **Không chạy production / render / publish / live API** nếu task không cho phép rõ ràng. Mặc định là dừng và hỏi, không tự khởi chạy.
3. **Không auto-publish khi Operator chưa duyệt.** Publish luôn là cổng duyệt thủ công riêng; READY ≠ được phép đăng.
4. **Không bypass login / CAPTCHA / OTP.** Gặp các trạng thái này phải dừng **SUSPENDED** để Operator xử lý tay — không tự điền, không né tránh.
5. **Không commit runtime / secrets / media / logs / session / cookie / registry.** Stage đích danh file mã nguồn trong scope; cấm `git add .` / `-A`.
6. **Không dùng fallback / demo source** để approve nguồn sạch, publish, hay launch production thật.
7. **Không dùng `latest` / `jobs[0]` / floating state** làm source of truth cho workflow thật. Job vận hành phải được chọn tường minh và khớp `productBinding`.

Khi một đề xuất hoặc thao tác chạm vào bất kỳ điểm nào ở trên, ưu tiên **dừng và xác nhận với Operator** thay vì tự quyết.

## Project Memory Protocol

1. **Khi bắt đầu session**
   - Luôn đọc:
     - `CLAUDE.md`
     - `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md`
     - `docs/00_DIEU_HANH/VFOS_SIDEBAR_GUARDIAN_STANDARD.md`
   - Sau đó tóm tắt lại trạng thái dự án trước khi thực thi task mới.

2. **Sau mỗi vòng làm việc lớn**
   - Nếu đã hoàn thành/chốt/commit một phần:
     - cập nhật file trạng thái VFOS
     - ghi commit hash mới
     - cập nhật "phần đã hoàn thành"
     - cập nhật "bước tiếp theo duy nhất"

3. **Trước khi compact context / khi context quá dài**
   - Ưu tiên giữ lại:
     - mục tiêu vòng hiện tại
     - quyết định đã chốt
     - file đã thay đổi
     - commit hash mới nhất
     - bước tiếp theo duy nhất
     - những việc bị cấm mở scope
   - Nếu cần, chủ động đề xuất cập nhật file trạng thái trước khi compact.

4. **Không coi chat history là nguồn nhớ duy nhất**
   - Các quyết định quan trọng phải được đưa vào file trạng thái hoặc docs trong repo.
