// Manual evaluation harness for agents.voe.evaluate.
// Dataset: docs/VOE_TEST_DATASET_V1.md
// Usage:   pnpm voe:eval
// Requires: ANTHROPIC_API_KEY in env (exits with error if missing — no mock fallback).

import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { AIRouter } from './ai/router.js';
import { BudgetGuard } from './ai/budget.js';
import { DriverRegistry } from './drivers/registry.js';
import { AnthropicDriver } from './drivers/anthropic.js';
import { makeVoeSyscalls } from './syscalls/voe.js';
import { setupTelemetry, shutdownTelemetry } from './telemetry/setup.js';
import type { SyscallContext } from '@vfos/sdk';

interface VoeInput {
  source_url: string;
  platform: 'tiktok' | 'douyin' | 'youtube';
  niche: string;
  metadata: { title: string; description: string; transcript: string; tags: string[] };
  engagement: { views: number; likes: number; shares?: number };
}

interface EvalCase {
  id: string;
  name: string;
  expected: 'PROCEED' | 'SKIP';
  input: VoeInput;
}

interface VoeResult {
  vi_evaluation: { score: number; confidence: number; verdict: string };
  cost_cents: number;
}

// 10 cases from docs/VOE_TEST_DATASET_V1.md
const CASES: EvalCase[] = [
  {
    id: 'case_01',
    name: 'Máy giặt tất/đồ lót mini',
    expected: 'PROCEED',
    input: {
      source_url: 'https://douyin.com/video/12345_washing',
      platform: 'douyin',
      niche: 'gia dụng thông minh',
      metadata: {
        title: 'Máy giặt mini gấp gọn tiện lợi mang đi du lịch',
        description: 'Không còn phải giặt tay đồ lót nữa. Máy giặt mini gấp gọn tiện lợi.',
        transcript:
          'Mỗi ngày về nhà mệt mỏi, không muốn giặt tất? Nhìn đây, chỉ cần thả vào, bật nút, 5 phút sau sạch bong.',
        tags: ['miniwashingmachine', 'homegadget', 'lazylife'],
      },
      engagement: { views: 2500000, likes: 120000, shares: 15000 },
    },
  },
  {
    id: 'case_02',
    name: 'Chai xịt tẩy bẩn nhà bếp siêu tốc',
    expected: 'PROCEED',
    input: {
      source_url: 'https://tiktok.com/@cleaningsatis/video/999',
      platform: 'tiktok',
      niche: 'vệ sinh nhà cửa',
      metadata: {
        title: 'Magic Kitchen Cleaner Spray #cleantok',
        description: 'Xóa bay vết dầu mỡ 10 năm tuổi trên chảo chỉ với 1 lần xịt.',
        transcript:
          'Cái chảo này tôi định vứt đi rồi. Nhưng xem này, xịt lên, đợi 30 giây... lau nhẹ một cái. Tuyệt vời!',
        tags: ['cleantok', 'satisfying', 'kitchenhack'],
      },
      engagement: { views: 5000000, likes: 850000, shares: 60000 },
    },
  },
  {
    id: 'case_03',
    name: 'Sạc dự phòng MagSafe từ tính',
    expected: 'PROCEED',
    input: {
      source_url: 'https://douyin.com/video/magsafe_power',
      platform: 'douyin',
      niche: 'gadget nhỏ',
      metadata: {
        title: 'Sạc dự phòng Magsafe nhỏ gọn, hít cực chặt, không lo dây dợ lằng nhằng',
        description: 'Ra đường quên mang cáp sạc? Cục sạc này hít một phát là sạc ngay.',
        transcript:
          'Ra đường quên mang cáp sạc? Cục sạc này hít một phát là sạc ngay. Lắc mạnh cũng không rơi.',
        tags: ['iphone', 'powerbank', 'techreview'],
      },
      engagement: { views: 1800000, likes: 95000, shares: 8000 },
    },
  },
  {
    id: 'case_04',
    name: 'Mặt nạ lột mụn đầu đen',
    expected: 'PROCEED',
    input: {
      source_url: 'https://tiktok.com/@beautytips/video/skincare1',
      platform: 'tiktok',
      niche: 'mỹ phẩm đơn giản',
      metadata: {
        title: 'Blackhead removal magic peel',
        description: 'Đánh bay mụn đầu đen vùng mũi chỉ sau 15 phút.',
        transcript:
          'Mũi đầy mụn đầu đen nhìn rất mất thẩm mỹ. Bôi lớp gel này lên, đắp giấy dán, đợi khô và... ái chà, nhìn đống mụn được rút ra này.',
        tags: ['skincare', 'blackhead', 'peeloff'],
      },
      engagement: { views: 8000000, likes: 1200000, shares: 95000 },
    },
  },
  {
    id: 'case_05',
    name: 'Dụng cụ gọt và bổ dứa/thơm siêu tốc',
    expected: 'PROCEED',
    input: {
      source_url: 'https://douyin.com/video/pineapple_cutter',
      platform: 'douyin',
      niche: 'tiện ích nhà bếp',
      metadata: {
        title: 'Chỉ mất 10 giây để lấy sạch ruột dứa nguyên vòng',
        description: 'Dụng cụ gọt dứa thông minh, ấn xuống xoay tròn kéo lên xong ngay.',
        transcript:
          'Ăn dứa ngại nhất là khâu gọt mắt. Dùng cái lõi này, ấn xuống, xoay tròn, kéo lên. Xong! Vừa sạch vừa đẹp.',
        tags: ['kitchenhack', 'fruitcutter', 'smarttools'],
      },
      engagement: { views: 3200000, likes: 210000, shares: 45000 },
    },
  },
  {
    id: 'case_06',
    name: 'Tiểu phẩm hài chơi chữ địa phương',
    expected: 'SKIP',
    input: {
      source_url: 'https://douyin.com/video/comedy_wordplay',
      platform: 'douyin',
      niche: 'giải trí/hài hước',
      metadata: {
        title: 'Hài hước: hiểu nhầm từ lóng giữa sếp và nhân viên',
        description: 'Tranh cãi hài hước giữa sếp và nhân viên vì hiểu nhầm nghĩa từ.',
        transcript:
          'Sếp bảo tôi đi mua "Bao Tử" (Bánh bao), tôi lại mua "Bao Tử" (Túi xách). Hai chữ đọc giống hệt nhau mà!',
        tags: ['comedy', 'office', 'wordplay'],
      },
      engagement: { views: 10000000, likes: 2000000, shares: 300000 },
    },
  },
  {
    id: 'case_07',
    name: 'Hướng dẫn săn mã giảm giá Taobao nội địa',
    expected: 'SKIP',
    input: {
      source_url: 'https://douyin.com/video/taobao_hack',
      platform: 'douyin',
      niche: 'mẹo vặt',
      metadata: {
        title: 'Cách lấy mã giảm giá nội bộ 50% trên Taobao',
        description: 'Hướng dẫn săn coupon ẩn trên Taobao mà ít người biết.',
        transcript:
          'Các bạn mua hàng Taobao đừng ấn thanh toán vội. Bấm vào góc phải, copy link này, dán qua app X sẽ thấy mã giảm 50 tệ.',
        tags: ['taobao', 'coupon', 'savingmoney'],
      },
      engagement: { views: 800000, likes: 50000, shares: 12000 },
    },
  },
  {
    id: 'case_08',
    name: 'Máy làm mì tươi công nghiệp công suất lớn',
    expected: 'SKIP',
    input: {
      source_url: 'https://tiktok.com/@machinery/video/pastamaker',
      platform: 'tiktok',
      niche: 'thiết bị bếp công nghiệp',
      metadata: {
        title: 'Industrial Pasta Machine 500kg/h',
        description: 'Dây chuyền sản xuất mì tươi công nghiệp hoàn toàn tự động.',
        transcript:
          'Đổ 500kg bột vào đây, máy sẽ tự động trộn nước, nhào nặn và đùn ra hàng ngàn vắt mì mỗi giờ.',
        tags: ['industrial', 'pastamachine', 'factory'],
      },
      engagement: { views: 450000, likes: 15000, shares: 1000 },
    },
  },
  {
    id: 'case_09',
    name: 'Phân tích khoa học Retinol hàn lâm',
    expected: 'SKIP',
    input: {
      source_url: 'https://youtube.com/shorts/retinol_science',
      platform: 'youtube',
      niche: 'chăm sóc da',
      metadata: {
        title: 'The Science of Retinoids at Molecular Level',
        description: 'Cơ chế hoạt động của Retinol trên tế bào sừng.',
        transcript:
          'Khi Retinol thâm nhập vào lớp biểu bì, nó sẽ liên kết với các thụ thể RAR và RXR, từ đó kích hoạt quá trình phiên mã gene...',
        tags: ['dermatology', 'science', 'skincare'],
      },
      engagement: { views: 120000, likes: 4000, shares: 150 },
    },
  },
  {
    id: 'case_10',
    name: 'Review bún ốc Liễu Châu đặc sản nội địa',
    expected: 'SKIP',
    input: {
      source_url: 'https://douyin.com/video/luosifen_review',
      platform: 'douyin',
      niche: 'review ẩm thực',
      metadata: {
        title: 'Thử thách ăn bún ốc Liễu Châu mùi cực nồng',
        description: 'Thử thách ăn bún ốc Liễu Châu mùi cực nồng.',
        transcript:
          'Mùi của nó thoang thoảng như mùi rác, nhưng ăn vào thì... wow, măng chua quá đỉnh, nước dùng cay xé lưỡi.',
        tags: ['foodreview', 'luosifen', 'spicy'],
      },
      engagement: { views: 2100000, likes: 180000, shares: 22000 },
    },
  },
];

