---
name: vfos-git-safety-skill
description: Use this skill whenever working with Git in VFOS, including git status, staging, commit, push, branch sync, dirty working trees, runtime files, env files, registry files, screenshots, walkthroughs, task files, implementation plans, secrets, sessions, or any request to save, commit, or publish repository changes. Enforces strict scoped staging, commit-before-push approval, and prevents leaking runtime or credential files.
---

# VFOS Git Safety Skill

Skill này chuẩn hóa toàn bộ quy trình và quy chuẩn an toàn khi sử dụng Git trong dự án VFOS, nhằm ngăn ngừa tuyệt đối việc rò rỉ thông tin nhạy cảm, mã xác thực, tệp tin nháp hoặc tệp dữ liệu tạm thời trong quá trình phát triển.

## When to use this skill

* Bất cứ khi nào chuẩn bị thực hiện các thao tác với Git (`git status`, `git add`, `git commit`, `git push`, `git checkout`, `git restore`).
* Khi kết thúc một turn chat, chuẩn bị báo cáo tiến độ và đề xuất commit.
* Khi phát hiện thư mục làm việc (working tree) có sự xuất hiện của các file mới ngoài dự kiến.

## 1. Core Principle

> **Never stage, commit, or push broad changes without checking scope first.**

Dự án VFOS chứa rất nhiều file dữ liệu tạm (runtime data), dữ liệu trích xuất từ Shopee (registry), phiên trình duyệt (cookies/sessions), ảnh/video chụp thử, và các file kế hoạch/walkthrough của Agent. Vì vậy, an toàn Git là bắt buộc và phải được rà soát từng bước, không được làm tắt.

## 2. Required Git Checks

Claude bắt buộc phải thực thi các lệnh kiểm tra sau tại các thời điểm tương ứng:

* **Trước khi chỉnh sửa task lớn hoặc chuẩn bị commit**:
  ```bash
  git status
  git diff --name-only
  git log --oneline origin/master..HEAD
  ```
* **Trước khi đẩy code (push)**:
  ```bash
  git status
  git log --oneline origin/master..HEAD
  git show --name-status HEAD
  git show --stat HEAD
  ```
* **Sau khi đẩy code thành công (push)**:
  ```bash
  git status
  git log --oneline origin/master..HEAD
  git branch -r --contains <commit_hash>
  ```

## 3. Commit / Push Separation

> **Commit and push are separate approval gates.**

* **Ủy quyền commit**: Claude chỉ được phép tạo commit local khi Operator đã kiểm duyệt và phê duyệt rõ ràng danh sách file thay đổi.
* **Báo cáo sau commit**: Sau khi tạo commit, Claude phải cung cấp thông tin:
  - Mã hash commit (commit hash).
  - Nội dung commit message.
  - Danh sách các file thực tế đã được commit.
  - Kết quả `git status` mới nhất.
  - Xác nhận rõ ràng: *Chưa thực hiện push lên remote*.
* **Ủy quyền push**: Claude phải dừng lại và chờ Operator kiểm duyệt commit local trước khi thực hiện lệnh push. Tuyệt đối cấm đẩy thẳng lên remote ngay sau khi commit mà chưa được Operator duyệt.

## 4. Scoped Staging Only

* **Nghiêm cấm tuyệt đối**: Sử dụng các lệnh thêm hàng loạt không kiểm soát như:
  - `git add .`
  - `git add -A`
  - `git commit -am ...`
  *(Trừ phi có chỉ định rõ ràng của Operator và đã rà soát kỹ danh sách file cấm).*
* **Cách thực hiện đúng**: Chỉ thêm đích danh các file mã nguồn trực tiếp thuộc phạm vi nhiệm vụ:
  ```bash
  git add <file1> <file2> <file3>
  ```
* **Rà soát trước commit**: Trước khi tạo commit, phải kiểm tra danh sách file đã stage bằng lệnh:
  ```bash
  git diff --cached --name-only
  ```
  Và tự đối chiếu xem có dính file cấm nào không.

## 5. Files / Paths Never To Commit

Tuyệt đối cấm stage, commit hoặc push các file và thư mục sau:

