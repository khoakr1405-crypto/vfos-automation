/**
 * Offline Script Generator Helper Script — Round P12 + P30 ChatGPT Style.
 *
 * Simulates a content generator step, producing script_artifact.json content.
 * Integrates Vietnamese youth slang, trendiness, and humor with strict safety guardrails.
 *
 * Command: tsx scripts/offline-script-generate-demo.ts --output <path> [--mode <mode>]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

// Parse command-line parameters
let values: any;
try {
  const parsed = parseArgs({
    options: {
      output: { type: 'string' },
      mode: { type: 'string', default: 'pass' },
    },
    allowPositionals: false,
    strict: true,
  });
  values = parsed.values;
} catch (err: any) {
  console.error(`ERROR: Failed to parse arguments: ${err.message}`);
  process.exit(1);
}

if (!values.output) {
  console.error('ERROR: Mandatory option "--output <path>" is missing.');
  process.exit(1);
}

const outputPath = values.output;
const mode = values.mode;

console.log(`[OfflineScriptGen] Mode: ${mode}`);
console.log(`[OfflineScriptGen] Active GPT Prompts: Infusing humor, youth slang, and trend-focused storytelling.`);
console.log(`[OfflineScriptGen] Guardrails: Active (exaggeration blocked, specification truth checked).`);

let hook3s = '';
let voiceover = '';
let captionDraft = '';
let hashtags: string[] = [];
let productSafetyNotes = '';
let scriptContent = '';

if (mode === 'script-fail') {
  // Banned word "scam product" to trigger ScriptGuard
  hook3s = 'Báo động đỏ! Tránh xa cái sản phẩm đáng ngờ này ra nhé mọi người!';
  voiceover = 'Chào mọi người, hôm nay VFOS bóc phốt cái sản phẩm này. Đây thực sự là một scam product lừa đảo chất lượng kém, đừng bấm vào bất kỳ fake link nào!';
  captionDraft = 'Cảnh báo lừa đảo toàn tập từ VFOS! Không bấm link nhé cả nhà!';
  hashtags = ['#scam', '#avoid', '#vfosalert'];
  productSafetyNotes = 'Khuyến cáo tránh xa sản phẩm để bảo vệ quyền lợi.';
} else {
  // Humorous, moderately bold, trending youth slang script
  hook3s = 'Ê khoan lướt qua nha, lướt qua là tiếc hùi hụi cả đời luôn á! Siêu phẩm cập bến đây!';
  voiceover = 'Hế lô cả nhà yêu của VFOS! Hôm nay mình lên sóng review một em bảo bối gia dụng xịn đét con bà lẹt. Thiết kế thì cưng xỉu, nhỏ gọn đặt đâu cũng thấy sang xịn mịn hết nấc. Em này giúp tiết kiệm thời gian đỉnh chóp, đúng nghĩa là chân ái cứu rỗi cho những ngày lười biếng của hội lười đây rồi. Hiệu năng ao trình phân khúc luôn nhé, không sắm một em là hơi bị phí à nha!';
  captionDraft = 'Cứu rỗi những ngày lười với siêu phẩm gia dụng xịn xò nhất vũ trụ! 💖 Click lấy link chính hãng ngay bên dưới cả nhà ơi!';
  hashtags = ['#vfos', '#reviewchat', '#giadungthongminh', '#xinxo', '#hotrend', '#shortvideo'];
  productSafetyNotes = 'Vui lòng đọc kỹ hướng dẫn sử dụng đi kèm. Tránh tiếp xúc bộ nguồn trực tiếp với nước để đảm bảo an toàn tuyệt đối.';
}

// Flat text representation for backward compatibility with older pipeline steps
scriptContent = `[HOOK 3S]: ${hook3s}\n[VOICEOVER]: ${voiceover}\n[CAPTION]: ${captionDraft}\n[HASHTAGS]: ${hashtags.join(' ')}\n[SAFETY]: ${productSafetyNotes}`;

const payload = {
  hook3s,
  voiceover,
  captionDraft,
  hashtags,
  productSafetyNotes,
  script: scriptContent,
  generatedAt: new Date().toISOString(),
  offlineMode: mode,
};

try {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log('[OfflineScriptGen] Trendy and humorous script artifact written successfully.');
  process.exit(0);
} catch (err: any) {
  console.error(`ERROR: Failed to write script artifact: ${err.message}`);
  process.exit(1);
}
