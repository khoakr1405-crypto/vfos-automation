import { LanePill, PlatformPill, StatusBadge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { Icon } from '@/components/icons';
import { MockBanner } from '@/components/mock-banner';
import { PageHeader } from '@/components/page-header';
import { Button, FakeSelect, Field } from '@/components/ui';
import { JOBS, PIPELINE_STAGES, PLATFORMS, PRODUCTS } from '@/lib/mock-data';

const STEPS = ['Thông tin', 'Nguồn', 'Cài đặt', 'Xác nhận'];

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

      {/* Step indicator */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          {STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                  i === 0 ? 'bg-accent-violet text-white' : 'bg-raised text-neutral-500'
                }`}
              >
                {i + 1}
              </span>
              <span className={`text-xs ${i === 0 ? 'text-neutral-100' : 'text-neutral-500'}`}>
                {step}
              </span>
              {i < STEPS.length - 1 && <span className="mx-1 text-neutral-700">→</span>}
            </div>
          ))}
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Config form */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Cấu hình job"
            subtitle="Bước 1 — Thông tin (mock form)"
            no={4}
            accentClass="text-accent-violet"
          />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Chọn sản phẩm">
              <FakeSelect value="Máy rửa xe mini Zukul" />
            </Field>
            <Field label="Chọn cụm kênh">
              <FakeSelect value="Rửa Xe & Đồ Chơi Xe" />
            </Field>
            <Field label="Loại nội dung">
              <FakeSelect value="Review sản phẩm" />
            </Field>
            <Field label="Nền tảng đích">
              <FakeSelect value="Facebook Reels · TikTok · YouTube Shorts" />
            </Field>
            <Field label="Định dạng">
              <FakeSelect value="9:16 (1080×1920)" />
            </Field>
            <Field label="Ngôn ngữ">
              <FakeSelect value="Tiếng Việt" />
            </Field>
            <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
              <Button variant="ghost">Lưu nháp</Button>
              <Button variant="primary">
                <Icon name="create" width={14} height={14} /> Tạo job
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader
            title="Xem trước sản phẩm"
            subtitle="Preview (mock)"
            accentClass="text-accent-violet"
          />
          <CardBody className="space-y-3">
            <div className="flex aspect-[9/16] max-h-72 w-full items-center justify-center rounded-xl border border-hairline bg-gradient-to-br from-raised to-panel">
              <div className="text-center">
                <Icon name="rawvisual" width={34} height={34} />
                <p className="mt-2 text-[11px] text-neutral-500">Preview 9:16</p>
              </div>
            </div>
            <div className="rounded-xl border border-hairline bg-raised/40 px-3.5 py-3">
              <p className="text-xs font-semibold text-neutral-100">Máy rửa xe mini Zukul</p>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                Giá: ₫699.000 · Shopee Affiliate
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <LanePill laneId="rua-xe" />
                {PLATFORMS.map((p) => (
                  <PlatformPill key={p.id} platform={p.id} />
                ))}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

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
