/**
 * /market/sell — 5-step skin listing wizard (Sprint W-1 P1).
 *
 * Wires the existing backend POST /api/v1/marketplace/pets endpoint.
 *
 * Steps:
 *   1. Select skin (from user's owned skins)
 *   2. Mode (fixed / auction / rental) + price
 *   3. Royalty + remix policy
 *   4. Description + tags
 *   5. Confirm & submit
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { MarketingLayout } from '../../components/marketing/MarketingLayout';
import { buildSeo } from '../../lib/seo';
import { useLocalization } from '../../contexts/LocalizationContext';
import { Check, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../../lib/api/client';

interface PetSkin {
  id: string;
  display_name?: string;
  thumbnail_url?: string;
  format?: string;
  source?: string;
}

type Mode = 'fixed_price' | 'auction' | 'rental';

interface DraftListing {
  petSkinId: string;
  mode: Mode;
  priceUsd: string;
  startingBidUsd: string;
  auctionDurationHours: number;
  rentalPricePerDayUsd: string;
  rentalDurationDays: number;
  royaltyRateBps: number;
  description: string;
}

const STEPS = ['select', 'pricing', 'royalty', 'description', 'confirm'] as const;

export default function SellPage() {
  const { t } = useLocalization();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [skins, setSkins] = useState<PetSkin[]>([]);
  const [skinsLoading, setSkinsLoading] = useState(true);
  const [skinsError, setSkinsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState(false);

  const [draft, setDraft] = useState<DraftListing>({
    petSkinId: '',
    mode: 'fixed_price',
    priceUsd: '5.00',
    startingBidUsd: '1.00',
    auctionDurationHours: 24,
    rentalPricePerDayUsd: '0.50',
    rentalDurationDays: 7,
    royaltyRateBps: 500,
    description: '',
  });

  // Load user's skins on mount
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (!token) {
      setSkinsLoading(false);
      setSkinsError('not-authed');
      return;
    }
    void (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/v1/pet/skins`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const items: PetSkin[] = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
        // Only show user-created skins (cannot list system pets).
        setSkins(items.filter((s) => s.source !== 'platform'));
      } catch (e) {
        setSkinsError((e as Error).message);
      } finally {
        setSkinsLoading(false);
      }
    })();
  }, []);

  const stepLabels = useMemo(
    () => [
      t({ zh: '选择皮肤', en: 'Select Skin' }),
      t({ zh: '定价', en: 'Pricing' }),
      t({ zh: 'Remix 分成', en: 'Royalty' }),
      t({ zh: '描述', en: 'Description' }),
      t({ zh: '确认', en: 'Confirm' }),
    ],
    [t],
  );

  const canAdvance = (s: number): boolean => {
    if (s === 0) return Boolean(draft.petSkinId);
    if (s === 1) {
      if (draft.mode === 'fixed_price') return Number(draft.priceUsd) > 0;
      if (draft.mode === 'auction') return Number(draft.startingBidUsd) > 0 && draft.auctionDurationHours >= 1;
      return Number(draft.rentalPricePerDayUsd) > 0 && draft.rentalDurationDays >= 1;
    }
    if (s === 2) return draft.royaltyRateBps >= 0 && draft.royaltyRateBps <= 5000;
    return true;
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (!token) {
      setSubmitError('not-authed');
      setSubmitting(false);
      return;
    }
    try {
      const body: Record<string, unknown> = {
        pet_skin_id: draft.petSkinId,
        mode: draft.mode,
        royalty_rate_bps: draft.royaltyRateBps,
        description: draft.description || undefined,
      };
      if (draft.mode === 'fixed_price') {
        body.price_usd = draft.priceUsd;
      } else if (draft.mode === 'auction') {
        body.starting_bid_usd = draft.startingBidUsd;
        body.auction_duration_hours = draft.auctionDurationHours;
      } else {
        body.rental_price_per_day_usd = draft.rentalPricePerDayUsd;
        body.rental_duration_days = draft.rentalDurationDays;
      }
      const r = await fetch(`${API_BASE_URL}/v1/marketplace/pets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const errText = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status}: ${errText.slice(0, 200)}`);
      }
      const created = await r.json();
      setSubmitOk(true);
      // Redirect to listing detail after 2 seconds
      setTimeout(() => {
        const listingId = created?.id || created?.listing?.id;
        if (listingId) router.push(`/market/skin/${listingId}`);
        else router.push('/market');
      }, 2000);
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const seo = buildSeo({
    title: t({ zh: '上架皮肤 · Agentrix Marketplace', en: 'List Skin · Agentrix Marketplace' }),
    description: t({ zh: '5 步上架你的宠物皮肤', en: '5-step skin listing wizard' }),
    path: '/market/sell',
  });

  if (skinsError === 'not-authed') {
    return (
      <MarketingLayout seo={seo}>
        <section className="bg-agentrix-ink py-20">
          <div className="container mx-auto max-w-md px-6 text-center">
            <div className="text-5xl mb-4">🔒</div>
            <h1 className="text-2xl font-bold mb-3">
              {t({ zh: '请先登录', en: 'Please sign in' })}
            </h1>
            <p className="text-sm text-agentrix-mist mb-6">
              {t({
                zh: '上架皮肤需要登录账户。',
                en: 'You need to sign in to list a skin on the marketplace.',
              })}
            </p>
            <Link
              href="/auth/login"
              className="inline-block rounded-full bg-agentrix-electric px-6 py-2 text-sm font-bold text-agentrix-ink"
            >
              {t({ zh: '登录', en: 'Sign In' })}
            </Link>
          </div>
        </section>
      </MarketingLayout>
    );
  }

  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-12">
        <div className="container mx-auto max-w-2xl px-6">
          <h1 className="text-2xl font-extrabold text-center">
            {t({ zh: '上架你的皮肤', en: 'List Your Skin' })}
          </h1>

          {/* Stepper */}
          <div className="mt-8 flex items-center justify-between">
            {STEPS.map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1 flex-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                    i < step
                      ? 'bg-agentrix-electric text-agentrix-ink'
                      : i === step
                      ? 'bg-agentrix-solar text-agentrix-ink'
                      : 'bg-white/10 text-agentrix-mist'
                  }`}
                >
                  {i < step ? <Check size={14} /> : i + 1}
                </div>
                <span className="text-[10px] text-agentrix-mist whitespace-nowrap">{stepLabels[i]}</span>
              </div>
            ))}
          </div>

          {/* Step body */}
          <div className="mt-10 rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6">
            {/* Step 0: Select skin */}
            {step === 0 && (
              <div>
                <p className="text-sm text-agentrix-fog mb-4">
                  {t({ zh: '选择要上架的皮肤（仅限你创建的）', en: 'Select a skin you created to list' })}
                </p>
                {skinsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-agentrix-electric" />
                  </div>
                ) : skins.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-3xl mb-2">🎨</div>
                    <p className="text-sm text-agentrix-mist">
                      {t({ zh: '你还没有自创皮肤', en: 'You have no user-created skins yet' })}
                    </p>
                    <Link
                      href="/console/pet/create"
                      className="mt-4 inline-block rounded-full bg-agentrix-electric px-6 py-2 text-xs font-bold text-agentrix-ink"
                    >
                      {t({ zh: '去创作 →', en: 'Create One →' })}
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {skins.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setDraft({ ...draft, petSkinId: s.id })}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          draft.petSkinId === s.id
                            ? 'border-agentrix-electric bg-agentrix-electric/10'
                            : 'border-agentrix-inkLine hover:border-agentrix-electric/40'
                        }`}
                      >
                        {s.thumbnail_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.thumbnail_url} alt={s.display_name} className="w-full aspect-square rounded mb-2 object-cover" />
                        )}
                        <div className="text-xs font-medium text-white truncate">
                          {s.display_name || s.id.slice(0, 8)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 1: Pricing */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-agentrix-fog mb-2 block">
                    {t({ zh: '销售模式', en: 'Listing Mode' })}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['fixed_price', 'auction', 'rental'] as Mode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setDraft({ ...draft, mode: m })}
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                          draft.mode === m
                            ? 'border-agentrix-electric bg-agentrix-electric/10 text-agentrix-electric'
                            : 'border-agentrix-inkLine text-agentrix-mist hover:text-white'
                        }`}
                      >
                        {m === 'fixed_price' && t({ zh: '一口价', en: 'Fixed' })}
                        {m === 'auction' && t({ zh: '拍卖', en: 'Auction' })}
                        {m === 'rental' && t({ zh: '租赁', en: 'Rental' })}
                      </button>
                    ))}
                  </div>
                </div>

                {draft.mode === 'fixed_price' && (
                  <NumberField
                    label={t({ zh: '价格 (USD)', en: 'Price (USD)' })}
                    value={draft.priceUsd}
                    onChange={(v) => setDraft({ ...draft, priceUsd: v })}
                    step="0.01"
                    min="0.01"
                  />
                )}
                {draft.mode === 'auction' && (
                  <>
                    <NumberField
                      label={t({ zh: '起拍价 (USD)', en: 'Starting Bid (USD)' })}
                      value={draft.startingBidUsd}
                      onChange={(v) => setDraft({ ...draft, startingBidUsd: v })}
                      step="0.01"
                      min="0.01"
                    />
                    <NumberField
                      label={t({ zh: '拍卖时长 (小时)', en: 'Auction Duration (hours)' })}
                      value={String(draft.auctionDurationHours)}
                      onChange={(v) => setDraft({ ...draft, auctionDurationHours: Number(v) || 24 })}
                      step="1"
                      min="1"
                    />
                  </>
                )}
                {draft.mode === 'rental' && (
                  <>
                    <NumberField
                      label={t({ zh: '日租金 (USD/天)', en: 'Daily Rental (USD/day)' })}
                      value={draft.rentalPricePerDayUsd}
                      onChange={(v) => setDraft({ ...draft, rentalPricePerDayUsd: v })}
                      step="0.01"
                      min="0.01"
                    />
                    <NumberField
                      label={t({ zh: '租期 (天)', en: 'Rental Duration (days)' })}
                      value={String(draft.rentalDurationDays)}
                      onChange={(v) => setDraft({ ...draft, rentalDurationDays: Number(v) || 7 })}
                      step="1"
                      min="1"
                    />
                  </>
                )}
              </div>
            )}

            {/* Step 2: Royalty */}
            {step === 2 && (
              <div>
                <label className="text-sm text-agentrix-fog mb-2 block">
                  {t({
                    zh: 'Remix 分成（被衍生时你的版权抽成）',
                    en: 'Remix Royalty (% you receive on derivatives)',
                  })}
                </label>
                <input
                  type="range"
                  min={0}
                  max={5000}
                  step={50}
                  value={draft.royaltyRateBps}
                  onChange={(e) => setDraft({ ...draft, royaltyRateBps: Number(e.target.value) })}
                  className="w-full"
                />
                <div className="text-center text-2xl font-bold text-agentrix-electric mt-2">
                  {(draft.royaltyRateBps / 100).toFixed(1)}%
                </div>
                <p className="text-xs text-agentrix-mist mt-2 text-center">
                  {t({
                    zh: '范围 0-50%。建议 5-10%。',
                    en: 'Range 0-50%. Recommended 5-10%.',
                  })}
                </p>
              </div>
            )}

            {/* Step 3: Description */}
            {step === 3 && (
              <div>
                <label className="text-sm text-agentrix-fog mb-2 block">
                  {t({ zh: '描述（可选）', en: 'Description (optional)' })}
                </label>
                <textarea
                  rows={6}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder={t({
                    zh: '让买家了解你的皮肤特色 / 风格 / 灵感来源',
                    en: 'Tell buyers about the style / inspiration of your skin',
                  })}
                  className="w-full rounded-lg border border-agentrix-inkLine bg-agentrix-ink px-3 py-2 text-sm text-white placeholder:text-agentrix-mist focus:border-agentrix-electric focus:outline-none"
                />
              </div>
            )}

            {/* Step 4: Confirm */}
            {step === 4 && (
              <div className="space-y-2 text-sm">
                <p className="text-agentrix-fog mb-3">
                  {t({ zh: '请确认上架信息：', en: 'Confirm your listing:' })}
                </p>
                <ConfirmRow label={t({ zh: '皮肤 ID', en: 'Skin ID' })} value={draft.petSkinId.slice(0, 16) + '...'} />
                <ConfirmRow label={t({ zh: '模式', en: 'Mode' })} value={draft.mode} />
                <ConfirmRow
                  label={t({ zh: '价格', en: 'Price' })}
                  value={
                    draft.mode === 'fixed_price'
                      ? `$${draft.priceUsd}`
                      : draft.mode === 'auction'
                      ? `$${draft.startingBidUsd} / ${draft.auctionDurationHours}h`
                      : `$${draft.rentalPricePerDayUsd}/day × ${draft.rentalDurationDays}d`
                  }
                />
                <ConfirmRow
                  label={t({ zh: 'Remix 抽成', en: 'Remix Royalty' })}
                  value={`${(draft.royaltyRateBps / 100).toFixed(1)}%`}
                />

                {submitError && (
                  <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                    {submitError}
                  </div>
                )}
                {submitOk && (
                  <div className="mt-4 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">
                    ✓ {t({ zh: '上架成功！正在跳转…', en: 'Listed successfully — redirecting…' })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="mt-6 flex justify-between">
            <button
              type="button"
              disabled={step === 0 || submitting}
              onClick={() => setStep((s) => s - 1)}
              className="rounded-full bg-white/10 px-6 py-2 text-sm font-semibold text-white disabled:opacity-30"
            >
              {t({ zh: '上一步', en: 'Back' })}
            </button>
            <button
              type="button"
              disabled={!canAdvance(step) || submitting || submitOk}
              onClick={() => {
                if (step === STEPS.length - 1) {
                  void submit();
                } else {
                  setStep((s) => s + 1);
                }
              }}
              className="rounded-full bg-agentrix-electric px-6 py-2 text-sm font-bold text-agentrix-ink disabled:opacity-50"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  {t({ zh: '提交中…', en: 'Submitting…' })}
                </span>
              ) : step === STEPS.length - 1 ? (
                t({ zh: '提交审核', en: 'Submit' })
              ) : (
                t({ zh: '下一步', en: 'Next' })
              )}
            </button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
  min,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
  min?: string;
}) {
  return (
    <div>
      <label className="text-sm text-agentrix-fog mb-2 block">{label}</label>
      <input
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-agentrix-inkLine bg-agentrix-ink px-3 py-2 text-sm text-white focus:border-agentrix-electric focus:outline-none"
      />
    </div>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-agentrix-inkLine py-2">
      <span className="text-agentrix-mist">{label}</span>
      <span className="text-white font-mono">{value}</span>
    </div>
  );
}
