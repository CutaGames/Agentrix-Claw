import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type PetSkinDto } from '../../../lib/api/v1.api';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { T, cardStyle, btnPrimaryStyle } from '../../../lib/console.theme';
import Link from 'next/link';

/**
 * V4 §3.2 — Web 衣柜 (Wardrobe) 控制台页
 *
 * 与桌面端 WardrobePanel 共享后端契约：
 *   GET  /v1/pet/skins              我拥有的皮肤
 *   GET  /v1/pet/skins/active       当前激活皮肤
 *   POST /v1/pet/skin/activate      切换皮肤
 *
 * 对应 PRD: docs/web-prd-v4.md §3.2
 */
export default function ConsolePetWardrobePage(): React.ReactElement {
  const { t } = useLocalization();
  const [skins, setSkins] = React.useState<PetSkinDto[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [switchingId, setSwitchingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [list, active] = await Promise.all([v1Api.pet.listSkins(), v1Api.pet.getActiveSkin()]);
      setSkins(list?.items ?? []);
      setActiveId(active?.active_skin_id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载衣柜失败');
      setSkins([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onActivate = async (skinId: string): Promise<void> => {
    if (switchingId || activeId === skinId) return;
    setSwitchingId(skinId);
    setError(null);
    try {
      await v1Api.pet.activateSkin(skinId);
      setActiveId(skinId);
    } catch (e) {
      setError(e instanceof Error ? e.message : '切换失败');
    } finally {
      setSwitchingId(null);
    }
  };

  return (
    <ConsoleLayout title={t({ zh: '主宠衣柜', en: 'Pet Wardrobe' })}>
      <div data-testid="pet-wardrobe-console-page">
        <p style={{ color: T.text.secondary, marginBottom: 16 }}>
          {t({
            zh: '管理你的主宠皮肤资产。灵魂决定行为，皮肤决定外观 —— 同一只灵魂可以穿不同皮肤。',
            en: 'Manage your pet skin assets. Soul defines behaviour; skin defines appearance — one soul can wear many skins.',
          })}
        </p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <Link
            href="/console/marketplace/skins"
            data-testid="wardrobe-link-marketplace"
            style={{ ...btnPrimaryStyle, textDecoration: 'none', display: 'inline-block' }}
          >
            🛒 {t({ zh: '皮肤市场', en: 'Skin Marketplace' })}
          </Link>
          <Link
            href="/console/pet/breed"
            data-testid="wardrobe-link-breed"
            style={{ ...btnPrimaryStyle, textDecoration: 'none', display: 'inline-block' }}
          >
            🧬 {t({ zh: '双图繁殖', en: 'Breed' })}
          </Link>
          <Link
            href="/console/pet/souls"
            data-testid="wardrobe-link-souls"
            style={{ ...btnPrimaryStyle, textDecoration: 'none', display: 'inline-block' }}
          >
            👻 {t({ zh: '切换灵魂', en: 'Switch Soul' })}
          </Link>
        </div>

        {error && (
          <div
            data-testid="pet-wardrobe-error"
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
        ) : skins.length === 0 ? (
          <div style={{ ...cardStyle, color: T.text.muted, textAlign: 'center', padding: 40 }}>
            {t({
              zh: '还没有任何皮肤。去市场逛逛，或用宠物创造器生成一只。',
              en: 'No skins yet. Browse the marketplace or use the Pet Creator to generate one.',
            })}
          </div>
        ) : (
          <div
            data-testid="pet-wardrobe-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}
          >
            {skins.map((skin) => {
              const isActive = activeId === skin.id;
              const isBusy = switchingId === skin.id;
              return (
                <article
                  key={skin.id}
                  data-testid={`wardrobe-skin-${skin.id}`}
                  style={{
                    ...cardStyle,
                    borderColor: isActive ? 'rgba(34,211,255,0.45)' : T.border.subtle,
                    background: isActive ? 'rgba(34,211,255,0.08)' : T.bg.panel,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
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
                      <div style={{ fontSize: 56 }}>{skin.format === 'vrm' ? '🧸' : '🐾'}</div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: T.font.sizeH2, color: T.text.primary, fontWeight: T.font.weightSemibold }}>
                      {skin.display_name}
                    </div>
                    <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, marginTop: 4 }}>
                      {skin.format.toUpperCase()} · {skin.source}
                    </div>
                  </div>
                  <button
                    data-testid={`wardrobe-activate-${skin.id}`}
                    disabled={isActive || isBusy}
                    onClick={() => void onActivate(skin.id)}
                    style={{
                      ...btnPrimaryStyle,
                      opacity: isActive ? 0.55 : 1,
                      cursor: isActive ? 'default' : 'pointer',
                    }}
                  >
                    {isActive
                      ? t({ zh: '✓ 当前皮肤', en: '✓ Active Skin' })
                      : isBusy
                        ? t({ zh: '切换中…', en: 'Switching…' })
                        : t({ zh: '装备这只', en: 'Equip This Skin' })}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </ConsoleLayout>
  );
}
