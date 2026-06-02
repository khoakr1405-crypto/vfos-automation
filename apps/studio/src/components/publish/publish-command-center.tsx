'use client';

import { PLATFORMS, PUBLISH_QUEUE } from '@/lib/mock-data';
import { useState } from 'react';
import { PlatformPublishCard } from './platform-publish-card';
import { PublishGateChecklist } from './publish-gate-checklist';
import { PublishQueueTable } from './publish-queue-table';
import { SelectedPublishContent } from './selected-publish-content';

/**
 * B + C + D + E — phần tương tác: chọn nội dung trong hàng đợi → hiện chi tiết,
 * card publish từng nền tảng và gate checklist của nội dung đó.
 * Hoàn toàn client-side trên mock data — KHÔNG gọi API, KHÔNG publish thật.
 */
export function PublishCommandCenter() {
  const [selectedId, setSelectedId] = useState(PUBLISH_QUEUE[0]?.id ?? '');
  const selected = PUBLISH_QUEUE.find((c) => c.id === selectedId) ?? PUBLISH_QUEUE[0];

  if (!selected) return null;

  return (
    <div className="space-y-5">
      <PublishQueueTable items={PUBLISH_QUEUE} selectedId={selected.id} onSelect={setSelectedId} />

      <SelectedPublishContent content={selected} />

      <div>
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          Publish từng nền tảng — mỗi nút là một hành động thủ công riêng
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          {PLATFORMS.map((p) => (
            <PlatformPublishCard key={p.id} content={selected} platform={p.id} />
          ))}
        </div>
      </div>

      <PublishGateChecklist content={selected} />
    </div>
  );
}
