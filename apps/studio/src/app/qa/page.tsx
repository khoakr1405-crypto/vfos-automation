import { LanePill, PlatformPill, StatusBadge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { UtilIcon } from '@/components/icons';
import { MockBanner } from '@/components/mock-banner';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui';
import { QA_CHECKLIST, QA_QUEUE } from '@/lib/mock-data';

export default function QaPage() {
  const passCount = QA_CHECKLIST.filter((c) => c.status === 'pass').length;

  return (
    <div className="space-y-6">
      <MockBanner />
      <PageHeader
        no={8}
        icon="qa"
        accent="green"
        title="QA & Duyệt"
        description="QA bắt buộc PASS trước khi operator duyệt. Không duyệt = không vào hàng xuất bản."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Checklist */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Final QA checklist"
            subtitle={`${passCount}/${QA_CHECKLIST.length} mục PASS`}
            no={8}
            accentClass="text-accent-green"
            right={<StatusBadge status={passCount === QA_CHECKLIST.length ? 'pass' : 'pending'} />}
          />
          <CardBody className="grid gap-2 sm:grid-cols-2">
            {QA_CHECKLIST.map((c) => (
              <div
                key={c.label}
                className="flex items-center gap-2.5 rounded-lg border border-hairline bg-raised/40 px-3 py-2"
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full ${
                    c.status === 'pass'
                      ? 'bg-accent-green/20 text-accent-green'
                      : 'bg-accent-rose/20 text-accent-rose'
                  }`}
                >
                  <UtilIcon name={c.status === 'pass' ? 'check' : 'x'} width={12} height={12} />
                </span>
                <span className="flex-1 text-xs text-neutral-200">{c.label}</span>
                <StatusBadge status={c.status} />
              </div>
            ))}
          </CardBody>
        </Card>

        {/* Preview + operator gate */}
        <Card>
          <CardHeader title="Bản duyệt" subtitle="Operator gate" accentClass="text-accent-green" />
          <CardBody className="space-y-3">
            <div className="relative mx-auto flex aspect-[9/16] max-h-64 w-full max-w-[10rem] items-center justify-center overflow-hidden rounded-xl border border-hairline bg-gradient-to-b from-raised to-card">
              <UtilIcon name="play" width={20} height={20} />
              <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-neutral-300">
                00:15 · 9:16
              </span>
            </div>
            <p className="rounded-lg border border-accent-amber/30 bg-accent-amber/10 px-3 py-2 text-[11px] text-accent-amber">
              Operator phải duyệt thủ công. Hệ thống không tự duyệt.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="danger">
                <UtilIcon name="x" width={13} height={13} /> Từ chối
              </Button>
              <Button variant="success">
                <UtilIcon name="check" width={13} height={13} /> Duyệt
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* QA queue */}
      <Card>
        <CardHeader
          title="Hàng đợi QA"
          subtitle={`${QA_QUEUE.length} video chờ kiểm (mock)`}
          accentClass="text-accent-green"
        />
        <CardBody className="!p-0">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
              <tr className="border-b border-hairline">
                <th className="px-5 py-2.5 font-medium">Job</th>
                <th className="px-5 py-2.5 font-medium">Ngách</th>
                <th className="px-5 py-2.5 font-medium">Nền tảng</th>
                <th className="px-5 py-2.5 font-medium">Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {QA_QUEUE.map((q) => (
                <tr
                  key={q.jobId}
                  className="border-b border-hairline/60 last:border-0 hover:bg-raised/30"
                >
                  <td className="px-5 py-3">
                    <p className="font-medium text-neutral-100">{q.title}</p>
                    <p className="font-mono text-[10px] text-neutral-600">{q.jobId}</p>
                  </td>
                  <td className="px-5 py-3">
                    <LanePill laneId={q.laneId} />
                  </td>
                  <td className="px-5 py-3">
                    <PlatformPill platform={q.platform} />
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={q.result} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
