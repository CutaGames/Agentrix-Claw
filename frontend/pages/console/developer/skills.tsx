import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { apiClient } from '../../../lib/api/client';
import { useUser } from '../../../contexts/UserContext';
import { useLocalization, type TranslationDescriptor } from '../../../contexts/LocalizationContext';
import { L } from '../../../lib/console.i18n';
import { T, cardStyle, inputStyle, selectStyle, btnPrimaryStyle, btnSecondaryStyle, btnDangerStyle, emptyStateStyle, pillStyle } from '../../../lib/console.theme';

type SkillStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'unlisted';
type SkillCategory = 'productivity' | 'finance' | 'social' | 'devops' | 'wellness' | 'other';

interface SkillListing {
  id: string;
  developerUserId: string;
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  revenue_split_bps: number;
  category: SkillCategory;
  status: SkillStatus;
  install_count: number;
  invoke_count: number;
  total_revenue_cents: number;
  developer_revenue_cents: number;
  platform_revenue_cents: number;
  createdAt: number;
  updatedAt: number;
  reviewer_note?: string;
}

interface DraftForm {
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  revenue_split_bps: number;
  category: SkillCategory;
}

const EMPTY_DRAFT: DraftForm = {
  name: '', slug: '', description: '', price_cents: 100, revenue_split_bps: 2000, category: 'productivity',
};

const CATEGORIES: SkillCategory[] = ['productivity', 'finance', 'social', 'devops', 'wellness', 'other'];

const STATUS_TONE: Record<SkillStatus, 'subtle' | 'success' | 'warning' | 'danger' | 'accent'> = {
  draft: 'subtle', pending_review: 'warning', approved: 'success', rejected: 'danger', unlisted: 'subtle',
};

const STATUS_LABEL: Record<SkillStatus, TranslationDescriptor> = {
  draft: { zh: '草稿', en: 'Draft' },
  pending_review: { zh: '审核中', en: 'Pending Review' },
  approved: { zh: '已通过', en: 'Approved' },
  rejected: { zh: '被拒绝', en: 'Rejected' },
  unlisted: { zh: '已下架', en: 'Unlisted' },
};

