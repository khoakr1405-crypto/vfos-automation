'use client';

import { useState } from 'react';
import { Badge } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';
import { Button } from '../ui';

interface ProductItem {
  id: string;
  name: string;
  platform: string;
  linkStatus: 'valid' | 'invalid';
  ownerId: string;
  commission: string;
  laneFit: string;
  jobStatus: 'RUNNING' | 'FAILED' | 'NOT_CREATED' | 'CREATING' | 'WAITING_SOURCE';
  jobId?: string;
}

const INITIAL_PRODUCTS: ProductItem[] = [
  {
    id: 'P-1001',
    name: 'Máy rửa xe mini Zukul cao cấp',
    platform: 'Shopee Affiliate',
    linkStatus: 'valid',
    ownerId: 'an_17376660568',
    commission: '12.5%',
    laneFit: 'Review sản phẩm',
    jobStatus: 'RUNNING',
    jobId: 'JOB-2401',
  },
  {
    id: 'P-1002',
    name: 'Cần câu Carbon 2m1 siêu bền',
    platform: 'Shopee Affiliate',
    linkStatus: 'valid',
    ownerId: 'an_17376660568',
    commission: '15.0%',
    laneFit: 'Review sản phẩm',
    jobStatus: 'FAILED',
    jobId: 'JOB-2402',
  },
  {
    id: 'P-1003',
    name: 'Máy xay sinh tố cầm tay sạc USB',
    platform: 'Shopee Affiliate',
    linkStatus: 'valid',
    ownerId: 'an_17376660568',
    commission: '10.0%',
    laneFit: 'Review sản phẩm',
    jobStatus: 'RUNNING',
    jobId: 'JOB-2403',
  },
  {
    id: 'P-1004',
    name: 'Nồi chiên không dầu Lock&Lock 5.2L',
    platform: 'Shopee Affiliate',
    linkStatus: 'valid',
    ownerId: 'an_17376660568',
    commission: '8.5%',
    laneFit: 'Review sản phẩm',
    jobStatus: 'NOT_CREATED',
  },
];

export function ProductQueue() {
  const [products, setProducts] = useState<ProductItem[]>(INITIAL_PRODUCTS);

  const handleCreateJob = (id: string) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, jobStatus: 'CREATING' } : p)));

    setTimeout(() => {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                jobStatus: 'WAITING_SOURCE',
              }
            : p,
        ),
      );
    }, 1200);
  };

  const handleProvideSource = (id: string) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              jobStatus: 'RUNNING',
              jobId: `JOB-${Math.floor(Math.random() * 900) + 2404}`,
            }
          : p,
      ),
    );
  };

  const getJobStatusLabel = (item: ProductItem) => {
    if (item.jobStatus === 'CREATING') {
      return (
        <span className="inline-flex items-center text-xs text-accent-violet font-semibold gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-violet animate-ping" />
          Đang khởi tạo...
        </span>
      );
    }
    if (item.jobStatus === 'WAITING_SOURCE') {
      return (
        <div className="flex flex-col items-end gap-1.5">
          <span className="inline-flex items-center text-[10px] text-accent-amber font-bold gap-1 bg-accent-amber/10 px-2 py-0.5 rounded border border-accent-amber/20">
            ⚠️ Waiting for Operator source video
          </span>
          <Button
            variant="ghost"
            className="border border-accent-amber/40 hover:bg-accent-amber/10 text-accent-amber font-bold px-2 py-0.5 text-[10px] rounded"
            onClick={() => handleProvideSource(item.id)}
          >
            [ + Nhập Video Nguồn ]
          </Button>
        </div>
      );
    }
    if (item.jobStatus === 'RUNNING') {
      return (
        <span className="inline-flex items-center text-xs text-accent-cyan font-semibold gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-cyan animate-pulse" />
          Đang chạy ({item.jobId})
        </span>
      );
    }
    if (item.jobStatus === 'FAILED') {
      return (
        <span className="inline-flex items-center text-xs text-accent-rose font-semibold gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-rose" />
          Lỗi kỹ thuật ({item.jobId})
        </span>
      );
    }
    return (
      <Button
        variant="ghost"
        className="border border-hairline/80 hover:bg-raised/40 text-neutral-300 font-bold px-3 py-1 text-xs"
        onClick={() => handleCreateJob(item.id)}
      >
        Tạo Job
      </Button>
    );
  };

  return (
    <Card>
      <CardHeader
        title="Hàng đợi sản phẩm & Liên kết Affiliate"
        subtitle="Quy trình Product-First: job sản xuất video luôn bắt đầu từ lựa chọn sản phẩm trước"
        accentClass="text-accent-amber"
      />
      <CardBody className="overflow-x-auto">
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
                  <div className="font-mono text-[9px] text-neutral-500 mt-0.5">{item.id}</div>
                </td>
                <td className="px-4 py-3 text-xs text-neutral-400">{item.platform}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-neutral-400 font-bold bg-neutral-950 border border-hairline px-2 py-0.5 rounded">
                      {item.ownerId}
                    </span>
                    <span className="text-accent-green flex items-center text-[10px] font-bold gap-0.5">
                      <UtilIcon name="check" width={10} height={10} /> Valid
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs font-bold text-accent-green">{item.commission}</td>
                <td className="px-4 py-3">
                  <Badge accent="blue">{item.laneFit}</Badge>
                </td>
                <td className="px-4 py-3 text-right">{getJobStatusLabel(item)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}
