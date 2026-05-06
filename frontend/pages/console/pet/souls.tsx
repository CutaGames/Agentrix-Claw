import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import PetSoulBadge from '../../../components/pet/PetSoulBadge';
import { v1Api, type PetPlanLevel, type PetSoulSummary, type PetState } from '../../../lib/api/v1.api';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { T, cardStyle, btnPrimaryStyle } from '../../../lib/console.theme';

const DEFAULT_CLAN = 'A_office';

function planLabel(plan: PetPlanLevel | null): string {
  switch (plan) {
    case 'free':
      return 'Free';
    case 'pro':
      return 'Pro';
    case 'pro_plus':
      return 'Pro+';
    case 'enterprise':
      return 'Enterprise';
    default:
      return 'Unknown';
  }
}

export default function ConsolePetSoulPage(): React.ReactElement {
  const { t } = useLocalization();
  const [pet, setPet] = React.useState<PetState | null>(null);
  const [souls, setSouls] = React.useState<PetSoulSummary[]>([]);
  const [plan, setPlan] = React.useState<PetPlanLevel | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [switchingId, setSwitchingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [petState, soulList] = await Promise.all([
        v1Api.pet.getState(),
        v1Api.pet.listSouls({ clan: DEFAULT_CLAN }),
      ]);
      setPet(petState ?? null);
      setSouls(soulList?.items ?? []);
      setPlan(soulList?.access?.plan_level ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载灵魂失败');
      setSouls([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onSwitch = async (templateId: string): Promise<void> => {
    if (switchingId || pet?.soul_template_id === templateId) return;
    setSwitchingId(templateId);
    setError(null);
    try {
      const next = await v1Api.pet.switchSoul(templateId);
      setPet(next ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '切换失败');
    } finally {
      setSwitchingId(null);
    }
  };

  const activeSoul = souls.find((item) => item.id === pet?.soul_template_id) ?? null;

  return (
    <ConsoleLayout title={t({ zh: '主宠灵魂', en: 'Pet Souls' })}>
      <div data-testid="pet-soul-console-page">
        <p style={{ color: T.text.secondary, marginBottom: 16 }}>
          {t({
            zh: '在 Web 端查看并切换当前主宠灵魂。套餐限制由后端统一裁决，Web / Desktop / Mobile 共用同一契约。',
            en: 'View and switch the active Living Pet soul on web. Plan limits are enforced by the shared backend contract across web, desktop and mobile.',
          })}
        </p>

        <div
          style={{
            ...cardStyle,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            marginBottom: 20,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {t({ zh: '当前灵魂', en: 'Current Soul' })}
            </div>
            <div data-testid="pet-soul-current-id" style={{ fontSize: T.font.sizeH2, color: T.text.primary, marginTop: 6 }}>
              {activeSoul?.display_name ?? pet?.soul_template_id ?? 'claw'}
            </div>
            <div style={{ fontSize: T.font.sizeSmall, color: T.text.secondary, marginTop: 4 }}>
              {t({ zh: '已解锁', en: 'Unlocked' })}: {(pet?.unlocked_soul_template_ids ?? ['claw']).join(', ')}
            </div>
          </div>
          <div
            data-testid="pet-soul-plan-badge"
            style={{
              borderRadius: 999,
              padding: '8px 14px',
              border: `1px solid ${T.border.subtle}`,
              background: 'rgba(34,211,255,0.08)',
              color: T.text.accent,
              fontSize: T.font.sizeSmall,
              fontWeight: 700,
            }}
          >
            {t({ zh: '当前套餐', en: 'Current Plan' })}: {planLabel(plan)}
          </div>
        </div>

        {error && (
          <div
            data-testid="pet-soul-error"
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
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {souls.map((soul) => {
              const isActive = pet?.soul_template_id === soul.id;
              const isBusy = switchingId === soul.id;
              return (
                <article
                  key={soul.id}
                  data-testid={`pet-soul-card-${soul.id}`}
                  style={{
                    ...cardStyle,
                    borderColor: isActive ? 'rgba(34,211,255,0.45)' : T.border.subtle,
                    background: isActive ? 'rgba(34,211,255,0.08)' : T.bg.panel,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: 34 }}>{soul.id === 'claw' ? '🦾' : '🐾'}</div>
                  <div>
                    <div style={{ fontSize: T.font.sizeH2, color: T.text.primary, fontWeight: T.font.weightSemibold }}>
                      {soul.display_name}
                    </div>
                    <PetSoulBadge clan={soul.clan} displayName={soul.display_name} tier={soul.tier} />
                  </div>
                  <div style={{ fontSize: T.font.sizeSmall, color: T.text.secondary }}>{soul.tagline}</div>
                  <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted }}>
                    {t({ zh: '人格原型', en: 'Archetype' })}: {soul.archetype}
                  </div>
                  <button
                    data-testid={`pet-soul-switch-${soul.id}`}
                    disabled={isActive || isBusy}
                    onClick={() => void onSwitch(soul.id)}
                    style={{
                      ...btnPrimaryStyle,
                      opacity: isActive ? 0.55 : 1,
                      cursor: isActive ? 'default' : 'pointer',
                    }}
                  >
                    {isActive
                      ? t({ zh: '✓ 当前灵魂', en: '✓ Active Soul' })
                      : isBusy
                        ? t({ zh: '切换中…', en: 'Switching…' })
                        : t({ zh: '切换到这只', en: 'Switch to This Soul' })}
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