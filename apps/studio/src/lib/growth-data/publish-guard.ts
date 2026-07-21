/* =============================================================================
 * VFOS Studio — Guard chung cho 4 route publish live (Phần 82 R-F hardening).
 * Gắn vào CẢ 4 cửa đăng thật: review→tiktok, ent→facebook (target hiện tại) +
 * ent→tiktok, review→facebook (target swap-out/rollback vẫn POST được + có nút UI).
 * -----------------------------------------------------------------------------
 * Đóng 2 lỗ Fable 5 chỉ ra ở route đăng thật (localhost):
 *  1) HALT không chặn route: phanh tầng 1 (publish-halt.json) trước chỉ dừng máy tick,
 *     route publish (tick POST + UI bấm tay) vẫn đăng. isPublishHalted() cho route đọc
 *     CÙNG file halt → halt = đóng băng CẢ đăng tự động lẫn tay.
 *  2) Route = "nút đăng không auth": khi .env server đã live, mọi POST local đúng URL
 *     đều đăng. tickKeyOk() là cổng shared-secret OPT-IN: chỉ bật khi VFOS_TICK_KEY set;
 *     miễn cho UI browser same-origin, đòi header cho caller lập trình (tick/curl).
 * Studio decoupled scripts/ tree → đọc lại file runtime, KHÔNG import publish-store.
 * ========================================================================== */

import { existsSync, readFileSync } from 'node:fs';
import { resolveInsideRepo } from '@/lib/studio-data/paths';

const HALT_REL = 'data/growth/runtime/publish-halt.json';

/**
 * Phanh tổng có đang bật? File tồn tại và `active !== false` → HALT (khớp isHalted của
 * máy tick). Fail-safe: file hỏng → coi HALT. Thiếu file → không halt.
 */
export function isPublishHalted(): boolean {
  const p = resolveInsideRepo(HALT_REL);
  if (!p || !existsSync(p)) return false;
  try {
    const obj = JSON.parse(readFileSync(p, 'utf8')) as { active?: unknown };
    return obj?.active !== false;
  } catch {
    return true;
  }
}

/**
 * Cổng shared-secret OPT-IN cho route publish. Cho qua (true) khi:
 *  - `VFOS_TICK_KEY` chưa set (mặc định — KHÔNG đổi hành vi cũ), HOẶC
 *  - request là browser same-origin (UI bấm tay — `Sec-Fetch-Site: same-origin`), HOẶC
 *  - header `X-VFOS-TICK-KEY` khớp `VFOS_TICK_KEY`.
 * Chặn (false) khi key đã set + KHÔNG phải browser same-origin + header sai/thiếu — đóng
 * "route = nút đăng không auth" với process local lạ / curl, KHÔNG cản UI publish tay.
 */
export function tickKeyOk(req: Request): boolean {
  const key = (process.env.VFOS_TICK_KEY ?? '').trim();
  if (!key) return true;
  if ((req.headers.get('sec-fetch-site') ?? '') === 'same-origin') return true;
  return (req.headers.get('x-vfos-tick-key') ?? '') === key;
}
