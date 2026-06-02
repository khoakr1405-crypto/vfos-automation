import { type PublishContent, contentGateChecklist, contentGatePassed } from '@/lib/mock-data';
import { StatusBadge } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';

/** E. Publish Gate Checklist — gate chung của nội dung (logic gate hiển thị rõ). */
export function PublishGateChecklist({ content }: { content: PublishContent }) {
  const items = contentGateChecklist(content);
  const passed = contentGatePassed(content);

  return (
    <Card>
      <CardHeader
        title="Publish Gate — điều kiện chung"
        subtitle="Phải xanh hết thì các nút publish nền tảng mới mở khóa"
        accentClass="text-accent-green"
        right={<StatusBadge status={passed ? 'pass' : 'blocked'} />}
      />
      <CardBody className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2.5 rounded-lg border border-hairline bg-raised/40 px-3 py-2"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                item.ok
                  ? 'bg-accent-green/20 text-accent-green'
                  : 'bg-accent-rose/20 text-accent-rose'
              }`}
            >
              <UtilIcon name={item.ok ? 'check' : 'x'} width={12} height={12} />
            </span>
            <span className="text-xs text-neutral-200">{item.label}</span>
          </div>
        ))}
        <p className="sm:col-span-2 mt-1 text-[11px] text-neutral-500">
          Yêu cầu riêng từng nền tảng (package, thumbnail, manual review) kiểm tra trong từng card
          bên dưới.
        </p>
      </CardBody>
    </Card>
  );
}
