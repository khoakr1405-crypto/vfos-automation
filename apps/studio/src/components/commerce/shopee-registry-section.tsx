'use client';

/* =============================================================================
 * VFOS Studio — Shopee Affiliate Registry section (Studio Commerce UI 01)
 * -----------------------------------------------------------------------------
 * Local-only. Lists verified Shopee links already captured in the registry and
 * lets the operator promote ONE link into the current Product Card — reusing the
 * no-click `shopee:card-from-registry` command on the server. NO click on Shopee,
 * NO browser automation, NO live extraction, NO publish. Canonical/credential is
 * never shown.
 * ========================================================================== */

import { Badge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { UtilIcon } from '@/components/icons';
import { Button } from '@/components/ui';
import { useCallback, useEffect, useState } from 'react';

interface RegistryItem {
  shortLink: string;
  productName: string;
  shopid: string;
  itemid: string;
  affiliateOwnerId: string;
  ownerVerified: boolean;
  status: string;
  score?: number;
  commissionRate?: string;
  price?: string;
  timesSeen?: number;
  lastSeenAt?: string;
}

interface CurrentCard {
  name: string;
  shopId: string;
  itemId: string;
  shortLink: string;
  affiliateOwnerId: string;
  score?: number;
  validationStatus?: string;
}

interface RegistryResponse {
  ok: boolean;
  expectedOwner: string;
  total: number;
  verifiedCount: number;
  latestShortLink: string | null;
  items: RegistryItem[];
  currentCard: CurrentCard | null;
}

export function ShopeeRegistrySection() {
  const [data, setData] = useState<RegistryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/commerce/shopee-registry');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as RegistryResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được registry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const promote = async (item: RegistryItem) => {
    setPromoting(item.shortLink);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch('/api/studio/commerce/shopee-card-from-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortLink: item.shortLink }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body?.message ?? `Promote thất bại (HTTP ${res.status}).`);
      }
      setNotice(`Đã tạo Product Card: ${body.card?.name ?? item.productName}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Promote thất bại.');
    } finally {
      setPromoting(null);
    }
  };

  const current = data?.currentCard ?? null;
  const verified = data?.items.filter((i) => i.ownerVerified) ?? [];

  return (
    <Card>
      <CardHeader
        title="Shopee Affiliate Registry"
        subtitle="Promote link đã lấy → Product Card (no-click, không mở browser, không lấy link lại)"
        accentClass="text-accent-amber"
        right={
          <Button
            variant="outline"
            className="!py-1 !px-2.5 text-[10px]"
            onClick={load}
            disabled={loading}
          >
            {loading ? 'Đang tải...' : 'Làm mới'}
          </Button>
        }
      />
      <CardBody className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-rose-400">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-lg border border-accent-green/20 bg-accent-green/10 p-3 text-accent-green">
            {notice}
          </div>
        )}

        {/* Registry status */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[11px] text-neutral-400">
          <span>
            Tổng link:{' '}
            <span className="font-mono font-semibold text-neutral-100">{data?.total ?? 0}</span>
          </span>
          <span>
            Verified:{' '}
            <span className="font-mono font-semibold text-accent-green">
              {data?.verifiedCount ?? 0}
            </span>
          </span>
          {data?.latestShortLink && (
            <span className="truncate">
              Mới nhất: <span className="font-mono text-accent-blue">{data.latestShortLink}</span>
            </span>
          )}
        </div>

        {/* Current Product Card */}
        <div className="rounded-lg border border-hairline bg-raised/30 p-3">
          <p className="mb-2 font-semibold uppercase tracking-wider text-neutral-500 text-[10px]">
            Product Card hiện tại
          </p>
          {current ? (
            <div className="space-y-1">
              <p className="font-medium text-neutral-100">{current.name}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-400">
                <span className="font-mono text-accent-blue">{current.shortLink}</span>
                <span>
                  shop/item:{' '}
                  <span className="font-mono text-neutral-300">
                    {current.shopId} / {current.itemId}
                  </span>
                </span>
                <span>
                  owner:{' '}
                  {current.affiliateOwnerId === data?.expectedOwner ? (
                    <Badge accent="green">{current.affiliateOwnerId}</Badge>
                  ) : (
                    <Badge accent="rose">{current.affiliateOwnerId || '(none)'}</Badge>
                  )}
                </span>
                {typeof current.score === 'number' && <span>score: {current.score}/10</span>}
              </div>
            </div>
          ) : (
            <p className="italic text-neutral-500">Chưa có Product Card.</p>
          )}
        </div>

        {/* Verified links table */}
        <div>
          <p className="mb-2 font-semibold uppercase tracking-wider text-neutral-500 text-[10px]">
            Link verified ({verified.length})
          </p>
          {verified.length === 0 ? (
            <p className="italic text-neutral-500 py-2">
              {loading ? 'Đang tải...' : 'Chưa có link verified trong registry.'}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-hairline">
              <table className="w-full text-left text-[11px]">
                <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
                  <tr className="border-b border-hairline">
                    <th className="px-3 py-2 font-medium">Sản phẩm</th>
                    <th className="px-3 py-2 font-medium">Short link</th>
                    <th className="px-3 py-2 font-medium">shop/item</th>
                    <th className="px-3 py-2 font-medium">Owner</th>
                    <th className="px-3 py-2 font-medium">Score</th>
                    <th className="px-3 py-2 font-medium">Lần thấy</th>
                    <th className="px-3 py-2 font-medium text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {verified.map((it) => {
                    const isCurrent = current?.itemId === it.itemid;
                    return (
                      <tr
                        key={it.shortLink}
                        className="border-b border-hairline/60 last:border-0 hover:bg-raised/30"
                      >
                        <td className="px-3 py-2.5 max-w-[260px]">
                          <p className="truncate font-medium text-neutral-100">{it.productName}</p>
                          <p className="text-[10px] text-neutral-500">
                            {it.commissionRate ? `commission ${it.commissionRate}` : ''}
                            {it.price ? ` · ${it.price}` : ''}
                          </p>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1 font-mono text-accent-blue">
                            <UtilIcon name="link" width={12} height={12} />
                            {it.shortLink.replace('https://', '')}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-neutral-400">
                          {it.shopid}/{it.itemid}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge accent="green">verified</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-neutral-300">
                          {typeof it.score === 'number' ? `${it.score}/10` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-neutral-400">{it.timesSeen ?? 1}</td>
                        <td className="px-3 py-2.5 text-right">
                          {isCurrent ? (
                            <Badge accent="cyan">đang dùng</Badge>
                          ) : (
                            <Button
                              variant="primary"
                              className="!py-1 !px-2 text-[10px]"
                              onClick={() => promote(it)}
                              disabled={promoting !== null}
                            >
                              {promoting === it.shortLink ? 'Đang promote...' : 'Promote → Card'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-hairline bg-raised/20 p-3 text-[10px] text-neutral-500">
          Read-only bridge: dùng lại lệnh{' '}
          <span className="font-mono">shopee:card-from-registry</span> — không click Shopee, không
          mở browser, không lấy link mới, không publish. Canonical link có credential không bao giờ
          hiển thị.
        </div>
      </CardBody>
    </Card>
  );
}
