/* =============================================================================
 * VFOS Studio — server startup instrumentation
 * -----------------------------------------------------------------------------
 * `next dev` chạy với cwd = apps/studio và KHÔNG tự nạp .env Ở GỐC monorepo, nên
 * route handlers (đọc process.env.TIKTOK_* / FACEBOOK_* …) có thể không thấy biến.
 * Nạp .env gốc một lần lúc server khởi động — ADDITIVE: KHÔNG ghi đè biến đã set
 * (shell/CI ưu tiên), KHÔNG đọc dòng comment, KHÔNG in giá trị. Chỉ Node runtime.
 * ========================================================================== */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { readFileSync, existsSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const envPath = resolve(process.cwd(), '../../.env');
    if (!existsSync(envPath)) return;
    const content = readFileSync(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const m = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue; // bỏ comment (#...) và dòng rỗng
      const key = m[1];
      if (process.env[key] !== undefined) continue; // KHÔNG ghi đè biến đã có
      let val = (m[2] ?? '').trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {
    /* .env vắng/định dạng lạ — bỏ qua; route tự báo NOT_CONFIGURED */
  }
}
