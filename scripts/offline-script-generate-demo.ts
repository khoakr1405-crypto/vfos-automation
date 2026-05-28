/**
 * Offline Script Generator Helper Script — Round P12.
 *
 * Simulates a content generator step, producing script_artifact.json content.
 * Supports simulating pass vs script-fail modes.
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
console.log(`[OfflineScriptGen] Generating script artifact to: ${outputPath}`);

let scriptContent = '';

if (mode === 'script-fail') {
  // Generate script containing banned word "scam product" to trigger ScriptGuard
  scriptContent = 'Chào mừng bạn đến với kênh review của VFOS. Hôm nay chúng tôi review một sản phẩm cực kỳ đáng ngờ. Đây là một scam product mà bạn nên tránh xa, đừng bấm vào bất kỳ fake link nào!';
} else {
  // Generate valid review script
  scriptContent = 'Chào mừng bạn đến với VFOS Review. Hôm nay mình test nhanh một sản phẩm gia dụng thông minh, nhìn đơn giản nhưng rất hữu ích trong sinh hoạt hằng ngày. Điểm đáng chú ý là thiết kế gọn, dễ dùng và phù hợp cho không gian gia đình. Nếu bạn đang tìm một món tiện ích nhỏ để tối ưu việc nhà, đây là lựa chọn đáng cân nhắc.';
}

const payload = {
  script: scriptContent,
  generatedAt: new Date().toISOString(),
  offlineMode: mode,
};

try {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log('[OfflineScriptGen] Script artifact written successfully.');
  process.exit(0);
} catch (err: any) {
  console.error(`ERROR: Failed to write script artifact: ${err.message}`);
  process.exit(1);
}
