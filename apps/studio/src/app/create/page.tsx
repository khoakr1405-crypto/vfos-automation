import { LanePill, PlatformPill, StatusBadge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { CreateConfigForm } from '@/components/create/create-config-form';
import { MockBanner } from '@/components/mock-banner';
import { PageHeader } from '@/components/page-header';
import { JOBS, PIPELINE_STAGES, PRODUCTS } from '@/lib/mock-data';

export default function CreatePage() {
  return (
    <div className="space-y-6">
      <MockBanner />
      <PageHeader
        no={4}
        icon="create"
        accent="violet"
        title="Tạo nội dung mới"
        description="Khởi tạo job: chọn sản phẩm → cụm kênh → nguồn video → cài đặt → tạo job vào pipeline."
      />

      {/* Step indicator + config form + preview — wired to the current Product Card. */}
      <CreateConfigForm />

      {/* Job queue */}
      <Card>
        <CardHeader
          title="Hàng đợi job"
          subtitle={`${JOBS.length} job trong pipeline (mock)`}
          accentClass="text-accent-violet"
        />
        <CardBody className="!p-0">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
              <tr className="border-b border-hairline">
                <th className="px-5 py-2.5 font-medium">Job</th>
                <th className="px-5 py-2.5 font-medium">Ngách</th>
                <th className="px-5 py-2.5 font-medium">Nền tảng</th>
                <th className="px-5 py-2.5 font-medium">Bước hiện tại</th>
                <th className="px-5 py-2.5 font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {JOBS.map((job) => {
                const product = PRODUCTS.find((p) => p.id === job.productId);
                return (
                  <tr
                    key={job.id}
                    className="border-b border-hairline/60 last:border-0 hover:bg-raised/30"
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium text-neutral-100">{job.title}</p>
                      <p className="font-mono text-[10px] text-neutral-600">
                        {job.id} · {product?.name}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <LanePill laneId={job.laneId} />
                    </td>
                    <td className="px-5 py-3">
                      <PlatformPill platform={job.platform} />
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-neutral-300">{PIPELINE_STAGES[job.stageIndex]}</span>
                      <span className="text-neutral-600">
                        {' '}
                        · {job.stageIndex + 1}/{PIPELINE_STAGES.length}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={job.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
