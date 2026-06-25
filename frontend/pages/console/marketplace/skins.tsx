import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type PetSkinDto } from '../../../lib/api/v1.api';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { T, cardStyle, btnPrimaryStyle } from '../../../lib/console.theme';

/**
 * V4 §3.2 — Web Skin Marketplace
 *
 *   GET  /v1/pet/skins/marketplace
 *   POST /v1/pet/skins/marketplace/:id/install
 *
 * 对应 PRD: docs/web-prd-v4.md §3.2
 */
const PAGE_SIZE = 30;

export default function ConsoleSkinMarketplacePage(): React.ReactElement {
  const { t } = useLocalization();
  const [items, setItems] = React.useState<PetSkinDto[]>([]);
  const [total, setTotal] = React.useState(0);
  const [offset, setOffset] = React.useState(0);
  const [source, setSource] = React.useState<'all' | 'platform' | 'generated' | 'remixed'>('all');
  const [loading, setLoading] = React.useState(true);
  const [installingId, setInstallingId] = React.useState<string | null>(null);
  const [installedIds, setInstalledIds] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await v1Api.pet.listMarketplace({
        limit: PAGE_SIZE,
        offset,
        source: source === 'all' ? undefined : source,
      });
      setItems(res?.items ?? []);
      setTotal(res?.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载市场失败');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [offset, source]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onInstall = async (skinId: string): Promise<void> => {
    if (installingId || installedIds.has(skinId)) return;
    const skin = items.find((s) => s.id === skinId);
    const priceCents = skin?.price_cents ?? 0;
    if (priceCents > 0) {
      const ok = window.confirm(
        t({
          zh: `该皮肤售价 $${(priceCents / 100).toFixed(2)}，确认购买？`,
          en: `This skin costs $${(priceCents / 100).toFixed(2)}. Confirm purchase?`,
        }),
      );
      if (!ok) return;
    }
    setInstallingId(skinId);
    setError(null);
    try {
      await v1Api.pet.installFromMarketplace(skinId, priceCents > 0 ? priceCents : undefined);
      setInstalledIds((prev) => {
        const next = new Set(prev);
        next.add(skinId);
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '安装失败');
    } finally {
      setInstallingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <ConsoleLayout title={t({ zh: '皮肤市场', en: 'Skin Marketplace' })}>
      <div data-testid="skin-marketplace-page">
        <p style={{ color: T.text.secondary, marginBottom: 16 }}>
          {t({
            zh: '浏览社区与官方皮肤，一键安装到你的衣柜。',
            en: 'Browse community and official skins. Install with one click into your wardrobe.',
          })}
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {(['all', 'platform', 'generated', 'remixed'] as const).map((src) => (
            <button
              key={src}
              data-testid={`market-filter-${src}`}
              onClick={() => {
                setSource(src);
                setOffset(0);
              }}
              style={{
                ...btnPrimaryStyle,
                background: source === src ? 'rgba(34,211,255,0.18)' : 'transparent',
                border: `1px solid ${source === src ? 'rgba(34,211,255,0.45)' : T.border.subtle}`,
                color: source === src ? T.text.accent : T.text.secondary,
              }}
            >
              {src === 'all'
                ? t({ zh: '全部', en: 'All' })
                : src === 'platform'
                  ? t({ zh: '官方', en: 'Official' })
                  : src === 'generated'
                    ? t({ zh: '社区生成', en: 'Community' })
                    : t({ zh: '混合二创', en: 'Remix' })}
            </button>
          ))}
        </div>

        {error && (
          <div
            data-testid="skin-market-error"
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 10,
              border: '1px solid rgba(239,68,68,0.35)',
              background: 'rgba(127,29,29,0.28)',
              color: '#fecaca',
              fontSize: T.font.sizeSmall,
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: T.text.muted }}>{t({ zh: '加载中…', en: 'Loading…' })}</div>
        ) : items.length === 0 ? (
          <div style={{ ...cardStyle, color: T.text.muted, textAlign: 'center', padding: 40 }}>
            {t({ zh: '暂无可安装的皮肤', en: 'No skins available' })}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {items.map((skin) => {
              const installed = installedIds.has(skin.id);
              const busy = installingId === skin.id;
              return (
                <article
                  key={skin.id}
                  data-testid={`market-skin-${skin.id}`}
                  style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.04)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {skin.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={skin.thumbnail_url}
                        alt={skin.display_name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ fontSize: 48 }}>{skin.format === 'vrm' ? '🧸' : '🐾'}</div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: T.font.sizeBody, color: T.text.primary, fontWeight: T.font.weightSemibold }}>
                      {skin.display_name}
                    </div>
                    <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, marginTop: 4 }}>
                      {skin.format.toUpperCase()} · {skin.source}
                    </div>
                    <div
                      data-testid={`market-price-${skin.id}`}
                      style={{ fontSize: T.font.sizeTiny, color: (skin.price_cents ?? 0) > 0 ? T.text.accent : '#86efac', marginTop: 2, fontWeight: T.font.weightSemibold }}
                    >
                      {(skin.price_cents ?? 0) > 0
                        ? `$${((skin.price_cents ?? 0) / 100).toFixed(2)}`
                        : t({ zh: '免费', en: 'Free' })}
                    </div>
                  </div>
                  <button
                    data-testid={`market-install-${skin.id}`}
                    disabled={installed || busy}
                    onClick={() => void onInstall(skin.id)}
                    style={{
                      ...btnPrimaryStyle,
                      opacity: installed ? 0.55 : 1,
                      cursor: installed ? 'default' : 'pointer',
                    }}
                  >
                    {installed
                      ? t({ zh: '✓ 已安装', en: '✓ Installed' })
                      : busy
                        ? t({ zh: '安装中…', en: 'Installing…' })
                        : t({ zh: '安装到衣柜', en: 'Install' })}
                  </button>
                </article>
              );
            })}
          </div>
        )}

        {total > PAGE_SIZE && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20, alignItems: 'center' }}>
            <button
              data-testid="market-prev"
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              style={{ ...btnPrimaryStyle, opacity: offset === 0 ? 0.4 : 1 }}
            >
              ← {t({ zh: '上一页', en: 'Prev' })}
            </button>
            <span style={{ color: T.text.muted, fontSize: T.font.sizeSmall }}>
              {currentPage} / {totalPages}
            </span>
            <button
              data-testid="market-next"
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
              style={{ ...btnPrimaryStyle, opacity: offset + PAGE_SIZE >= total ? 0.4 : 1 }}
            >
              {t({ zh: '下一页', en: 'Next' })} →
            </button>
          </div>
        )}
      </div>
    </ConsoleLayout>
  );
}
