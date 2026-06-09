'use client';

import type { PublishContent } from '@/lib/types';
import { useState } from 'react';
import { UtilIcon } from '../icons';

interface PublishPayloadPreviewProps {
  content: PublishContent;
}

export function PublishPayloadPreview({ content }: PublishPayloadPreviewProps) {
  const [copied, setCopied] = useState(false);

  if (!content) return null;

  const payload = content.payloadPreview;
  const command =
    content.dryRunCommand || `pnpm job:publish-facebook --job ${content.id} --dry-run`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-hairline bg-card/30 p-5 backdrop-blur-md space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-hairline pb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-accent-cyan shrink-0">
            <UtilIcon name="sparkle" width={18} height={18} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-neutral-100">Dry-Run & Payload Preview</h3>
            <p className="text-[11px] text-neutral-500">
              Mô phỏng dữ liệu xuất bản cấu hình cho Job cục bộ
            </p>
          </div>
        </div>
        <div className="rounded-full bg-accent-cyan/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-cyan">
          UI-05 Dry-Run Mode
        </div>
      </div>

      {/* Safety Notice Disclaimers */}
      <div className="rounded-xl border border-accent-amber/20 bg-accent-amber/5 px-4 py-3 text-[11px] text-accent-amber space-y-2">
        <div className="flex gap-2 items-center font-semibold">
          <UtilIcon name="bell" width={14} height={14} className="shrink-0" />
          <span>VFOS Security Protocols Enforced</span>
        </div>
        <ul className="list-disc pl-4 space-y-1 text-neutral-400">
          <li>
            <span className="text-accent-amber font-medium">
              Live publish is disabled in UI-05.
            </span>{' '}
            This screen prepares dry-run/readiness only.
          </li>
          <li>
            <span className="text-accent-amber font-medium">
              No upload or social API call is performed.
            </span>{' '}
            Dry-run modes operate entirely inside local environments.
          </li>
          <li>
            <span className="text-neutral-300 font-medium">
              Live publish will only be considered in a later local-only guarded round.
            </span>
          </li>
        </ul>
      </div>

      {/* Code Block for Dry-run CLI Command */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            Planned Dry-Run Command
          </span>
          <button
            type="button"
            onClick={copyToClipboard}
            className="flex items-center gap-1 text-[10px] font-medium text-accent-cyan hover:text-accent-cyan/80 transition-colors"
          >
            <UtilIcon name="link" width={12} height={12} />
            {copied ? 'Đã sao chép' : 'Sao chép command'}
          </button>
        </div>
        <div className="relative rounded-xl border border-hairline bg-neutral-950/80 p-3.5 font-mono text-xs text-neutral-200 overflow-x-auto select-all">
          <span className="text-neutral-500 mr-2">$</span>
          {command}
        </div>
      </div>

      {/* Payload Preview Grid */}
      <div className="space-y-2.5">
        <h4 className="px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
          Payload Data Preview
        </h4>
        <div className="grid gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
          {/* Item 1: Job Info */}
          <div className="rounded-xl border border-hairline bg-raised/20 p-3.5 space-y-1.5">
            <span className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">
              Job Target
            </span>
            <div className="text-xs font-semibold text-neutral-200">{content.id}</div>
            <div className="text-[11px] text-neutral-400 line-clamp-1">{content.product}</div>
          </div>

          {/* Item 2: Target Page / Channel */}
          <div className="rounded-xl border border-hairline bg-raised/20 p-3.5 space-y-1.5">
            <span className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">
              Target Channel
            </span>
            <div className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
              {payload?.targetChannel || 'Kênh Review Sản Phẩm #1'}
            </div>
            <div className="text-[10px] text-neutral-400 uppercase font-mono">
              {content.platforms.facebook.channel ? 'facebook' : 'unknown'} platform
            </div>
          </div>

          {/* Item 3: Package state */}
          <div className="rounded-xl border border-hairline bg-raised/20 p-3.5 space-y-1.5">
            <span className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">
              Video Package
            </span>
            <div className="text-xs font-semibold flex items-center gap-1.5">
              {payload?.videoPackageStatus === 'available' ? (
                <>
                  <span className="text-accent-green shrink-0">
                    <UtilIcon name="check" width={14} height={14} />
                  </span>
                  <span className="text-neutral-200">Đã đóng gói (ZIP sẵn sàng)</span>
                </>
              ) : (
                <>
                  <span className="text-accent-rose shrink-0">
                    <UtilIcon name="x" width={14} height={14} />
                  </span>
                  <span className="text-neutral-400">Chưa tìm thấy tệp đóng gói</span>
                </>
              )}
            </div>
            <div className="text-[10px] text-neutral-500">production_package.zip</div>
          </div>
        </div>

        <div className="grid gap-4.5 sm:grid-cols-2">
          {/* Caption Preview Box */}
          <div className="rounded-xl border border-hairline bg-neutral-900/50 p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-hairline/50 pb-2">
              <span className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">
                Caption File Preview
              </span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${payload?.captionStatus === 'available' ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-rose/10 text-accent-rose'}`}
              >
                {payload?.captionStatus === 'available' ? 'Sẵn sàng' : 'Thiếu file'}
              </span>
            </div>
            {content.captionContent ? (
              <p className="text-[11px] text-neutral-300 leading-relaxed font-sans line-clamp-4 whitespace-pre-wrap">
                {content.captionContent}
              </p>
            ) : (
              <p className="text-[11px] text-neutral-500 italic">
                Không có dữ liệu text hoặc thiếu tệp caption trong gói sản xuất.
              </p>
            )}
          </div>

          {/* Hashtag Preview Box */}
          <div className="rounded-xl border border-hairline bg-neutral-900/50 p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-hairline/50 pb-2">
              <span className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">
                Hashtags Preview
              </span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${payload?.hashtagsStatus === 'available' ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-rose/10 text-accent-rose'}`}
              >
                {payload?.hashtagsStatus === 'available' ? 'Sẵn sàng' : 'Thiếu file'}
              </span>
            </div>
            {content.hashtagsContent ? (
              <p className="text-[11px] text-neutral-300 leading-relaxed font-mono line-clamp-4">
                {content.hashtagsContent}
              </p>
            ) : (
              <p className="text-[11px] text-neutral-500 italic">
                Không có dữ liệu hashtags hoặc thiếu tệp hashtags trong gói sản xuất.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
