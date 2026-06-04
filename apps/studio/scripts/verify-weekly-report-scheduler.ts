import { execSync } from 'node:child_process';

function main() {
  console.log('=== VFOS Growth OS: Weekly Report Automation Verifier ===\n');

  // 1. Check dry-run execution
  console.log('[1/3] Kiểm tra CLI dry-run...');
  try {
    const dryRunOutput = execSync('pnpm growth:weekly-report --dry-run', { encoding: 'utf8' });
    if (dryRunOutput.includes('Báo cáo được sinh trong memory thành công')) {
      console.log('  ✅ CLI dry-run chạy thử thành công.');
    } else {
      console.error('  ❌ CLI dry-run đầu ra không như mong đợi.');
      process.exit(1);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('  ❌ Lỗi khi thực thi CLI dry-run:', msg);
    process.exit(1);
  }

  // 2. Check gitignored reports
  console.log('\n[2/3] Kiểm tra Gitignore cho thư mục reports/weekly...');
  const testPath = 'data/growth/runtime/reports/weekly/TEST_SCHEDULER.json';
  try {
    const gitCheck = execSync(`git check-ignore ${testPath}`, { encoding: 'utf8', stdio: 'pipe' });
    if (gitCheck.trim().includes(testPath)) {
      console.log('  ✅ Thư mục reports/weekly đã được cấu hình Gitignore chính xác.');
    } else {
      console.error('  ❌ Cảnh báo: Thư mục reports/weekly chưa được bỏ qua trong Git.');
      process.exit(1);
    }
  } catch {
    // Git check-ignore returns exit code 1 if not ignored
    console.error('  ❌ Cảnh báo: Thư mục reports/weekly chưa được bỏ qua trong Git.');
    process.exit(1);
  }

  // 3. Print Scheduler Command Guide
  console.log('\n[3/3] Hướng dẫn cấu hình Windows Task Scheduler:');
  const repoPath = process.cwd();
  console.log('--------------------------------------------------');
  console.log('Lịch chạy đề xuất:  Mỗi thứ Hai hằng tuần vào lúc 08:00 sáng');
  console.log(`Đường dẫn Repo:     ${repoPath}`);
  console.log('--------------------------------------------------');
  console.log('Các bước tạo Task thủ công trên Windows:');
  console.log("1. Nhấn Win + R, nhập 'taskschd.msc' và nhấn Enter.");
  console.log("2. Chọn 'Create Basic Task...' từ menu Actions ở cột bên phải.");
  console.log("3. Nhập Tên: 'VFOS Weekly Growth Report Automation'.");
  console.log("4. Chọn Trigger: 'Weekly', ấn Next.");
  console.log("5. Thiết lập thời gian bắt đầu, tick chọn thứ Hai ('Monday'), Giờ: '08:00:00'.");
  console.log("6. Chọn Action: 'Start a program', ấn Next.");
  console.log("7. Nhập Program/script: 'cmd.exe'.");
  console.log(`8. Nhập Add arguments: '/c cd /d "${repoPath}" && pnpm growth:weekly-report'`);
  console.log(`9. Nhập Start in: '${repoPath}'`);
  console.log('10. Nhấn Finish để hoàn tất.');
  console.log('--------------------------------------------------');
  console.log('✅ Xác minh hoàn tất. Hệ thống sẵn sàng cho tự động hóa lập lịch.');
}

main();
