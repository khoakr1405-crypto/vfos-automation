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
import { Icon, UtilIcon } from '@/components/icons';
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
  productImageUrl?: string | null;
}

interface CardResponse {
  ok: boolean;
  expectedOwner: string;
  hasCard: boolean;
  card: CardSummary | null;
}

function getChineseSearchKeywords(productName: string): string[] {
  const nameLower = productName.toLowerCase();
  const hasBaby =
    nameLower.includes('bé') ||
    nameLower.includes('sơ sinh') ||
    nameLower.includes('trẻ em') ||
    nameLower.includes('baby');
  const hasCarrier =
    nameLower.includes('địu') || nameLower.includes('đai') || nameLower.includes('bế');
  const hasNeck = nameLower.includes('đỡ cổ') || nameLower.includes('hỗ trợ cổ');

  if (hasBaby && hasCarrier) {
    if (hasNeck) {
      return ['婴儿护颈背带 多功能抱带', '婴儿背带 护颈 多功能'];
    }
    return ['婴儿背带 多功能抱带', '婴儿腰凳 抱娃神器'];
  }

  if (nameLower.includes('áo') || nameLower.includes('quần') || nameLower.includes('váy')) {
    return ['儿童衣服 韩版童装', '宝宝衣服 纯棉'];
  }

  if (nameLower.includes('đồ chơi') || nameLower.includes('toy')) {
    return ['儿童玩具 益智玩具', '益智玩具 趣味'];
  }

  const words = productName
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 3)
    .join(' ');
  return ['婴儿用品 推荐', `${words} 厂家直销`];
}