### Tệp cấu hình & Credentials:
* `.env`, `.env.local`, `.env.*.local`
* Các tệp tin lưu trữ token, secrets, cookies, session, hoặc `storage_state` của Shopee/TikTok/Facebook.
* Đường dẫn hoặc dữ liệu của thư mục profile trình duyệt (browser profile paths).

### Dữ liệu tạm thời & Runtime:
* `data/temp/` (gồm `jobs/`, `debug/`, `studio/`, và `vfos_jobs_registry.json`).
* Thư mục chứa log chạy của pipeline: `runs/`.
* Các file nén hoặc lưu trữ cũ: `production/archive/`.

### Danh sách sản phẩm & Registry (Trừ khi được duyệt riêng cho task nhập liệu mẫu):
* `production/_commerce/shopee_link_registry.json`
* `production/_commerce/shopee_product_candidates.json`
* `production/_commerce/shopee_product_candidates_with_links.json`

### Biên dịch & Thư viện:
* `apps/studio/.next/`
* `node_modules/`
* `dist/` hoặc `coverage/`

### File nháp & Media của Agent:
* `walkthrough.md`, `implementation_plan.md`, `task.md`.
* Tệp handoff bắt đầu: `begin-prompt-vfos-partitioned-bubble.md`.
* Tất cả các file ảnh/video tự sinh hoặc test: `screenshots/`, `recordings/`, `videos/`, `*.webm`, `*.mp4`, `*.png`, `*.jpg`.

### Khóa bảo mật API cụ thể:
* OpenAI API key, ElevenLabs API key, Facebook Page Access Token, TikTok Client Secret.

### Tệp quản lý dependency:
* `package.json`, `pnpm-lock.yaml` (chỉ commit khi có yêu cầu cài đặt/nâng cấp thư viện cụ thể và được Operator duyệt riêng).

## 6. Runtime Registry Policy

Trong quá trình test các tính năng như trích xuất Shopee hay tạo Job, các tệp dữ liệu tạm hoặc registry thực tế sẽ tự động bị thay đổi.
* **Quy tắc**: Mọi thay đổi trên các tệp runtime này mặc định **không được đưa vào Git**. 
* **Kiểm soát mẫu thử**: Nếu cần lưu dữ liệu mẫu cho kiểm thử đơn vị (unit tests), hãy tạo các tệp fixture giả lập sạch sẽ tại thư mục test thích hợp, tuyệt đối không dùng và commit file registry thực tế của Operator.

## 7. Git Status Reporting Standard

Báo cáo cuối mỗi turn chat liên quan đến file hoặc Git phải hiển thị theo mẫu cấu trúc:
1. **Branch hiện tại**: (ví dụ: `master`)
2. **HEAD commit**: (mã hash commit hiện tại ở HEAD)
3. **Ahead/behind**: (trạng thái đồng bộ với remote)
4. **Trạng thái working tree**: (ghi rõ sạch hay bẩn)
5. **Modified files**: (danh sách tệp thay đổi chưa stage)
6. **Untracked files**: (danh sách tệp mới chưa track, phân loại rõ: *source file / skill file / doc file / runtime / media / unknown*)
7. **Staged files**: (danh sách tệp đã stage nếu có)
8. **Commit status**: (đã commit chưa)
9. **Push status**: (đã push chưa)

*Claude không được tuyên bố working tree sạch ("clean") nếu vẫn còn tệp tin untracked xuất hiện.*

## 8. Dirty Working Tree Policy

Nếu khi bắt đầu làm việc, `git status` báo working tree đang bẩn:
* Dừng lại và không sửa tiếp mã nguồn một cách mù quáng.
* Báo cáo cho Operator danh sách các file đang bẩn.
* Phân loại rõ các file bẩn: tệp cùng scope task, tệp thừa từ round trước, tệp runtime/gitignored, hay tệp nguy hiểm.
* Chỉ tiếp tục chỉnh sửa khi Operator cho phép.

Nếu phát hiện working tree liên tục bị tự động reset/revert:
> **Investigate the reverter first. Do not commit workaround just to protect changes unless Operator explicitly approves.**

