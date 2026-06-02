'use client';

import type { ProductRowDTO } from '@/lib/studio-data/types';
import { useEffect, useState } from 'react';
import { Badge } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';

type LoadState = 'loading' | 'ready' | 'error';

// Round UI-02: product rows derive từ job thật (read-only) qua /api/studio/overview.
// KHÔNG expose affiliate URL/token — chỉ owner id (public attribution) + cờ valid.
export function ProductQueue() {
  const [products, setProducts] = useState<ProductRowDTO[]>([]);
  const [load, setLoad] = useState<LoadState>('loading');

  useEffect(() => {
    let alive = true;
    fetch('/api/studio/overview')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { products?: ProductRowDTO[] }) => {
        if (!alive) return;
        setProducts(Array.isArray(data.products) ? data.products : []);
        setLoad('ready');
      })
      .catch(() => {
        if (!alive) return;
        setLoad('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  const getJobStatusLabel = (item: ProductRowDTO) => {
    const map: Record<ProductRowDTO['jobStatus'], { text: string; cls: string; dot: string }> = {
      RUNNING: {
        text: 'Đang sản xuất',
        cls: 'text-accent-cyan',
        dot: 'bg-accent-cyan animate-pulse',
      },
      REVIEW: { text: 'Chờ duyệt', cls: 'text-accent-amber', dot: 'bg-accent-amber' },
      DONE: { text: 'Đã duyệt/đóng gói', cls: 'text-accent-green', dot: 'bg-accent-green' },
      WAITING_SOURCE: { text: 'Chờ nguồn', cls: 'text-accent-amber', dot: 'bg-accent-amber' },
      FAILED: { text: 'Lỗi kỹ thuật', cls: 'text-accent-rose', dot: 'bg-accent-rose' },
    };
    const m = map[item.jobStatus];
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${m.cls}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
        {m.text}
        <span className="font-mono text-[10px] text-neutral-500">({item.jobId})</span>
      </span>
    );
  };

  return (
    <Card>
      <CardHeader
        title="Hàng đợi sản phẩm & Liên kết Affiliate"
        subtitle="Product-First: mỗi job sản xuất video bắt đầu từ 1 sản phẩm (đọc job thật, read-only)"
        accentClass="text-accent-amber"
      />
      <CardBody className="overflow-x-auto">
        {load === 'loading' && (
          <p className="px-4 py-6 text-center text-xs text-neutral-500">Đang tải sản phẩm thật…</p>
        )}
        {load === 'error' && (
          <p className="px-4 py-6 text-center text-xs text-accent-rose">
            Không đọc được product thật — UI vẫn an toàn.
          </p>
        )}
        {load === 'ready' && products.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-neutral-500">
            Chưa có sản phẩm gắn job thật nào.
          </p>
        )}
        {load === 'ready' && products.length > 0 && (
          <table className="w-full min-w-[700px] border-collapse text-left">
            <thead>
              <tr className="border-b border-hairline text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                <th className="px-4 py-2.5">Sản phẩm</th>
                <th className="px-4 py-2.5">Sàn Affiliate</th>
                <th className="px-4 py-2.5">Owner Validation</th>
                <th className="px-4 py-2.5">Hoa hồng</th>
                <th className="px-4 py-2.5">Lane phù hợp</th>
                <th className="px-4 py-2.5 text-right">Trạng thái Job</th>
              </tr>
            </thead>
            <tbody>
              {products.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-hairline/50 last:border-0 hover:bg-raised/20 transition"
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-neutral-200 text-xs">{item.name}</div>
                    <div className="font-mono text-[9px] text-neutral-500 mt-0.5">
                      {item.id}
                      {item.jobCount > 1 ? ` · ${item.jobCount} job` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-400">{item.platform}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-neutral-400 font-bold bg-neutral-950 border border-hairline px-2 py-0.5 rounded">
                        {item.ownerId ?? '—'}
                      </span>
                      {item.ownerValid ? (
                        <span className="text-accent-green flex items-center text-[10px] font-bold gap-0.5">
                          <UtilIcon name="check" width={10} height={10} /> Valid
                        </span>
                      ) : (
                        <span className="text-accent-amber flex items-center text-[10px] font-bold gap-0.5">
                          <UtilIcon name="bell" width={10} height={10} /> Chưa xác minh
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs font-bold text-neutral-400">
                    {item.commission}
                  </td>
                  <td className="px-4 py-3">
                    <Badge accent="blue">{item.laneFit}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">{getJobStatusLabel(item)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody>
    </Card>
  );
}
