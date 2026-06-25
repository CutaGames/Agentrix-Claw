import React from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type PetSkinDto } from '../../../lib/api/v1.api';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { T, cardStyle, btnPrimaryStyle } from '../../../lib/console.theme';

/**
 * V4 §3.2 — Web 双图繁殖 (Breed) 页
 *
 * Calls POST /v1/pet/breed to synthesise two parent skins into a new pet.
 * Mirrors desktop PetCreatorPanel "breed" tab.
 *
 * 对应 PRD: docs/web-prd-v4.md §3.4
 */
export default function ConsolePetBreedPage(): React.ReactElement {
  const { t } = useLocalization();
  const [skins, setSkins] = React.useState<PetSkinDto[]>([]);
  const [parentA, setParentA] = React.useState<string>('');
  const [parentB, setParentB] = React.useState<string>('');
  const [prompt, setPrompt] = React.useState<string>('');
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<{ taskId?: string; message?: string; error?: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void (async () => {
      try {
        const list = await v1Api.pet.listSkins();
        setSkins(list?.items ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载皮肤失败');
      }
    })();
  }, []);

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!parentA || !parentB) {
      setError(t({ zh: '请选择两只父系皮肤', en: 'Please pick two parent skins' }));
      return;
    }
    if (parentA === parentB) {
      setError(t({ zh: '两只父系不能相同', en: 'Parents must differ' }));
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await v1Api.pet.breed({
        parentSkinIdA: parentA,
        parentSkinIdB: parentB,
        prompt: prompt.trim() || undefined,
      });
      setResult({
        taskId: typeof res?.taskId === 'string' ? res.taskId : undefined,
        message: typeof res?.message === 'string' ? res.message : undefined,
        error: typeof res?.error === 'string' ? res.error : undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ConsoleLayout title={t({ zh: '双图繁殖', en: 'Breed Pet' })}>
      <div data-testid="pet-breed-console-page" style={{ maxWidth: 720 }}>
        <p style={{ color: T.text.secondary, marginBottom: 16 }}>
          {t({
            zh: '选择两只父系皮肤，融合它们的视觉特征生成一只新宠物。结果将作为新皮肤进入你的衣柜。',
            en: 'Pick two parent skins to fuse their visual traits into a new pet. The result lands in your wardrobe as a new skin.',
          })}
        </p>

        {error && (
          <div
            data-testid="pet-breed-error"
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

        <form onSubmit={(e) => void onSubmit(e)} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ fontSize: T.font.sizeSmall, color: T.text.secondary }}>
            {t({ zh: '父系 A', en: 'Parent A' })}
            <select
              data-testid="breed-parent-a"
              value={parentA}
              onChange={(e) => setParentA(e.target.value)}
              required
              style={selectStyle}
            >
              <option value="">{t({ zh: '— 选择 —', en: '— Choose —' })}</option>
              {skins.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name} ({s.format})
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: T.font.sizeSmall, color: T.text.secondary }}>
            {t({ zh: '父系 B', en: 'Parent B' })}
            <select
              data-testid="breed-parent-b"
              value={parentB}
              onChange={(e) => setParentB(e.target.value)}
              required
              style={selectStyle}
            >
              <option value="">{t({ zh: '— 选择 —', en: '— Choose —' })}</option>
              {skins.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name} ({s.format})
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: T.font.sizeSmall, color: T.text.secondary }}>
            {t({ zh: '附加提示词（可选）', en: 'Extra prompt (optional)' })}
            <textarea
              data-testid="breed-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder={t({ zh: '例如：偏向 A 的颜色 + B 的轮廓', en: 'e.g. lean A\u2019s palette + B\u2019s silhouette' })}
              style={{ ...selectStyle, resize: 'vertical' }}
            />
          </label>

          <button
            type="submit"
            data-testid="breed-submit"
            disabled={submitting}
            style={{ ...btnPrimaryStyle, opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? t({ zh: '提交中…', en: 'Submitting…' }) : t({ zh: '🧬 开始繁殖', en: '🧬 Start Breeding' })}
          </button>
        </form>

        {result && (
          <div
            data-testid="pet-breed-result"
            style={{
              ...cardStyle,
              marginTop: 16,
              borderColor: result.error ? 'rgba(239,68,68,0.35)' : 'rgba(34,211,255,0.35)',
            }}
          >
            {result.error ? (
              <div style={{ color: '#fecaca' }}>{result.error}</div>
            ) : (
              <>
                <div style={{ color: T.text.primary, fontWeight: 600, marginBottom: 6 }}>
                  {t({ zh: '✓ 任务已提交', en: '✓ Task submitted' })}
                </div>
                {result.taskId && (
                  <div style={{ fontSize: T.font.sizeSmall, color: T.text.muted }}>Task ID: {result.taskId}</div>
                )}
                {result.message && (
                  <div style={{ fontSize: T.font.sizeSmall, color: T.text.secondary, marginTop: 6 }}>{result.message}</div>
                )}
                <Link
                  href="/console/pet/wardrobe"
                  style={{ ...btnPrimaryStyle, display: 'inline-block', textDecoration: 'none', marginTop: 12 }}
                >
                  {t({ zh: '回到衣柜', en: 'Back to Wardrobe' })}
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </ConsoleLayout>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 6,
  padding: '8px 10px',
  borderRadius: 8,
  border: `1px solid ${T.border.subtle}`,
  background: T.bg.panel,
  color: T.text.primary,
  fontSize: T.font.sizeSmall,
};