const SEP = '═'.repeat(52);

async function main(): Promise<void> {
  setupTelemetry();
  const cfg = loadConfig();

  if (!cfg.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY is required for VOE evaluation.');
    console.error('Set it in your .env file or shell and retry. No mock fallback.');
    process.exit(1);
  }

  const logger = createLogger(cfg);
  const drivers = new DriverRegistry(logger);
  drivers.register(new AnthropicDriver(cfg.ANTHROPIC_API_KEY));
  // No MockLLMDriver — intentionally omitted so any key/network error surfaces immediately.

  const budget = new BudgetGuard(logger, { defaultDailyCeilingUsd: cfg.BUDGET_DAILY_USD });
  // No fallbackDriver — ensures anthropic driver must be present.
  const router = new AIRouter(drivers, budget, logger);
  const [voeEvaluate] = makeVoeSyscalls(router);

  const ctx: SyscallContext = {
    tenant_id: cfg.TENANT_DEFAULT_ID,
    caller: 'voe-eval-cli',
    trace_id: `eval-${Date.now()}`,
    logger,
  };

  console.log(`\nVOE Manual Evaluation — ${CASES.length} cases`);
  console.log(SEP);

  type ResultRow = {
    id: string;
    name: string;
    expected: string;
    actual: string;
    score: number;
    confidence: number;
    match: boolean;
    latency_ms: number;
    cost_cents: number;
    error?: string;
  };

  const rows: ResultRow[] = [];

  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i]!;
    console.log(`\n[${i + 1}/${CASES.length}] ${c.id} — ${c.name}`);
    console.log(`  Platform : ${c.input.platform}  |  Niche: ${c.input.niche}`);
    console.log(`  Expected : ${c.expected}`);

    const start = performance.now();
    try {
      const res = (await voeEvaluate.handler(ctx, c.input)) as VoeResult;
      const ms = Math.round(performance.now() - start);
      const actual = res.vi_evaluation.verdict as 'PROCEED' | 'SKIP';
      const match = actual === c.expected;

      console.log(`  Actual   : ${actual}  ${match ? '✓' : '✗ MISMATCH'}`);
      console.log(
        `  Score    : ${res.vi_evaluation.score}  Confidence: ${res.vi_evaluation.confidence}`,
      );
      console.log(`  Latency  : ${ms}ms  Cost: ${res.cost_cents}¢`);

      rows.push({
        id: c.id,
        name: c.name,
        expected: c.expected,
        actual,
        score: res.vi_evaluation.score,
        confidence: res.vi_evaluation.confidence,
        match,
        latency_ms: ms,
        cost_cents: res.cost_cents,
      });
    } catch (err) {
      const ms = Math.round(performance.now() - start);
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ERROR    : ${msg}`);
      rows.push({
        id: c.id,
        name: c.name,
        expected: c.expected,
        actual: 'ERROR',
        score: 0,
        confidence: 0,
        match: false,
        latency_ms: ms,
        cost_cents: 0,
        error: msg,
      });
    }
  }

  const matched = rows.filter((r) => r.match).length;
  const mismatched = rows.length - matched;
  const totalCost = rows.reduce((s, r) => s + r.cost_cents, 0);
  const totalMs = rows.reduce((s, r) => s + r.latency_ms, 0);

  console.log(`\n${SEP}`);
  console.log('VOE Evaluation Summary');
  console.log(SEP);
  console.log(`  Cases      : ${rows.length}`);
  console.log(`  ✓ Match    : ${matched}`);
  console.log(`  ✗ Mismatch : ${mismatched}`);
  console.log(`  Total cost : ${totalCost}¢`);
  console.log(`  Total time : ${(totalMs / 1000).toFixed(1)}s`);
  console.log(SEP);

  if (mismatched > 0) {
    console.log('\nMismatched cases:');
    for (const r of rows.filter((x) => !x.match)) {
      console.log(
        `  ${r.id}  expected=${r.expected}  actual=${r.actual}${r.error ? `  err=${r.error.slice(0, 80)}` : ''}`,
      );
    }
  }

  await shutdownTelemetry();
  process.exit(mismatched > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