export function CreateConfigForm() {
  const [data, setData] = useState<CardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0); // 0 = Thông tin, 1 = Nguồn, 2 = Kiểm tra nguồn
  const [sourceKind, setSourceKind] = useState<'none' | 'url' | 'local'>('none');
  const [sourceUrl, setSourceUrl] = useState('');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [savingSource, setSavingSource] = useState(false);
  const [sourceNotice, setSourceNotice] = useState<string | null>(null);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [draftOtherProduct, setDraftOtherProduct] = useState(false);

  const handleCopy = (text: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopiedText(text);
          setTimeout(() => {
            setCopiedText(null);
          }, 2000);
        })
        .catch(() => {});
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setImgError(false);
    try {
      const res = await fetch('/api/studio/commerce/current-product-card');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const cardResp = (await res.json()) as CardResponse;
      setData(cardResp);
      // Load saved source-URL draft; preload it only if it belongs to the
      // current Product Card (match by shortLink or shopid/itemid).
      try {
        const dres = await fetch('/api/studio/create/source-draft');
        if (dres.ok) {
          const dbody = (await dres.json()) as {
            draft: {
              product: { shortLink: string; shopid: string; itemid: string } | null;
              source: { url: string };
            } | null;
          };
          const draft = dbody.draft;
          const c = cardResp.card;
          if (draft?.source?.url) {
            const matches =
              !!c &&
              !!draft.product &&
              (draft.product.shortLink === c.shortLink ||
                (draft.product.shopid === c.shopId && draft.product.itemid === c.itemId));
            if (matches) {
              setSourceKind('url');
              setSourceUrl(draft.source.url);
              setSavedUrl(draft.source.url);
              setDraftOtherProduct(false);
            } else {
              setDraftOtherProduct(true);
            }
          }
        }
      } catch {
        // Draft load is best-effort — never block the Product Card.
      }
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

  // Step 2 source state — persisted as a runtime draft via
  // /api/studio/create/source-draft (gitignored). No download, no fetch.
  const trimmedUrl = sourceUrl.trim();
  const urlValid = /^https?:\/\/\S+/i.test(trimmedUrl);
  const urlInvalid = sourceKind === 'url' && trimmedUrl.length > 0 && !urlValid;
  const sourceReady = sourceKind === 'url' && urlValid;

  const saveSource = async () => {
    setSavingSource(true);
    setSourceNotice(null);
    try {
      const res = await fetch('/api/studio/create/source-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceKind: 'url', sourceUrl: trimmedUrl }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok)
        throw new Error(body?.message ?? `Lưu thất bại (HTTP ${res.status}).`);
      setSavedUrl(body.draft?.source?.url ?? trimmedUrl);
      setDraftOtherProduct(false);
      setSourceNotice('Đã lưu nguồn nháp');
    } catch (err) {
      setSourceNotice(err instanceof Error ? err.message : 'Lưu nguồn nháp thất bại.');
    } finally {
      setSavingSource(false);
    }
  };

  const clearSource = async () => {
    setSavingSource(true);
    setSourceNotice(null);
    try {
      const res = await fetch('/api/studio/create/source-draft', { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body?.message ?? 'Xoá thất bại.');
      setSavedUrl(null);
      setSourceUrl('');
      setDraftOtherProduct(false);
      setSourceNotice('Đã xoá nguồn nháp');
    } catch (err) {
      setSourceNotice(err instanceof Error ? err.message : 'Xoá nguồn nháp thất bại.');
    } finally {
      setSavingSource(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          {STEPS.map((label, i) => {
            const active = i === step;
            const reachable = i <= 2; // first three steps are wired this round
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
            subtitle={
              step === 0
                ? 'Bước 1 — Thông tin (sản phẩm thật)'
                : step === 1
                  ? 'Bước 2 — Nguồn video'
                  : 'Bước 3 — Kiểm tra nguồn'
            }
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

                {card && (
                  <div className="sm:col-span-2 rounded-lg border border-hairline bg-raised/20 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-neutral-200">
                        Gợi ý tìm nguồn video Trung Quốc
                      </span>
                      <span className="text-[10px] text-neutral-500">
                        Dùng để tìm nguồn video Trung Quốc/Douyin/TikTok
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {getChineseSearchKeywords(card.name).map((query) => {
                        const isCopied = copiedText === query;
                        return (
                          <div
                            key={query}
                            className="flex items-center justify-between gap-3 rounded border border-hairline/60 bg-panel/50 px-2.5 py-1.5"
                          >
                            <span className="font-mono text-xs text-neutral-200 selection:bg-accent-violet/30 selection:text-white">
                              {query}
                            </span>
                            <Button
                              variant={isCopied ? 'primary' : 'outline'}
                              className="!py-0.5 !px-2 text-[10px] h-6 flex items-center gap-1 font-medium min-w-[70px] justify-center transition-all duration-200"
                              onClick={() => handleCopy(query)}
                            >
                              {isCopied ? (
                                <>
                                  <UtilIcon name="check" width={10} height={10} /> Đã copy
                                </>
                              ) : (
                                'Copy'
                              )}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : step === 1 ? (
              <div className="space-y-3 text-xs text-neutral-300">
                <p className="text-neutral-400">
                  Nguồn video cho sản phẩm:{' '}
                  <span className="font-medium text-neutral-100">{card?.name}</span>
                  {card && <span className="ml-1 text-neutral-500">· itemid {card.itemId}</span>}
                </p>

                {/* Source kind selector */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={sourceKind === 'none' ? 'primary' : 'outline'}
                    className="!py-1 !px-2.5 text-[10px]"
                    onClick={() => setSourceKind('none')}
                  >
                    Chưa có nguồn
                  </Button>
                  <Button
                    variant={sourceKind === 'url' ? 'primary' : 'outline'}
                    className="!py-1 !px-2.5 text-[10px]"
                    onClick={() => setSourceKind('url')}
                  >
                    Dán URL video
                  </Button>
                  <Button
                    variant="outline"
                    className="!py-1 !px-2.5 text-[10px]"
                    disabled
                    title="File local — sẽ làm sau"
                  >
                    File local (coming soon)
                  </Button>
                </div>

                {/* URL input + runtime draft save — no download, no fetch */}
                {sourceKind === 'url' && (
                  <div className="space-y-2">
                    <input
                      type="url"
                      aria-label="URL video nguồn"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="https://… URL video nguồn"
                      className="w-full rounded-lg border border-hairline bg-panel/80 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-accent-violet"
                    />
                    {urlInvalid ? (
                      <p className="text-[11px] text-rose-400">
                        URL không hợp lệ — phải bắt đầu bằng http:// hoặc https://
                      </p>
                    ) : sourceReady ? (
                      <p className="text-[11px] text-accent-green">
                        URL hợp lệ. Bấm “Lưu nguồn nháp” để giữ lại sau khi refresh.
                      </p>
                    ) : (
                      <p className="text-[11px] text-neutral-500">
                        Dán URL video nguồn. Round này chưa tải/clip, chưa tạo job.
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="primary"
                        className="!py-1 !px-2.5 text-[10px]"
                        onClick={saveSource}
                        disabled={!sourceReady || savingSource}
                      >
                        {savingSource ? 'Đang lưu...' : 'Lưu nguồn nháp'}
                      </Button>
                      {(savedUrl || sourceUrl) && (
                        <Button
                          variant="outline"
                          className="!py-1 !px-2.5 text-[10px]"
                          onClick={clearSource}
                          disabled={savingSource}
                        >
                          Xoá nguồn nháp
                        </Button>
                      )}
                      {savedUrl && (
                        <span className="text-[10px] text-accent-green">
                          ✓ Đã lưu nháp — giữ sau khi refresh
                        </span>
                      )}
                    </div>

                    {sourceNotice && <p className="text-[11px] text-neutral-300">{sourceNotice}</p>}
                    {draftOtherProduct && (
                      <p className="text-[11px] text-accent-amber">
                        Có draft nguồn của sản phẩm khác — không áp cho Product Card hiện tại.
                      </p>
                    )}
                  </div>
                )}

                <div className="rounded-lg border border-hairline bg-raised/30 p-3 text-[11px] text-neutral-500">
                  Chưa tạo job · chưa render · chưa download · chưa publish. Nguồn chỉ lưu trong
                  client state ở round này.
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-neutral-300">
                <p className="text-neutral-400">
                  Kiểm tra nguồn cho sản phẩm:{' '}
                  <span className="font-medium text-neutral-100">{card?.name}</span>
                </p>
                <div className="space-y-1 rounded-lg border border-hairline bg-raised/30 p-3 text-[11px]">
                  <div>
                    Sản phẩm: <span className="text-neutral-100">{card?.name}</span>
                  </div>
                  <div>
                    itemid: <span className="font-mono text-neutral-300">{card?.itemId}</span>
                  </div>
                  <div>
                    Kiểu nguồn:{' '}
                    <span className="text-neutral-100">
                      {sourceKind === 'url'
                        ? 'URL video'
                        : sourceKind === 'local'
                          ? 'File local'
                          : 'Chưa có nguồn'}
                    </span>
                  </div>
                  {sourceKind === 'url' && (
                    <div className="break-all">
                      URL: <span className="font-mono text-accent-blue">{trimmedUrl}</span>
                      {savedUrl === trimmedUrl && trimmedUrl !== '' && (
                        <span className="ml-2 text-accent-green">· đã lưu nháp ✓</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-accent-amber/30 bg-accent-amber/10 p-3 text-[11px] text-accent-amber">
                  Đây là nháp client. Chưa ghi runtime, chưa tạo job, chưa render, chưa publish. Tạo
                  job thật sẽ wire ở round sau (cần Operator duyệt).
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
                {step > 0 && (
                  <Button variant="ghost" onClick={() => setStep(step - 1)}>
                    ← Quay lại
                  </Button>
                )}
                {step === 0 && (
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
                )}
                {step === 1 && (
                  <Button
                    variant="primary"
                    onClick={() => setStep(2)}
                    disabled={!sourceReady}
                    title={
                      sourceReady
                        ? 'Sang bước kiểm tra nguồn'
                        : 'Cần URL video hợp lệ (http:// hoặc https://) để tiếp tục'
                    }
                  >
                    Tiếp tục → Kiểm tra nguồn
                  </Button>
                )}
                {step === 2 && (
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
            <div className="flex aspect-[9/16] max-h-72 w-full items-center justify-center overflow-hidden rounded-xl border border-hairline bg-gradient-to-br from-raised to-panel">
              {card?.productImageUrl && !imgError ? (
                // Plain <img> on purpose: Shopee CDN is an external host, and
                // next/image would require remotePatterns config. onError falls
                // back to the "no image" placeholder below.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.productImageUrl}
                  alt={card.name}
                  className="h-full w-full object-contain"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="text-center">
                  <Icon name="rawvisual" width={34} height={34} />
                  <p className="mt-2 text-[11px] text-neutral-500">
                    {card ? 'Chưa có ảnh sản phẩm' : 'Preview 9:16'}
                  </p>
                </div>
              )}
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