Phải điều tra nguyên nhân tự động reset trước (tiến trình chạy ngầm, IDE tự discard, hooks của Claude, watcher scripts, hoặc kiểm tra `git reflog`), cấm tạo commit vội vã chỉ để "giữ code".

## 9. Commit Message Policy

Commit message phải tuân thủ convention rõ ràng:
* `feat(studio): <mô tả ngắn>`
* `fix(studio): <mô tả ngắn>`
* `docs(skills): <mô tả ngắn>`
* `docs: <mô tả ngắn>`
* `chore: <mô tả ngắn>`

*Nghiêm cấm sử dụng các thông điệp chung chung hoặc lười biếng như "update", "fix stuff", "changes", "wip".*

## 10. Push Verification

Sau khi thực hiện lệnh push, Claude phải xác minh lại trạng thái trên remote:
```bash
git status
git branch -r --contains <commit_hash>
git log --oneline origin/master..HEAD
```
Báo cáo rõ:
- Lệnh push có thành công hay không.
- Trực quan hóa việc `origin/master` đã chứa commit hash vừa push.
- Trạng thái ahead/behind hiện tại.
- Working tree đã sạch hoàn toàn chưa.
- Cam kết không có file cấm nào lọt lên remote.

## 11. Secret Leak Scan

Trước khi commit/push bất kỳ file nào có nguy cơ chứa cấu hình, Claude phải tự scan nội dung diff của file đó để đảm bảo không dính các khóa nhạy cảm:
`credential_token`, `mmp_pid`, `gads_t_sig`, `cookie`, `session`, `storage_state`, `access_token`, `client_secret`, các trường API Keys (`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`).

Nếu phát hiện bất kỳ chuỗi nhạy cảm nào trong file chuẩn bị commit, **dừng lại ngay lập tức và báo cáo Operator**.

## 12. Skills Commit Policy

Khi phát triển và lưu trữ các Claude skills:
* Chỉ stage và commit các file `SKILL.md` nằm đúng trong thư mục con tương ứng dưới `.claude/skills/*`.
* Không gom code ứng dụng chung vào commit của file skill trừ khi Operator yêu cầu rõ.
* Có thể commit riêng biệt từng skill hoặc gộp chung theo nhóm tùy theo yêu cầu của Operator.

## 13. Anti-patterns (Lỗi cần tránh)

* ❌ `git add .` hoặc `git add -A` vô tội vạ.
* ❌ Commit tệp runtime, registry thật chỉ vì thấy nó nằm trong danh sách `git status`.
* ❌ Vô tình commit các file nháp của agent (`walkthrough.md`, `task.md`, `implementation_plan.md`).
* ❌ Tự động push lên remote ngay sau khi commit mà không đợi Operator phê duyệt.
* ❌ Báo cáo working tree sạch khi vẫn còn file untracked chưa xử lý.
* ❌ Tạo commit tạm chỉ để đối phó với hiện tượng tự động reset/revert tệp tin.
* ❌ Sửa đổi dependencies trong `package.json` mà không có sự đồng ý của Operator.
* ❌ Bỏ qua bước kiểm tra `git diff --cached --name-only` trước khi commit.

## 14. Correct Final Report For Commit Tasks

### Mẫu báo cáo sau khi Commit:
1. **Commit Hash**: <hash>
2. **Commit Message**: <message>
3. **Files Committed**: <danh sách file>
4. **Git Status sau commit**: <kết quả status>
5. **Ahead/behind status**: (ví dụ: `ahead 1`)
6. **Xác nhận an toàn**: *Cam kết không có file cấu hình/runtime nhạy cảm nào bị commit.*
7. **Xác nhận push**: *Chưa push lên remote, chờ phê duyệt.*

### Mẫu báo cáo sau khi Push:
1. **Kết quả Push**: <Thành công / Thất bại>
2. **Commit Hash đã đẩy**: <hash>
3. **Xác nhận trên remote**: *origin/master đã chứa commit <hash>.*
4. **Git Status sau push**: <kết quả status>
5. **Ahead/behind status**: (ví dụ: `sync 0/0`)
6. **Xác nhận an toàn**: *Cam kết không có file cấm nào lọt lên remote.*
