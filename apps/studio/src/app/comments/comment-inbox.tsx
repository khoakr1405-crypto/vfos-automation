'use client';

import { Badge, PlatformPill } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { UtilIcon } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui';
import type { PlatformId } from '@/lib/mock-data';
import { useState } from 'react';
import type { AnalyzedComment } from './page';

interface CommentInboxClientProps {
  initialComments: AnalyzedComment[];
}

export function CommentInboxClient({ initialComments }: CommentInboxClientProps) {
  const [selectedId, setSelectedId] = useState<string>(initialComments[0]?.commentId || '');
  const [filterTab, setFilterTab] = useState<'all' | 'opportunity' | 'community' | 'urgent'>('all');

  const selectedComment =
    initialComments.find((c) => c.commentId === selectedId) || initialComments[0];

  // 1. Compute Stats
  const totalCount = initialComments.length;
  const askLinkPriceCount = initialComments.filter(
    (c) => c.intent === 'ASK_LINK' || c.intent === 'ASK_PRICE' || c.intent === 'ASK_WHERE_TO_BUY',
  ).length;
  const communityCount = initialComments.filter(
    (c) => c.intent === 'JOKE' || c.intent === 'PRAISE' || c.intent === 'TREND_REACTION',
  ).length;
  const urgentCount = initialComments.filter(
    (c) => c.riskLevel === 'high' || c.intent === 'COMPLAINT',
  ).length;
  const recommendedLinkRate =
    totalCount > 0
      ? Math.round((initialComments.filter((c) => c.shouldIncludeLink).length / totalCount) * 100)
      : 0;

  // 2. Filter logic
  const filteredComments = initialComments.filter((c) => {
    if (filterTab === 'opportunity') {
      return (
        c.intent === 'ASK_LINK' ||
        c.intent === 'ASK_PRICE' ||
        c.intent === 'ASK_WHERE_TO_BUY' ||
        c.intent === 'ASK_STOCK'
      );
    }
    if (filterTab === 'community') {
      return (
        c.intent === 'JOKE' ||
        c.intent === 'PRAISE' ||
        c.intent === 'TREND_REACTION' ||
        c.intent === 'QUESTION'
      );
    }
    if (filterTab === 'urgent') {
      return c.riskLevel === 'high' || c.riskLevel === 'medium' || c.intent === 'COMPLAINT';
    }
    return true;
  });

  // 3. Status mappings
  const intentColors: Record<string, 'green' | 'violet' | 'amber' | 'rose' | 'blue' | 'cyan'> = {
    ASK_LINK: 'green',
    ASK_PRICE: 'green',
    ASK_WHERE_TO_BUY: 'green',
    ASK_STOCK: 'cyan',
    QUESTION: 'blue',
    JOKE: 'violet',
    PRAISE: 'violet',
    TREND_REACTION: 'violet',
    COMPLAINT: 'rose',
    COMPARE_PRODUCT: 'amber',
    NEGATIVE_LIGHT: 'amber',
    SPAM: 'rose',
    UNKNOWN: 'blue',
  };

  const riskColors: Record<string, 'green' | 'amber' | 'rose'> = {
    low: 'green',
    medium: 'amber',
    high: 'rose',
  };

  const conversionColors: Record<string, 'green' | 'amber' | 'cyan' | 'blue'> = {
    high: 'green',
    medium: 'cyan',
    soft: 'blue',
    none: 'amber',
  };

  return (
    <div className="space-y-6">
      {/* Warning Banner */}
      <div className="flex items-center gap-2 rounded-xl border border-accent-violet/30 bg-accent-violet/10 px-3.5 py-2 text-[11px] text-accent-violet">
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent-violet" />
        <span>
          <strong>MẮT THẦN BÌNH LUẬN · GIẢ LẬP READ-ONLY.</strong> Số liệu bên dưới được phân tích
          từ fixtures seed. Hệ thống chưa kết nối trực tiếp với Meta Graph API/Insights API thật và
          chưa tự động trả lời bài đăng.
        </span>
      </div>

      {/* Header */}
      <PageHeader
        no={12}
        icon="comments"
        accent="violet"
        title="Comment Intelligence"
        description="Mắt thần bình luận: thấu hiểu tệp người xem, định vị sắc thái biểu cảm, kiểm soát rủi ro độc hại và chọn lọc thời điểm đính kèm link tiếp thị liên kết."
      />

      {/* KPI small cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Tổng bình luận" value={totalCount.toString()} accent="blue" />
        <StatCard label="Hỏi giá / Hỏi link" value={askLinkPriceCount.toString()} accent="green" />
        <StatCard label="Đùa vui / Bắt trend" value={communityCount.toString()} accent="violet" />
        <StatCard label="Cần xử lý gấp" value={urgentCount.toString()} accent="rose" />
        <StatCard label="Tỷ lệ khuyên gắn link" value={`${recommendedLinkRate}%`} accent="cyan" />
      </div>

      {/* Main split view */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left Side: Comment list and filters */}
        <div className="w-full space-y-4 lg:w-5/12 shrink-0">
          <div className="flex flex-wrap gap-1.5 rounded-lg bg-raised/40 p-1 border border-hairline/40">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold transition ${
                filterTab === 'all'
                  ? 'bg-neutral-800 text-neutral-50 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Tất cả ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('opportunity')}
              className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold transition ${
                filterTab === 'opportunity'
                  ? 'bg-accent-green/15 text-accent-green shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Hỏi mua ({askLinkPriceCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('community')}
              className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold transition ${
                filterTab === 'community'
                  ? 'bg-accent-violet/15 text-accent-violet shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Trend/Vui ({communityCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('urgent')}
              className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold transition ${
                filterTab === 'urgent'
                  ? 'bg-accent-rose/15 text-accent-rose shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Gấp/Chê ({urgentCount})
            </button>
          </div>

          <Card className="h-[520px] flex flex-col">
            <CardHeader
              title="Hàng đợi bình luận"
              subtitle={`${filteredComments.length} bản ghi khớp bộ lọc`}
            />
            <CardBody className="flex-1 overflow-y-auto !p-0 divide-y divide-hairline">
              {filteredComments.length === 0 ? (
                <div className="flex h-full items-center justify-center p-6 text-center text-xs text-neutral-500">
                  Không có bình luận nào khớp bộ lọc.
                </div>
              ) : (
                filteredComments.map((comment) => {
                  const active = comment.commentId === selectedId;
                  return (
                    <button
                      key={comment.commentId}
                      type="button"
                      onClick={() => setSelectedId(comment.commentId)}
                      className={`w-full text-left p-4 transition-all outline-none ${
                        active
                          ? 'bg-raised/70 border-l-2 border-accent-violet'
                          : 'hover:bg-raised/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-neutral-200">
                            @{comment.authorRef}
                          </span>
                          <PlatformPill platform={comment.platform as PlatformId} />
                        </div>
                        <span className="text-[10px] text-neutral-500">
                          {new Date(comment.createdAt).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <p className="text-xs text-neutral-300 line-clamp-2 mb-2 font-medium">
                        "{comment.text}"
                      </p>

                      <div className="flex flex-wrap gap-1.5">
                        <Badge accent={intentColors[comment.intent] || 'blue'}>
                          {comment.intent}
                        </Badge>
                        {comment.riskLevel !== 'low' && (
                          <Badge accent={riskColors[comment.riskLevel] || 'amber'}>
                            {comment.riskLevel === 'high' ? 'High Risk' : 'Medium Risk'}
                          </Badge>
                        )}
                        {comment.shouldIncludeLink && <Badge accent="green">Nên gắn link</Badge>}
                      </div>
                    </button>
                  );
                })
              )}
            </CardBody>
          </Card>
        </div>

        {/* Right Side: Eye-of-God Analysis Panel */}
        <div className="flex-1">
          {selectedComment ? (
            <Card className="h-full min-h-[580px] flex flex-col justify-between">
              <div>
                <CardHeader
                  title="Phân Tích Chi Tiết · Mắt Thần VFOS"
                  subtitle={`Đang xem bình luận ID ${selectedComment.commentId}`}
                  right={
                    <Badge accent={selectedComment.status === 'escalated' ? 'rose' : 'blue'}>
                      Trạng thái: {selectedComment.status.toUpperCase()}
                    </Badge>
                  }
                />

                <CardBody className="space-y-6">
                  {/* Selected Comment Text Bubble */}
                  <div className="rounded-xl bg-raised/35 p-4 border border-hairline/80 relative overflow-hidden">
                    <div className="absolute top-2 right-3 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-accent-violet animate-pulse" />
                      <span className="text-[9px] font-black uppercase text-accent-violet tracking-wider">
                        Phân tích ngữ cảnh
                      </span>
                    </div>
                    <p className="text-[10px] uppercase font-bold text-neutral-500 mb-1">
                      Nội dung bình luận từ @{selectedComment.authorRef}
                    </p>
                    <p className="text-sm font-semibold text-neutral-500 mb-1">
                      Post ID: {selectedComment.fbCommentId.split('_')[0]}
                    </p>
                    <p className="text-sm font-medium text-neutral-100 italic leading-relaxed">
                      "{selectedComment.text}"
                    </p>
                  </div>

                  {/* Context Info (Channel, Video, Affiliate link) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-hairline p-3 bg-panel/30">
                      <p className="text-[10px] font-bold text-neutral-500 uppercase">
                        Kênh phát hành
                      </p>
                      <p className="text-xs font-semibold text-neutral-200 mt-1 flex items-center gap-1.5">
                        <PlatformPill platform={selectedComment.platform as PlatformId} />
                        {selectedComment.channelName}
                      </p>
                    </div>
                    <div className="rounded-lg border border-hairline p-3 bg-panel/30">
                      <p className="text-[10px] font-bold text-neutral-500 uppercase">
                        Video & Sản phẩm
                      </p>
                      <p className="text-xs font-semibold text-neutral-200 mt-1 truncate">
                        {selectedComment.videoTitle}
                      </p>
                    </div>
                  </div>

                  {/* Comment Intelligence Fields */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-neutral-500 uppercase block">
                        Ý định (Intent)
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Badge accent={intentColors[selectedComment.intent] || 'blue'}>
                          {selectedComment.intent}
                        </Badge>
                        <span className="text-[10px] text-neutral-400">
                          ({Math.round(selectedComment.confidence * 100)}%)
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-neutral-500 uppercase block">
                        Sắc thái (Mood)
                      </span>
                      <Badge
                        accent={
                          selectedComment.mood === 'neutral'
                            ? 'blue'
                            : selectedComment.mood === 'funny'
                              ? 'violet'
                              : 'cyan'
                        }
                      >
                        {selectedComment.mood.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-neutral-500 uppercase block">
                        Mức độ Rủi ro (Risk)
                      </span>
                      <Badge accent={riskColors[selectedComment.riskLevel] || 'green'}>
                        {selectedComment.riskLevel.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-neutral-500 uppercase block">
                        Cơ hội Affiliate
                      </span>
                      <Badge
                        accent={conversionColors[selectedComment.conversionOpportunity] || 'blue'}
                      >
                        {selectedComment.conversionOpportunity.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-neutral-500 uppercase block">
                        An toàn Auto-reply
                      </span>
                      <Badge accent={selectedComment.isSafeForAuto ? 'green' : 'rose'}>
                        {selectedComment.isSafeForAuto ? 'ĐỦ ĐIỀU KIỆN' : 'KHÔNG AUTO'}
                      </Badge>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-neutral-500 uppercase block">
                        Gợi ý Link
                      </span>
                      <Badge accent={selectedComment.shouldIncludeLink ? 'green' : 'amber'}>
                        {selectedComment.shouldIncludeLink ? 'NÊN KÈM' : 'KHÔNG KÈM'}
                      </Badge>
                    </div>
                  </div>

                  {/* Decision Explanation Card */}
                  <div className="border-t border-hairline/80 pt-5">
                    {selectedComment.shouldIncludeLink ? (
                      <div className="rounded-xl border border-accent-green/30 bg-accent-green/10 p-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-accent-green mb-1.5">
                          <UtilIcon name="check" width={14} height={14} />
                          NÊN KÈM LINK AFFILIATE TRONG PHẢN HỒI
                        </div>
                        <p className="text-xs text-neutral-300 leading-relaxed">
                          Nhận định: Bình luận chứa ý định hỏi đường dẫn, hỏi giá, hoặc hỏi mua sản
                          phẩm trực tiếp. Việc cung cấp đường liên kết tiếp thị ở bình luận này là
                          **hợp lý và có cơ hội chuyển đổi cao**.
                        </p>
                        {selectedComment.affiliateShortLink && (
                          <div className="mt-3 p-2 rounded bg-panel/60 border border-hairline/80 flex items-center justify-between text-xs">
                            <span className="text-neutral-400">Đường dẫn sản phẩm:</span>
                            <span className="font-mono text-accent-green font-bold select-all">
                              {selectedComment.affiliateShortLink}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/10 p-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-accent-amber mb-1.5">
                          <UtilIcon name="x" width={14} height={14} />
                          KHÔNG GẮN KÈM LINK AFFILIATE
                        </div>
                        <p className="text-xs text-neutral-300 leading-relaxed">
                          Nhận định: Bình luận mang sắc thái đùa vui, khen ngợi chung hoặc phản hồi
                          tiêu cực/so sánh. Spam link trong trường hợp này sẽ gây mất thiện cảm hoặc
                          vi phạm chính sách spam của Facebook.
                          {selectedComment.intent === 'COMPLAINT'
                            ? ' Hãy chuyển giao cho CSKH xử lý trực tiếp để giải quyết thắc mắc/khiếu nại.'
                            : ' Đề xuất phản hồi xã giao hoặc đùa vui theo xu hướng để kéo tương tác.'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Suggested response style strategy */}
                  <div className="rounded-xl border border-hairline p-4 bg-raised/15 space-y-2">
                    <p className="text-[10px] font-bold text-neutral-500 uppercase">
                      Chiến lược đề xuất (Strategy Tone)
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-neutral-200">
                        Phân loại: {selectedComment.replyStyle.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 leading-relaxed">
                      {selectedComment.replyStyle === 'escalate' &&
                        '⚠️ Chuyển tiếp khẩn cấp lên Operator: Bình luận tiêu cực hoặc khiếu nại chất lượng sản phẩm. Yêu cầu phản hồi tinh tế của con người, tránh trả lời tự động.'}
                      {selectedComment.replyStyle === 'soft-defense' &&
                        '🛡️ Phản hồi trung lập/phòng thủ mềm mỏng: So sánh sản phẩm đối thủ. Tập trung làm nổi bật điểm mạnh đặc trưng của sản phẩm mình, không hạ thấp đối thủ.'}
                      {selectedComment.replyStyle === 'funny' &&
                        '🎭 Trả lời dí dỏm/bắt trend: Bình luận đùa vui vui vẻ. Giữ tinh thần thoải mái, bắt trend hài hước của fanpage để duy trì sức hút tự nhiên.'}
                      {selectedComment.replyStyle === 'friendly' &&
                        '🌸 Phản hồi thân thiện, cảm ơn: Bình luận khen ngợi hoặc tương tác thường. Gửi lời cảm ơn chân thành, kêu gọi người xem thả tim hoặc nhấn theo dõi kênh.'}
                      {selectedComment.replyStyle === 'informative' &&
                        '📝 Cung cấp thông tin chuẩn xác: Hỏi giá, hỏi tồn kho. Trả lời rõ ràng, đầy đủ các thông tin thông số và khuyên người xem bấm vào link để mua/check.'}
                      {selectedComment.replyStyle === 'no-reply' &&
                        '🚫 Bỏ qua (No-reply): Bình luận spam hoặc chứa từ ngữ độc hại. Bỏ qua, ẩn bình luận hoặc block tài khoản để làm sạch trang.'}
                    </p>
                  </div>

                  {/* Draft Reply Assistant Section */}
                  <div className="border-t border-hairline/80 pt-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-accent-violet animate-pulse" />
                        <span className="text-[11px] font-black uppercase text-accent-violet tracking-wider">
                          Trợ Lý Soạn Nháp (Draft Reply Assistant)
                        </span>
                      </div>
                      <Badge accent={selectedComment.draftHasLink ? 'green' : 'amber'}>
                        {selectedComment.draftHasLink ? 'Kèm affiliate link' : 'Không kèm link'}
                      </Badge>
                    </div>

                    {selectedComment.draftWarning ? (
                      <div className="rounded-xl border border-accent-rose/30 bg-accent-rose/10 p-4 space-y-2">
                        <div className="text-xs font-bold text-accent-rose">
                          {selectedComment.draftWarning}
                        </div>
                        <div className="rounded-lg bg-panel/60 p-3 border border-hairline text-xs font-mono text-neutral-400">
                          {selectedComment.draftReply}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="rounded-xl bg-panel/50 p-4 border border-hairline/80 relative">
                          <p className="text-[10px] uppercase font-bold text-neutral-500 mb-1.5">
                            Gợi ý phản hồi từ hệ thống
                          </p>
                          <p className="text-xs font-semibold text-neutral-200 leading-relaxed italic select-all">
                            "{selectedComment.draftReply}"
                          </p>
                        </div>
                        <p className="text-[11px] text-neutral-400 leading-relaxed">
                          <strong>Lý do:</strong> {selectedComment.draftRationale}
                        </p>
                      </div>
                    )}
                  </div>
                </CardBody>
              </div>

              {/* Action buttons (Disabled for Read-only) */}
              <CardBody className="border-t border-hairline pt-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-semibold">
                  <UtilIcon name="clock" width={12} height={12} />
                  TRỢ LÝ SOẠN NHÁP · Đang trong chế độ xem trước (Presentational).
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    disabled
                    className="flex-1 opacity-45 cursor-not-allowed text-[11px]"
                  >
                    Duyệt nháp & Lưu (Chưa kích hoạt trong Growth 07)
                  </Button>
                  <Button
                    variant="outline"
                    disabled
                    className="flex-1 opacity-45 cursor-not-allowed text-[11px]"
                  >
                    Gửi phản hồi (Chưa bật trong Growth 07)
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-xs text-neutral-500">
              Chọn một bình luận để xem chi tiết phân tích.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
