import {
  loadChannels,
  loadCommentIntents,
  loadCommentItems,
  loadPublishedPosts,
  loadReplyTemplates,
} from '@/lib/growth-data/load';
import type {
  Channel,
  CommentIntent,
  CommentItem,
  PublishedPost,
  ReplyTemplate,
} from '@/lib/growth-data/types';
import type { PlatformId } from '@/lib/mock-data';
import { loadJobById } from '@/lib/studio-data/jobs';
import { CommentInboxClient } from './comment-inbox';

export const dynamic = 'force-dynamic';

export interface AnalyzedComment {
  commentId: string;
  publishedPostId: string;
  fbCommentId: string;
  authorRef: string;
  text: string;
  createdAt: string;
  status: 'new' | 'classified' | 'handled' | 'escalated';
  intent: string;
  confidence: number;
  isSafeForAuto: boolean;
  mood: 'funny' | 'curious' | 'interested' | 'skeptical' | 'angry' | 'neutral';
  replyStyle: 'funny' | 'friendly' | 'informative' | 'soft-defense' | 'no-reply' | 'escalate';
  conversionOpportunity: 'none' | 'soft' | 'medium' | 'high';
  shouldIncludeLink: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  channelName: string;
  platform: PlatformId;
  videoTitle: string;
  affiliateShortLink: string | null;

  // Draft Reply Assistant fields:
  draftReply: string;
  draftRationale: string;
  draftHasLink: boolean;
  draftWarning?: string;
}

