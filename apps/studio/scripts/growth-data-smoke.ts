/* =============================================================================
 * VFOS Studio — Growth OS data model smoke test (Round Growth 02)
 * -----------------------------------------------------------------------------
 * Chạy: pnpm growth:smoke   (= tsx apps/studio/scripts/growth-data-smoke.ts)
 * Đặt trong apps/studio để cùng module system (CJS) với growth-data modules —
 * tránh ESM→CJS named-export flakiness khi chạy từ root scripts/.
 * KHÔNG gọi API, KHÔNG ghi file, KHÔNG đụng pipeline — chỉ load fixtures + validate.
 *
 * PASS khi cả 5 nhóm đều sạch:
 *   1. Tất cả entity load không throw (mỗi entity có dữ liệu).
 *   2. No secret fields (quét cả key lẫn value).
 *   3. Referential integrity hợp lệ.
 *   4. Enum intent hợp lệ + safe-auto vs escalate phân tách rõ.
 *   5. AffiliateCtaPlan integrity: vai trò slot + ctaMode + readiness khớp rule.
 * ========================================================================== */

import { loadGrowthSnapshot } from '../src/lib/growth-data/load';
import {
  checkCtaPlanIntegrity,
  checkIntentTaxonomy,
  checkReferentialIntegrity,
  findSecretViolations,
  intentTaxonomy,
} from '../src/lib/growth-data/validate';

function printSection(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function main(): number {
  const snap = loadGrowthSnapshot();
  let failed = false;

  const counts: Array<[string, number]> = [
    ['channels', snap.channels.length],
    ['contentAngles', snap.contentAngles.length],
    ['postingPlans', snap.postingPlans.length],
    ['publishedPosts', snap.publishedPosts.length],
    ['performanceMetrics', snap.performanceMetrics.length],
    ['commentItems', snap.commentItems.length],
    ['commentIntents', snap.commentIntents.length],
    ['replyTemplates', snap.replyTemplates.length],
    ['commentActionLog', snap.commentActionLog.length],
    ['affiliateCtaPlans', snap.affiliateCtaPlans.length],
    ['learningSignals', snap.learningSignals.length],
    ['growthRecommendations', snap.growthRecommendations.length],
  ];

  // 1) Entity load
  printSection('1) Entity load (tất cả entity không throw)');
  let loaded = 0;
  for (const [name, n] of counts) {
    const ok = n > 0;
    if (ok) loaded += 1;
    else failed = true;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(22)} ${n} record`);
  }
  console.log(`  → ${loaded}/${counts.length} entity có dữ liệu (source=${snap.source})`);
  if (loaded !== counts.length) failed = true;

  // 2) No secret fields
  printSection('2) No secret fields (quét key + value)');
  const secretViolations = findSecretViolations(snap);
  if (secretViolations.length === 0) {
    console.log('  OK   0 vi phạm token/secret/credential/cookie/authorization/bearer');
  } else {
    failed = true;
    for (const v of secretViolations) console.log(`  FAIL ${v}`);
  }

  // 3) Referential integrity
  printSection('3) Referential integrity');
  const refErrors = checkReferentialIntegrity(snap);
  if (refErrors.length === 0) {
    console.log('  OK   mọi quan hệ tham chiếu hợp lệ');
  } else {
    failed = true;
    for (const e of refErrors) console.log(`  FAIL ${e}`);
  }

  // 4) Intent taxonomy
  printSection('4) Intent taxonomy (enum + safe vs escalate)');
  const taxErrors = checkIntentTaxonomy(snap);
  const { safeAuto, escalate } = intentTaxonomy();
  const safeCount = snap.commentIntents.filter((c) => c.isSafeForAuto).length;
  const escalateCount = snap.commentIntents.length - safeCount;
  console.log(`  Safe-auto intents:  ${safeAuto.join(', ')}`);
  console.log(`  Escalate intents:   ${escalate.join(', ')}`);
  console.log(`  Fixtures: ${safeCount} safe-auto / ${escalateCount} escalate`);
  if (taxErrors.length === 0) {
    console.log('  OK   enum hợp lệ + isSafeForAuto khớp taxonomy');
  } else {
    failed = true;
    for (const e of taxErrors) console.log(`  FAIL ${e}`);
  }

  // 5) Affiliate CTA plan integrity + readiness theo ctaMode
  printSection('5) AffiliateCtaPlan (vai trò slot + ctaMode + readiness rule)');
  const modeCounts = new Map<string, number>();
  const readinessCounts = new Map<string, number>();
  for (const plan of snap.affiliateCtaPlans) {
    modeCounts.set(plan.ctaMode, (modeCounts.get(plan.ctaMode) ?? 0) + 1);
    readinessCounts.set(plan.readiness, (readinessCounts.get(plan.readiness) ?? 0) + 1);
  }
  const fmt = (m: Map<string, number>): string =>
    [...m.entries()].map(([k, v]) => `${k}=${v}`).join(', ');
  console.log(`  Modes:     ${fmt(modeCounts) || '(none)'}`);
  console.log(`  Readiness: ${fmt(readinessCounts) || '(none)'}`);
  const ctaErrors = checkCtaPlanIntegrity(snap);
  if (ctaErrors.length === 0) {
    console.log('  OK   slot roles + ctaMode hợp lệ, readiness khớp computeCtaReadiness');
  } else {
    failed = true;
    for (const e of ctaErrors) console.log(`  FAIL ${e}`);
  }

  printSection('KẾT QUẢ');
  console.log(failed ? '  ❌ SMOKE FAIL' : '  ✅ SMOKE PASS');
  return failed ? 1 : 0;
}

process.exit(main());
