'use client';

import {
  QA_QUEUE_JOBS,
  affiliateQaChecks,
  creativeQaChecks,
  technicalQaChecks,
} from '@/lib/mock-data';
import { useState } from 'react';
import { OperatorDecisionPanel } from './operator-decision-panel';
import { PlatformQaReadiness } from './platform-qa-readiness';
import { QaChecklistCard } from './qa-checklist-card';
import { QaFindingsPanel } from './qa-findings-panel';
import { QaQueueTable } from './qa-queue-table';
import { SelectedQaDetail } from './selected-qa-detail';

/**
 * B + C + D + E + F + G + H + I — phần tương tác: chọn nội dung → hiện chi tiết
 * QA, 3 checklist, platform readiness, operator decision và findings.
 * Client-side trên mock data — KHÔNG gọi API, KHÔNG render/publish thật.
 */
export function QaCommandCenter() {
  const [selectedId, setSelectedId] = useState(QA_QUEUE_JOBS[0]?.id ?? '');
  const job = QA_QUEUE_JOBS.find((j) => j.id === selectedId) ?? QA_QUEUE_JOBS[0];

  if (!job) return null;

  return (
    <div className="space-y-5">
      <QaQueueTable items={QA_QUEUE_JOBS} selectedId={job.id} onSelect={setSelectedId} />

      <SelectedQaDetail job={job} />

      {/* D + E + F — 3 nhóm checklist */}
      <div className="grid gap-4 lg:grid-cols-3">
        <QaChecklistCard
          title="QA kỹ thuật"
          subtitle="Audio / BGM / caption / duration / safe-area / package"
          items={technicalQaChecks(job)}
          accentClass="text-accent-cyan"
        />
        <QaChecklistCard
          title="QA nội dung"
          subtitle="Hook / script / voice-mood / CTA / product"
          items={creativeQaChecks(job)}
          accentClass="text-accent-violet"
        />
        <QaChecklistCard
          title="QA affiliate"
          subtitle="Product card / link / owner_id / claim"
          items={affiliateQaChecks(job)}
          accentClass="text-accent-amber"
        />
      </div>

      {/* G — platform readiness */}
      <PlatformQaReadiness job={job} />

      {/* H + I — operator decision + findings.
          key=job.id để reset state quyết định khi đổi nội dung. */}
      <div className="grid gap-5 lg:grid-cols-2">
        <OperatorDecisionPanel key={job.id} job={job} />
        <QaFindingsPanel findings={job.findings} />
      </div>
    </div>
  );
}
