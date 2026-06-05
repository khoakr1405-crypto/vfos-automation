'use client';

/* =============================================================================
 * VFOS Studio — Create flow config form (Studio UI Action Wiring 01)
 * -----------------------------------------------------------------------------
 * Local-only client component. Loads the CURRENT Product Card
 * (GET /api/studio/commerce/current-product-card) and renders it as the real
 * "Chọn sản phẩm" + preview in the /create flow — replacing the old hardcoded
 * "Máy rửa xe mini Zukul" mock. Wires the first real step transition
 * (Step 1 Thông tin → Step 2 Nguồn) client-side. NO job creation, NO publish,
 * NO Shopee/Facebook/TikTok API, NO browser automation. Canonical/credential is
 * never fetched or shown.
 * ========================================================================== */

import { PlatformPill } from '@/components/badge';
import { Badge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { Icon } from '@/components/icons';
import { Button, FakeSelect, Field } from '@/components/ui';
import { PLATFORMS } from '@/lib/mock-data';
import { useCallback, useEffect, useState } from 'react';

const STEPS = ['Thông tin', 'Nguồn', 'Cài đặt', 'Xác nhận'];

interface CardSummary {
  name: string;
  shopId: string;
  itemId: string;
  shortLink: string;
  affiliateOwnerId: string;
  ownerVerified: boolean;
  validationStatus: string;
  score?: number;
  commissionRate?: string;
  price?: string;
}

interface CardResponse {
  ok: boolean;
  expectedOwner: string;
  hasCard: boolean;
  card: CardSummary | null;
}

export function CreateConfigForm() {
  const [data, setData] = useState<CardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0); // 0 = Thông tin, 1 = Nguồn (only 0↔1 wired)

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/commerce/current-product-card');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as CardResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được Product Card.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const card = data?.card ?? null;
  const expectedOwner = data?.expectedOwner ?? 'an_17376660568';
  const ownerOk = card?.ownerVerified ?? false;
  const canContinue = card !== null && ownerOk;

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          {STEPS.map((label, i) => {
            const active = i === step;
            const reachable = i <= 1; // only first two steps are wired this round
            return (
              <div key={label} className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    active ? 'bg-accent-violet text-white' : 'bg-raised text-neutral-500'
                  }`}
                >
                  {i + 1}
                </span>
                <span
                  className={`text-xs ${
                    active
                      ? 'text-neutral-100'
                      : reachable
                        ? 'text-neutral-400'
                        : 'text-neutral-600'
                  }`}
                >
                  {label}
                </span>
                {i < STEPS.length - 1 && <span className="mx-1 text-neutral-700">→</span>}
              </div>
            );
          })}
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Config form */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Cấu hình job"
            subtitle={step === 0 ? 'Bước 1 — Thông tin (sản phẩm thật)' : 'Bước 2 — Nguồn video'}
            no={4}
            accentClass="text-accent-violet"
          />
          <CardBody className="space-y-4">
            {error && (
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400">
                {error}
              </div>
            )}

            {step === 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Chọn sản phẩm (Product Card hiện tại)">
                  {loading ? (
                    <FakeSelect value="Đang tải..." />
                  ) : card ? (
                    <div className="flex items-center justify-between rounded-lg border border-accent-green/30 bg-accent-green/5 px-3 py-2 text-xs text-neutral-100">
                      <span className="truncate pr-2">{card.name}</span>
                      <Badge accent={ownerOk ? 'green' : 'rose'}>
                        {ownerOk ? 'verified' : 'owner?'}
                      </Badge>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-accent-amber/30 bg-accent-amber/10 px-3 py-2 text-xs text-accent-amber">
                      Chưa có Product Card.{' '}
                      <a href="/products" className="underline">
                        Promote một link ở /products
                      </a>
                      .
                    </div>
                  )}
                </Field>
                <Field label="Chọn cụm kênh">
                  <FakeSelect value="Mẹ & Bé · Đồ dùng em bé" />
                </Field>
                <Field label="Loại nội dung">
                  <FakeSelect value="Review sản phẩm" />
                </Field>
                <Field label="Nền tảng đích">
                  <FakeSelect value="Facebook Reels · TikTok" />
                </Field>
                <Field label="Định dạng">
                  <FakeSelect value="9:16 (1080×1920)" />
                </Field>
                <Field label="Ngôn ngữ">
                  <FakeSelect value="Tiếng Việt" />
                </Field>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-neutral-300">
                <p className="text-neutral-400">
                  Bước nguồn video cho sản phẩm:{' '}
                  <span className="font-medium text-neutral-100">{card?.name}</span>
                </p>
                <div className="rounded-lg border border-hairline bg-raised/30 p-3 text-[11px] text-neutral-500">
                  Chọn / reup nguồn video sẽ nối ở round sau. Round này mới wire bước chọn sản phẩm
                  thật + chuyển bước. Chưa tạo job, chưa render, chưa publish.
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-hairline pt-3">
              <div className="text-[10px] text-neutral-500">
                {card
                  ? `shop/item ${card.shopId}/${card.itemId} · owner ${card.affiliateOwnerId}`
                  : `Owner bắt buộc: ${expectedOwner}`}
              </div>
              <div className="flex gap-2">
                {step === 1 && (
                  <Button variant="ghost" onClick={() => setStep(0)}>
                    ← Quay lại
                  </Button>
                )}
                {step === 0 ? (
                  <Button
                    variant="primary"
                    onClick={() => setStep(1)}
                    disabled={!canContinue}
                    title={
                      canContinue
                        ? 'Sang bước nguồn video'
                        : 'Cần Product Card hợp lệ (đúng owner) để tiếp tục'
                    }
                  >
                    Tiếp tục → Nguồn
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    disabled
                    title="Tạo job thật sẽ wire ở round sau — cần Operator duyệt"
                  >
                    <Icon name="create" width={14} height={14} /> Tạo job (chờ duyệt)
                  </Button>
                )}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader
            title="Xem trước sản phẩm"
            subtitle={card ? 'Product Card hiện tại (thật)' : 'Chưa có Product Card'}
            accentClass="text-accent-violet"
          />
          <CardBody className="space-y-3">
            <div className="flex aspect-[9/16] max-h-72 w-full items-center justify-center rounded-xl border border-hairline bg-gradient-to-br from-raised to-panel">
              <div className="text-center">
                <Icon name="rawvisual" width={34} height={34} />
                <p className="mt-2 text-[11px] text-neutral-500">Preview 9:16</p>
              </div>
            </div>
            {card ? (
              <div className="rounded-xl border border-hairline bg-raised/40 px-3.5 py-3">
                <p className="text-xs font-semibold text-neutral-100">{card.name}</p>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  {card.price ? `Giá: ${card.price} · ` : ''}
                  {card.commissionRate ? `Hoa hồng ${card.commissionRate} · ` : ''}
                  Shopee Affiliate
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge accent={ownerOk ? 'green' : 'rose'}>
                    owner {ownerOk ? 'OK' : 'mismatch'}
                  </Badge>
                  {typeof card.score === 'number' && (
                    <Badge accent="cyan">score {card.score}/10</Badge>
                  )}
                  {PLATFORMS.filter((p) => p.id !== 'youtube').map((p) => (
                    <PlatformPill key={p.id} platform={p.id} />
                  ))}
                </div>
                <p className="mt-2 font-mono text-[10px] text-accent-blue">{card.shortLink}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/10 px-3.5 py-3 text-[11px] text-accent-amber">
                Chưa có Product Card. Vào{' '}
                <a href="/products" className="underline">
                  /products
                </a>{' '}
                để promote một link verified.
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
