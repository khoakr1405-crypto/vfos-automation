// VI script prompt builder — di trú từ scripts/job-manager/commands/script.ts
// (visionPromptContext L187–231 + prompt L233–261). Zero behavior change:
// nội dung template + interpolation giữ nguyên byte, chỉ gói thành hàm thuần.

import type { PromptInput, VisionAnalysis } from './types.js';

export function buildScriptPrompt(input: PromptInput): string {
  const { productName, sourceVideoDurationSec, targetVoiceDurationSec, targetWordCount } = input;
  // Pace-aware: từ/giây theo provider (mặc định 2.5 = edge, giữ hành vi cũ).
  const wordsPerSec = input.wordsPerSec ?? 2.5;

  let visionPromptContext = '';
  const analysis: VisionAnalysis | undefined = input.visionArtifact?.analysis;
  if (analysis) {
    const visibleScenes = (analysis.visibleScenes || []).join(', ');
    const keyFeatures = (analysis.keyVisualFeatures || []).join(', ');
    const demonstratedFeatures = (analysis.demonstratedFeatures || []).join(', ');
    const scriptHints = (analysis.scriptHints || []).join(', ');
    const mismatchWarnings = (analysis.mismatchWarnings || []).join(', ');
    const lowQuality = (analysis.unsafeOrLowQualitySignals || []).join(', ');
    const productConfidence = analysis.productConfidence ?? 1.0;
    const mainProductVisible = analysis.mainProductVisible ?? true;

    visionPromptContext = `
--- THÔNG TIN HÌNH ẢNH THỰC TẾ TRONG VIDEO NGUỒN (VIDEO VISUAL ANALYSIS) ---
- Sản phẩm chính hiển thị rõ trong video? ${mainProductVisible ? 'Có' : `Không (Độ tin cậy: ${productConfidence})`}
- Cảnh quay thực tế được nhìn thấy (visibleScenes): ${visibleScenes}
- Các đặc điểm hình ảnh chính (keyVisualFeatures): ${keyFeatures}
- Các tính năng đang được demo trực quan (demonstratedFeatures): ${demonstratedFeatures}
- Các lưu ý/hints viết kịch bản từ hình ảnh (scriptHints): ${scriptHints}
- Cảnh báo lỗi/không đồng nhất (mismatchWarnings): ${mismatchWarnings}
- Tín hiệu chất lượng kém/low quality (unsafeOrLowQualitySignals): ${lowQuality}

YÊU CẦU GROUNDING VỚI HÌNH ẢNH:
${
  !mainProductVisible || productConfidence < 0.5
    ? `* CẢNH BÁO: Độ hiển thị sản phẩm rất thấp trong video! Bạn KHÔNG được viết kịch bản quá phóng đại kiểu "nhìn là mê ngay", "đây là chiếc quạt" mà hãy tập trung viết lời thoại khéo léo, mang tính mô tả chung chung.`
    : ''
}
${
  mismatchWarnings.trim()
    ? `* KHÔNG ĐƯỢC nhấn mạnh hay nói quá sâu về các tính năng sau đây vì chúng KHÔNG có thực tế hoặc bị không đồng nhất trong video: ${mismatchWarnings}`
    : ''
}
${
  demonstratedFeatures.trim()
    ? `* ƯU TIÊN nhắc đến và nói nổi bật về các tính năng đang được demo trực quan này: ${demonstratedFeatures}`
    : ''
}
${
  scriptHints.trim()
    ? `* Hãy cố gắng kết hợp các ý hints viết kịch bản này vào nội dung lời thoại: ${scriptHints}`
    : ''
}
`;
  }

  const prompt = `
Bạn là một AI chuyên viết kịch bản review sản phẩm ngắn cho kênh TikTok/Reels triệu view của VFOS.
Hãy viết kịch bản cho sản phẩm sau đây:
- Tên sản phẩm: "${productName}"
- Thời lượng video nguồn: ${sourceVideoDurationSec.toFixed(1)} giây.
- Thời lượng lời thoại mục tiêu (targetDurationSec): ${targetVoiceDurationSec.toFixed(1)} giây.
- Số từ mục tiêu (targetWordCount): khoảng ${targetWordCount} từ.
${visionPromptContext}

Yêu cầu kịch bản bắt buộc:
1. Ngôn ngữ: Tiếng Việt tự nhiên, hài hước, vui vẻ, táo bạo vừa phải, bắt trend giới trẻ tự nhiên. Không dùng câu từ sáo rỗng hoặc quá máy móc.
2. Không nói quá sự thật, không mang tính phản cảm.
3. Không lặp hook hoặc các câu nói/cụm từ lặp lại.
4. Tránh lặp lại tên sản phẩm đầy đủ quá nhiều lần. Thay vào đó hãy đặt ra một tên ngắn thông minh (shortProductName) và dùng tên ngắn này trong lời thoại.
5. Số từ của toàn bộ lời thoại (hook + voiceoverText) PHẢI khớp với mục tiêu targetWordCount (khoảng ${targetWordCount} từ), sao cho khi đọc lên ở tốc độ bình thường (khoảng ${wordsPerSec} từ mỗi giây), tổng thời lượng đọc (estimatedSpeechDurationSec) sẽ dưới targetDurationSec (${targetVoiceDurationSec.toFixed(1)} giây) để không bị cắt video.
6. Lời thoại kết thúc bằng một câu kêu gọi hành động (CTA) nhẹ nhàng, tự nhiên (ví dụ: "link bio nha", "ghé giỏ hàng/bio mình nhé").
7. Tránh dùng emoji trong văn bản lời thoại.

Hãy trả về duy nhất một đối tượng JSON có định dạng chính xác sau đây (không được có markdown trần hay bất cứ chữ gì ngoài JSON):
{
  "shortProductName": "tên ngắn gọn, thông minh của sản phẩm",
  "hook": "câu hook mở đầu dài từ 10-15 từ gây ấn tượng mạnh",
  "voiceoverText": "toàn bộ kịch bản lời thoại, bao gồm cả câu hook ở đầu và câu CTA ở cuối, tạo thành một đoạn văn liền mạch",
  "captionDraft": "caption ngắn gọn cho video kèm hashtag",
  "hashtags": ["#vfos", "#review", "#dealhot"],
  "estimatedSpeechDurationSec": thời_gian_đọc_ước_tính_bằng_giây,
  "notes": ["các lưu ý ngắn gọn của bạn"]
}
`;

  return prompt;
}
