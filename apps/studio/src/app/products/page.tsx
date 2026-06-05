import { Badge, LanePill, StatusBadge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { ShopeeRegistrySection } from '@/components/commerce/shopee-registry-section';
import { LaneBanner } from '@/components/create/lane-banner';
import { UtilIcon } from '@/components/icons';
import { MockBanner } from '@/components/mock-banner';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui';
import { PRODUCTS, SHOPEE_OWNER } from '@/lib/mock-data';

type PageProps = {
  searchParams: Promise<{ lane?: string }>;
};

export default async function ProductsPage({ searchParams }: PageProps) {
  const { lane } = await searchParams;
  return (
    <div className="space-y-6">
      <MockBanner />
      <LaneBanner lane={lane} />
      <PageHeader
        no={3}
        icon="products"
        accent="amber"
        title="Sản phẩm & Link"
        description="Kho sản phẩm + link affiliate Shopee. Mọi nội dung phải gắn link đúng owner."
        actions={
          <Button variant="primary">
            <UtilIcon name="plus" /> Thêm sản phẩm
          </Button>
        }
      />

      <Card>
        <CardHeader
          title="Affiliate owner bắt buộc"
          subtitle="Link sai owner = fail-safe, không xuất bản"
          accentClass="text-accent-amber"
          right={
            <Badge accent="green">
              <span className="font-mono">{SHOPEE_OWNER}</span>
            </Badge>
          }
        />
      </Card>

      <ShopeeRegistrySection />

      <Card>
        <CardHeader
          title="Danh sách sản phẩm"
          subtitle={`${PRODUCTS.length} sản phẩm (mock)`}
          no={3}
          accentClass="text-accent-amber"
        />
        <CardBody className="!p-0">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
              <tr className="border-b border-hairline">
                <th className="px-5 py-2.5 font-medium">Sản phẩm</th>
                <th className="px-5 py-2.5 font-medium">Giá</th>
                <th className="px-5 py-2.5 font-medium">Ngách</th>
                <th className="px-5 py-2.5 font-medium">Affiliate link</th>
                <th className="px-5 py-2.5 font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {PRODUCTS.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-hairline/60 last:border-0 hover:bg-raised/30"
                >
                  <td className="px-5 py-3">
                    <p className="font-medium text-neutral-100">{p.name}</p>
                    <p className="font-mono text-[10px] text-neutral-600">{p.id}</p>
                  </td>
                  <td className="px-5 py-3 font-semibold text-neutral-200">{p.price}</td>
                  <td className="px-5 py-3">
                    <LanePill laneId={p.laneId} />
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex max-w-[260px] items-center gap-1.5 truncate font-mono text-[11px] text-accent-blue">
                      <UtilIcon name="link" width={13} height={13} />
                      <span className="truncate">{p.affiliateLink}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={p.status} />
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