export default function ConsoleDeveloperSkills(): React.ReactElement {
  const { t } = useLocalization();
  const { user } = useUser();
  const [items, setItems] = React.useState<SkillListing[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [draft, setDraft] = React.useState<DraftForm>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const reload = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const r = await apiClient.get<SkillListing[]>('/v1/skill-listings', {
        params: user?.id ? { developer_user_id: user.id } : undefined,
      });
      setItems(Array.isArray(r) ? r : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  React.useEffect(() => { void reload(); }, [reload]);

  const onCreate = async (): Promise<void> => {
    if (!draft.name.trim() || !draft.slug.trim()) {
      setErr(t({ zh: '请填写名称和 slug', en: 'Name and slug are required' }));
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await apiClient.post<SkillListing>('/v1/skill-listings', {
        name: draft.name.trim(),
        slug: draft.slug.trim(),
        description: draft.description.trim() || undefined,
        price_cents: Math.round(draft.price_cents),
        revenue_split_bps: Math.round(draft.revenue_split_bps),
        category: draft.category,
      });
      setDraft(EMPTY_DRAFT);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitForReview = async (id: string): Promise<void> => {
    setBusy(id);
    try {
      await apiClient.post(`/v1/skill-listings/${id}/submit`, {});
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ConsoleLayout title={t({ zh: '我的 Skill 发布', en: 'My Skill Listings' })}>
      <p style={{ color: T.text.secondary, fontSize: T.font.sizeBody, marginBottom: 20 }}>
        {t({
          zh: '管理你发布到 Skill 市场的能力。每次调用按你设置的价格收费，平台默认抽成 20%（可调整）。',
          en: 'Manage skill capabilities you publish to the marketplace. Each invocation charges your set price; platform takes 20% by default (adjustable).',
        })}
      </p>

      {/* ---------- Create new draft form ---------- */}
      <section style={{ ...cardStyle, marginBottom: 24 }}>
        <h2 style={H2}>{t({ zh: '+ 创建新 Skill 草稿', en: '+ Create New Skill Draft' })}</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
          <Field label={t({ zh: '名称', en: 'Name' })}>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={t({ zh: '如：智能日程助理', en: 'e.g. Smart Calendar Assistant' })}
              style={{ ...inputStyle, width: '100%' }} />
          </Field>

          <Field label={t({ zh: 'Slug（URL 标识符，不可重复）', en: 'Slug (URL ID, must be unique)' })}>
            <input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value.replace(/[^a-z0-9_-]/g, '') })}
              placeholder="smart-calendar"
              style={{ ...inputStyle, width: '100%', fontFamily: 'monospace' }} />
          </Field>

          <Field label={t({ zh: '分类', en: 'Category' })}>
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as SkillCategory })}
              style={{ ...selectStyle, width: '100%' }}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <Field label={t({ zh: '单次调用价格（美分）', en: 'Price per invocation (cents)' })}>
            <input type="number" min={0} value={draft.price_cents}
              onChange={(e) => setDraft({ ...draft, price_cents: Number(e.target.value) || 0 })}
              style={{ ...inputStyle, width: '100%' }} />
          </Field>

          <Field label={t({ zh: '平台抽成 (bps，2000 = 20%)', en: 'Platform cut (bps, 2000 = 20%)' })}>
            <input type="number" min={0} max={10000} value={draft.revenue_split_bps}
              onChange={(e) => setDraft({ ...draft, revenue_split_bps: Number(e.target.value) || 0 })}
              style={{ ...inputStyle, width: '100%' }} />
          </Field>
        </div>

        <Field label={t({ zh: '描述', en: 'Description' })}>
          <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder={t({ zh: '介绍这个 Skill 解决什么问题、如何调用、有什么独特价值…', en: 'Describe what this skill does, how to call it, and what makes it unique…' })}
            rows={4}
            style={{ ...inputStyle, width: '100%', minHeight: 90, fontFamily: T.font.family, resize: 'vertical' }} />
        </Field>

        {err && <div style={{ marginTop: 12, padding: 10, background: '#3a1414', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: T.font.sizeCaption, color: T.text.danger }}>{err}</div>}

        <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={onCreate} disabled={submitting} style={btnPrimaryStyle}>
            {submitting ? t(L.common.creating) : t({ zh: '保存草稿', en: 'Save Draft' })}
          </button>
          <button onClick={() => setDraft(EMPTY_DRAFT)} disabled={submitting} style={btnSecondaryStyle}>
            {t({ zh: '清空表单', en: 'Reset' })}
          </button>
          <span style={{ fontSize: T.font.sizeTiny, color: T.text.muted, marginLeft: 'auto' }}>
            {t({ zh: '草稿创建后可在下方提交审核', en: 'Submit for review after creating draft' })}
          </span>
        </div>
      </section>

      {/* ---------- Listings table ---------- */}
      <section>
        <h2 style={H2}>
          {t({ zh: '已创建的 Skill', en: 'My Skills' })} ({items.length})
        </h2>

        {loading ? (
          <div style={emptyStateStyle}>{t(L.common.loading)}</div>
        ) : items.length === 0 ? (
          <div style={emptyStateStyle}>
            {t({ zh: '你还没有创建任何 Skill。在上方创建第一个草稿。', en: "You haven't created any skills yet. Create your first draft above." })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((s) => (
              <article key={s.id} style={{ ...cardStyle, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: T.font.sizeH2, fontWeight: 700, margin: 0, color: T.text.primary }}>{s.name}</h3>
                      <span style={pillStyle(STATUS_TONE[s.status])}>{t(STATUS_LABEL[s.status])}</span>
                      <span style={pillStyle('subtle')}>{s.category}</span>
                    </div>
                    <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, marginTop: 4, fontFamily: 'monospace' }}>
                      slug: {s.slug} · id: {s.id}
                    </div>
                    {s.description && (
                      <p style={{ fontSize: T.font.sizeSmall, color: T.text.secondary, lineHeight: 1.55, margin: '8px 0 0' }}>
                        {s.description}
                      </p>
                    )}
                    {s.reviewer_note && (
                      <div style={{ marginTop: 8, padding: 8, background: T.bg.input, borderLeft: `3px solid ${T.text.warning}`, fontSize: T.font.sizeCaption, color: T.text.secondary }}>
                        <strong style={{ color: T.text.warning }}>{t({ zh: '审核备注', en: 'Reviewer note' })}:</strong> {s.reviewer_note}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', minWidth: 160 }}>
                    {(s.status === 'draft' || s.status === 'rejected') && (
                      <button onClick={() => onSubmitForReview(s.id)} disabled={busy === s.id} style={btnPrimaryStyle}>
                        {busy === s.id ? t(L.common.submit) + '…' : t({ zh: '提交审核 →', en: 'Submit for Review →' })}
                      </button>
                    )}
                    {s.status === 'pending_review' && (
                      <span style={{ fontSize: T.font.sizeCaption, color: T.text.warning }}>
                        {t({ zh: '⏳ 等待管理员审核', en: '⏳ Awaiting admin review' })}
                      </span>
                    )}
                    {s.status === 'approved' && (
                      <span style={{ fontSize: T.font.sizeCaption, color: T.text.success }}>
                        {t({ zh: '✓ 已上架到市场', en: '✓ Live on marketplace' })}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, paddingTop: 14, borderTop: `1px solid ${T.border.subtle}` }}>
                  <Mini label={t({ zh: '价格', en: 'Price' })} value={`$${(s.price_cents / 100).toFixed(2)}`} />
                  <Mini label={t({ zh: '安装次数', en: 'Installs' })} value={String(s.install_count)} />
                  <Mini label={t({ zh: '调用次数', en: 'Invokes' })} value={String(s.invoke_count)} />
                  <Mini label={t({ zh: '我的收益', en: 'My Earnings' })} value={`$${(s.developer_revenue_cents / 100).toFixed(2)}`} accent />
                  <Mini label={t({ zh: '平台抽成', en: 'Platform cut' })} value={`${(s.revenue_split_bps / 100).toFixed(0)}%`} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </ConsoleLayout>
  );
}

const H2: React.CSSProperties = { fontSize: T.font.sizeH2, fontWeight: T.font.weightSemibold, color: T.text.primary, marginBottom: 16 };

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {children}
    </label>
  );
}
function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }): React.ReactElement {
  return (
    <div>
      <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: T.font.sizeH2, fontWeight: 700, marginTop: 2, color: accent ? T.text.accent : T.text.primary }}>{value}</div>
    </div>
  );
}

// btnDangerStyle imported but currently unused — keep import to avoid future re-add churn
void btnDangerStyle;