function analyzeComment(
  comment: CommentItem,
  intentObj: CommentIntent | undefined,
  post: PublishedPost | undefined,
  channel: Channel | undefined,
  templates: ReplyTemplate[],
): AnalyzedComment {
  const text = comment.text.toLowerCase();

  // 1. Identify Intent
  let intent = intentObj?.intent || 'UNKNOWN';
  let confidence = intentObj?.confidence || 0.8;
  let isSafeForAuto = intentObj?.isSafeForAuto || false;

  if (intent === 'UNKNOWN') {
    if (
      text.includes('xin link') ||
      text.includes('link đâu') ||
      text.includes('gửi link') ||
      text.includes('cho xin link')
    ) {
      intent = 'ASK_LINK';
      confidence = 0.95;
      isSafeForAuto = true;
    } else if (
      text.includes('giá') ||
      text.includes('bao nhiêu') ||
      text.includes('nhiêu tiền') ||
      text.includes('bao nhiu')
    ) {
      intent = 'ASK_PRICE';
      confidence = 0.93;
      isSafeForAuto = true;
    } else if (text.includes('ở đâu') || text.includes('mua ở') || text.includes('mua chỗ nào')) {
      intent = 'ASK_WHERE_TO_BUY';
      confidence = 0.9;
      isSafeForAuto = true;
    } else if (text.includes('còn hàng') || text.includes('hết hàng') || text.includes('còn ko')) {
      intent = 'ASK_STOCK';
      confidence = 0.88;
      isSafeForAuto = true;
    } else if (
      text.includes('hài') ||
      text.includes('vui') ||
      text.includes('cười') ||
      text.includes('meme') ||
      text.includes('trend')
    ) {
      intent = 'JOKE';
      confidence = 0.96;
      isSafeForAuto = false;
    } else if (
      text.includes('đỉnh') ||
      text.includes('hay') ||
      text.includes('xịn') ||
      text.includes('đẹp') ||
      text.includes('thích')
    ) {
      intent = 'PRAISE';
      confidence = 0.98;
      isSafeForAuto = false;
    } else if (
      text.includes('lừa đảo') ||
      text.includes('hỏng') ||
      text.includes('hư') ||
      text.includes('tệ') ||
      text.includes('chán') ||
      text.includes('thất vọng')
    ) {
      intent = 'COMPLAINT';
      confidence = 0.95;
      isSafeForAuto = false;
    } else if (text.includes('so với') || text.includes('tốt hơn') || text.includes('bên kia')) {
      intent = 'COMPARE_PRODUCT';
      confidence = 0.85;
      isSafeForAuto = false;
    }
  }

  // 2. Determine Mood
  let mood: 'funny' | 'curious' | 'interested' | 'skeptical' | 'angry' | 'neutral' = 'neutral';
  if (intent === 'ASK_LINK' || intent === 'ASK_WHERE_TO_BUY') {
    mood = 'interested';
  } else if (intent === 'ASK_PRICE' || intent === 'ASK_STOCK' || intent === 'QUESTION') {
    mood = 'curious';
  } else if (intent === 'JOKE' || intent === 'TREND_REACTION') {
    mood = 'funny';
  } else if (intent === 'PRAISE') {
    mood = 'interested';
  } else if (intent === 'COMPLAINT' || text.includes('lừa đảo') || text.includes('thất vọng')) {
    mood = 'angry';
  } else if (intent === 'COMPARE_PRODUCT') {
    mood = 'skeptical';
  }

  // 3. Determine Risk Level
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (
    intent === 'COMPLAINT' ||
    intent === 'NEGATIVE' ||
    intent === 'SPAM' ||
    intent === 'ABUSE' ||
    text.includes('lừa đảo')
  ) {
    riskLevel = 'high';
  } else if (
    intent === 'COMPARE_PRODUCT' ||
    intent === 'NEGATIVE_LIGHT' ||
    text.includes('tệ') ||
    text.includes('dở') ||
    text.includes('mắc')
  ) {
    riskLevel = 'medium';
  }

  // 4. Determine Reply Style
  let replyStyle: 'funny' | 'friendly' | 'informative' | 'soft-defense' | 'no-reply' | 'escalate' =
    'friendly';
  if (intent === 'COMPLAINT') {
    replyStyle = 'escalate';
  } else if (intent === 'COMPARE_PRODUCT') {
    replyStyle = 'soft-defense';
  } else if (intent === 'JOKE' || intent === 'TREND_REACTION') {
    replyStyle = 'funny';
  } else if (intent === 'PRAISE') {
    replyStyle = 'friendly';
  } else if (intent === 'ASK_PRICE' || intent === 'ASK_STOCK') {
    replyStyle = 'informative';
  } else if (text.includes('spam') || text.includes('bậy')) {
    replyStyle = 'no-reply';
  }

  // 5. Determine Conversion Opportunity
  let conversionOpportunity: 'none' | 'soft' | 'medium' | 'high' = 'none';
  if (intent === 'ASK_LINK' || intent === 'ASK_WHERE_TO_BUY') {
    conversionOpportunity = 'high';
  } else if (intent === 'ASK_PRICE') {
    conversionOpportunity = 'medium';
  } else if (intent === 'ASK_STOCK') {
    conversionOpportunity = 'soft';
  } else if (intent === 'PRAISE') {
    conversionOpportunity = 'soft';
  }

  const affiliateLink = post?.affiliateShortLink || null;

  const isLinkIntent =
    intent === 'ASK_LINK' ||
    intent === 'ASK_PRICE' ||
    intent === 'ASK_WHERE_TO_BUY' ||
    intent === 'ASK_STOCK';

  const isQuestionWithBuyingIntent =
    intent === 'QUESTION' &&
    (text.includes('xin link') ||
      text.includes('link') ||
      text.includes('giá') ||
      text.includes('bao nhiêu') ||
      text.includes('ở đâu') ||
      text.includes('mua'));

  // 6. Determine Should Include Link
  const shouldIncludeLink =
    (isLinkIntent || isQuestionWithBuyingIntent) &&
    !!affiliateLink &&
    !(
      intent === 'COMPLAINT' ||
      intent === 'NEGATIVE' ||
      intent === 'SPAM' ||
      intent === 'ABUSE' ||
      intent === 'NEGATIVE_LIGHT' ||
      intent === 'UNKNOWN' ||
      intent === 'COMPARE_PRODUCT' ||
      riskLevel === 'high'
    );

  // Resolve Product/Job Title
  const realJob = post ? loadJobById(post.jobId) : null;
  const videoTitle =
    realJob?.product ||
    realJob?.title ||
    post?.videoId ||
    post?.jobId ||
    'Sản phẩm / Video không rõ';

  // 7. Draft Reply Assistant Logic
  let draftReply = '';
  let draftRationale = '';
  let draftHasLink = false;
  let draftWarning: string | undefined = undefined;

  if (
    intent === 'COMPLAINT' ||
    intent === 'NEGATIVE' ||
    intent === 'SPAM' ||
    intent === 'ABUSE' ||
    riskLevel === 'high'
  ) {
    draftReply = 'Cần Operator xử lý thủ công';
    draftRationale =
      'Bình luận chứa ý kiến khiếu nại, phản hồi tiêu cực hoặc rủi ro độc hại cao. Chặn câu trả lời tự động để tránh gây tranh chấp thêm.';
    draftHasLink = false;
    draftWarning =
      '⚠️ Cảnh báo: Đây là bình luận tiêu cực/khiếu nại. Ưu tiên xin lỗi/ghi nhận, kiểm tra đơn hàng nếu có, không tranh luận, không gắn link.';
  } else {
    // Look up template in reply-templates.json
    const matchingTemplate = templates.find((t) => t.intent === intent);

    if (isLinkIntent || isQuestionWithBuyingIntent) {
      if (affiliateLink) {
        draftHasLink = true;
        const templateBody =
          matchingTemplate?.bodyTemplate || 'Dạ bạn xem sản phẩm ở link này nha: {affiliate_link}';
        draftReply = templateBody.replace('{affiliate_link}', affiliateLink);
        draftRationale = isQuestionWithBuyingIntent
          ? 'Câu hỏi của người xem thể hiện rõ ý định mua hàng. Đính kèm link tiếp thị liên kết Shopee tương ứng.'
          : 'Người xem chủ động hỏi link, hỏi giá hoặc mua sản phẩm. Đính kèm link tiếp thị liên kết Shopee tương ứng.';
      } else {
        draftHasLink = false;
        const templateBody = matchingTemplate?.bodyTemplate || 'Dạ bạn xem sản phẩm ở link này nha';
        draftReply = templateBody.replace(': {affiliate_link}', '').replace('{affiliate_link}', '');
        draftRationale =
          'Người xem có nhu cầu mua hàng, tuy nhiên bài viết hoặc sản phẩm chưa được cấu hình Shopee Affiliate Link hợp lệ. Đề xuất phản hồi không kèm link.';
      }
    } else {
      // JOKE, PRAISE, TREND_REACTION, COMPARE_PRODUCT or general QUESTION
      draftHasLink = false;
      draftReply = matchingTemplate?.bodyTemplate || 'Dạ shop cảm ơn bạn đã quan tâm theo dõi nhé!';

      if (intent === 'JOKE' || intent === 'TREND_REACTION') {
        draftRationale =
          'Bình luận mang tính chất vui đùa, bắt trend. Phản hồi hóm hỉnh, thân thiện để duy trì tương tác tốt và tuyệt đối không chèn link tiếp thị.';
      } else if (intent === 'PRAISE') {
        draftRationale =
          'Bình luận khen ngợi hoặc khích lệ tích cực. Gửi lời cảm ơn chân thành tới người xem và tuyệt đối không chèn link tiếp thị để giữ sự tự nhiên.';
      } else if (intent === 'COMPARE_PRODUCT') {
        draftRationale =
          'Bình luận so sánh sản phẩm. Phản hồi khách quan, trung lập để người xem tự chọn, không chèn link sản phẩm và không khẳng định sản phẩm nào tốt hơn nếu thiếu dữ liệu chắc chắn.';
      } else {
        draftRationale =
          'Bình luận hỏi đáp hoặc tương tác chung. Phản hồi thân thiện, giải đáp thông tin và không chèn link tiếp thị.';
      }
    }
  }

  return {
    commentId: comment.commentId,
    publishedPostId: comment.publishedPostId,
    fbCommentId: comment.fbCommentId,
    authorRef: comment.authorRef,
    text: comment.text,
    createdAt: comment.createdAt,
    status: comment.status,
    intent,
    confidence,
    isSafeForAuto,
    mood,
    replyStyle,
    conversionOpportunity,
    shouldIncludeLink,
    riskLevel,
    channelName: channel?.displayName || 'Kênh ẩn danh',
    platform: (channel?.platform || 'facebook') as PlatformId,
    videoTitle,
    affiliateShortLink: post?.affiliateShortLink || null,
    draftReply,
    draftRationale,
    draftHasLink,
    draftWarning,
  };
}

// biome-ignore lint/style/noDefaultExport: Next.js page requires default export
export default function CommentsPage() {
  const comments = loadCommentItems();
  const intents = loadCommentIntents();
  const posts = loadPublishedPosts();
  const channels = loadChannels();
  const templates = loadReplyTemplates();

  const analyzedComments: AnalyzedComment[] = comments.map((comment) => {
    const intentObj = intents.find((i) => i.commentId === comment.commentId);
    const post = posts.find((p) => p.publishedPostId === comment.publishedPostId);
    const channel = post ? channels.find((c) => c.channelId === post.channelId) : undefined;
    return analyzeComment(comment, intentObj, post, channel, templates);
  });

  return (
    <div className="space-y-6">
      <CommentInboxClient initialComments={analyzedComments} />
    </div>
  );
}
