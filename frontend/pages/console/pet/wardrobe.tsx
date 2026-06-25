import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type PetSkinDto, type PetSkinVisibility } from '../../../lib/api/v1.api';
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
                  <SkinPublishControls
                    skin={skin}
                    onChange={(updated) =>
                      setSkins((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
                    }
                    onError={setError}
                  />
                </article>
              );
            })}
          </div>
        )}
      </div>
    </ConsoleLayout>
  );
}

/**
 * V4 §3.2 — Per-skin publish + price controls.
 * Hidden for platform-owned skins (owner_user_id === null) and skins the
 * current user doesn't own. The controller enforces ownership server-side
 * so this is a UX gate only.
 */
function SkinPublishControls(props: {
  skin: PetSkinDto;
  onChange: (s: PetSkinDto) => void;
  onError: (msg: string | null) => void;
}): React.ReactElement | null {
  const { skin, onChange, onError } = props;
  const { t } = useLocalization();
  const [busy, setBusy] = React.useState<'visibility' | 'price' | null>(null);
  const [draftPrice, setDraftPrice] = React.useState<string>(
    skin.price_cents != null ? String(skin.price_cents) : '0',
  );

  if (skin.owner_user_id === null) return null; // platform skin

  const visibility: PetSkinVisibility = skin.visibility ?? 'private';
  const moderation = skin.moderation_status ?? 'pending';

  const onVisibility = async (next: PetSkinVisibility): Promise<void> => {
    if (busy || next === visibility) return;
    setBusy('visibility');
    onError(null);
    try {
      const res = await v1Api.pet.setSkinVisibility(skin.id, next);
      if (res?.skin) onChange(res.skin);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to update visibility');
    } finally {
      setBusy(null);
    }
  };

  const onSavePrice = async (): Promise<void> => {
    if (busy) return;
    const cents = Math.max(0, Math.floor(Number(draftPrice) || 0));
    setBusy('price');
    onError(null);
    try {
      const res = await v1Api.pet.setSkinPrice(skin.id, cents);
      if (res?.skin) onChange(res.skin);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to update price');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      data-testid={`wardrobe-publish-${skin.id}`}
      style={{
        marginTop: 4,
        paddingTop: 8,
        borderTop: `1px dashed ${T.border.subtle}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: T.font.sizeTiny }}>
        <span style={{ color: T.text.muted }}>
          {t({ zh: '可见性', en: 'Visibility' })}:
        </span>
        {(['private', 'unlisted', 'public'] as const).map((v) => (
          <button
            key={v}
            data-testid={`wardrobe-visibility-${skin.id}-${v}`}
            onClick={() => void onVisibility(v)}
            disabled={busy !== null}
            style={{
              padding: '2px 8px',
              borderRadius: 6,
              border: visibility === v ? '1px solid rgba(34,211,255,0.6)' : `1px solid ${T.border.subtle}`,
              background: visibility === v ? 'rgba(34,211,255,0.12)' : 'transparent',
              color: T.text.primary,
              fontSize: T.font.sizeTiny,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {v}
          </button>
        ))}
      </div>
      {visibility === 'public' && (
        <div
          data-testid={`wardrobe-moderation-${skin.id}`}
          style={{ fontSize: T.font.sizeTiny, color: moderation === 'approved' ? '#86efac' : moderation === 'rejected' ? '#fca5a5' : T.text.muted }}
        >
          {t({ zh: '审核状态', en: 'Moderation' })}: {moderation}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: T.font.sizeTiny, color: T.text.muted }}>
          {t({ zh: '售价 (¢)', en: 'Price (¢)' })}:
        </span>
        <input
          data-testid={`wardrobe-price-input-${skin.id}`}
          type="number"
          min={0}
          value={draftPrice}
          onChange={(e) => setDraftPrice(e.target.value)}
          disabled={busy !== null}
          style={{
            width: 80,
            padding: '2px 6px',
            borderRadius: 6,
            border: `1px solid ${T.border.subtle}`,
            background: 'rgba(255,255,255,0.04)',
            color: T.text.primary,
            fontSize: T.font.sizeTiny,
          }}
        />
        <button
          data-testid={`wardrobe-price-save-${skin.id}`}
          onClick={() => void onSavePrice()}
          disabled={busy !== null}
          style={{
            padding: '2px 8px',
            borderRadius: 6,
            border: `1px solid ${T.border.subtle}`,
            background: 'rgba(34,211,255,0.12)',
            color: T.text.primary,
            fontSize: T.font.sizeTiny,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy === 'price' ? t({ zh: '保存中…', en: 'Saving…' }) : t({ zh: '保存', en: 'Save' })}
        </button>
      </div>
    </div>
  );
}
