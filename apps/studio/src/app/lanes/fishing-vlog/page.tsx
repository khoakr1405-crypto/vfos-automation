'use client';

import { Card, CardBody, CardHeader } from '@/components/card';
import { MockBanner } from '@/components/mock-banner';
import { PageHeader } from '@/components/page-header';

export default function FishingVlogLanePage() {
  return (
    <div className="space-y-6">
      <MockBanner />
      <PageHeader
        no={3}
        icon="rawvisual"
        accent="cyan"
        title="Vlog Về Câu cá"
        description="Đang chuẩn bị, chưa bật tạo job thật cho lane này."
      />

      <Card>
        <CardHeader
          title="Trạng thái phân hệ"
          subtitle="Thông tin từ trung tâm điều phối"
          accentClass="text-accent-cyan"
        />
        <CardBody className="p-6 text-xs text-neutral-400 space-y-4">
          <p className="font-semibold text-neutral-200">Lane này sẽ dùng cùng khung 3 action:</p>
          <ol className="list-decimal pl-4 space-y-1.5 text-neutral-300">
            <li>Lấy / chọn chủ đề/sản phẩm</li>
            <li>Chạy sản xuất video</li>
            <li>Đăng bài / Đóng gói</li>
          </ol>
          <p className="text-neutral-500 pt-2 border-t border-hairline/40">
            Hiện chưa bật pipeline thật cho lane này.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
