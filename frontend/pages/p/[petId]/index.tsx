/**
 * Public pet name card — `/p/[petId]`
 *
 * Phase 1 W3 deliverable (per docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md WB-1.x):
 *   - SSR fetch via backend public endpoint `GET /v1/pet/public/:petId`
 *   - 显示：当前灵魂 / 族群 / 亲密度 / 等级 / Marketing hook
 *   - OG / Twitter Card meta（关键 KPI）
 *   - 未登录可访问（Phase 1 不做钱包视图，Phase 4 再加）
 *
 * 安全：后端只返回安全字段，不含 wallet / memory。
 */
import Head from 'next/head';
import type { GetServerSideProps, NextPage } from 'next';
import PetSoulBadge from '../../../components/pet/PetSoulBadge';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const SITE_BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://agentrix.top';

interface PetPublic {
  pet_id: string;
  name: string;
  soul_template_id: string | null;
  intimacy_level: number;
  intimacy_xp: number;
  primary_agent_id: string | null;
  updated_at: number;
}

interface PetSoulDto {
  id: string;
  clan: string;
  display_name: string;
  display_name_en?: string;
  tagline?: string;
  archetype?: string;
  marketing_hook?: string;
  default_idle_emotion?: string;
  tier?: string;
}

interface PageProps {
  pet: PetPublic;
  soul: PetSoulDto | null;
  activeSkin: { id: string; display_name: string } | null;
  lineage: LineageItem[];
  notFound?: boolean;
}

interface LineageItem {
  id: string;
  display_name: string;
  source: string;
  original_creator_user_id: string | null;
  royalty_rate_bps: number;
  parent_skin_id: string | null;
  thumbnail_url: string | null;
}

const CLAN_LABELS: Record<string, string> = {
  A_office: '效率派',
  B_life: '生活家',
  C_learn: '学习圈',
  D_play: '娱乐部',
  E_web3: 'Web3 帮',
  F_family: '家有萌宠',
};

const PetPublicPage: NextPage<PageProps> = ({ pet, soul, activeSkin, lineage }) => {
  const title = soul
    ? `${pet.name} · ${soul.display_name}（${CLAN_LABELS[soul.clan] ?? soul.clan}）— Agentrix ClawBuddy`
    : `${pet.name} — Agentrix ClawBuddy`;
  const description = soul
    ? soul.marketing_hook || soul.tagline || `Lv.${pet.intimacy_level} ${pet.name}`
    : `Lv.${pet.intimacy_level} ${pet.name}`;
  const url = `${SITE_BASE}/p/${pet.pet_id}`;
  const ogImage = `${SITE_BASE}/og/pet-default.png`;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="profile" />
        <meta property="og:url" content={url} />
        <meta property="og:image" content={ogImage} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImage} />
      </Head>

      <main className="min-h-screen bg-gradient-to-b from-[#0b0b13] to-[#1a1a2e] text-white">
        <div className="mx-auto max-w-2xl px-4 py-12">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur">
            <div className="mb-4 flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/30 to-cyan-500/30 text-4xl">
                🐾
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-semibold">{pet.name}</h1>
                {soul && (
                  <PetSoulBadge clan={soul.clan} displayName={soul.display_name} tier={soul.tier} />
                )}
              </div>
            </div>

            {soul?.tagline && (
              <p className="mb-4 text-sm leading-relaxed text-white/80">{soul.tagline}</p>
            )}

            <div className="grid grid-cols-3 gap-4">
              <Stat label="亲密度" value={`Lv.${pet.intimacy_level}`} />
              <Stat label="经验" value={String(pet.intimacy_xp)} />
              <Stat label="原型" value={soul?.archetype || '—'} />
            </div>

            {soul?.marketing_hook && (
              <p className="mt-6 rounded-md bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                ✨ {soul.marketing_hook}
              </p>
            )}

            {activeSkin && lineage.length > 0 && (
              <div className="mt-6 rounded-md border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wide text-white/50">皮肤血统 · Breed Lineage</div>
                  <div className="text-[10px] text-white/40">{lineage.length} gen</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {lineage.map((s, idx) => (
                    <div key={s.id} className="flex items-center gap-2">
                      {idx > 0 && <span className="text-white/30">→</span>}
                      <div
                        className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs ${
                          s.id === activeSkin.id
                            ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40'
                            : 'bg-white/5 text-white/70'
                        }`}
                        title={`${s.source}${s.royalty_rate_bps ? ` · ${(s.royalty_rate_bps / 100).toFixed(1)}% royalty` : ''}`}
                      >
                        {s.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.thumbnail_url}
                            alt={s.display_name}
                            className="h-5 w-5 rounded"
                          />
                        ) : (
                          <span>🎨</span>
                        )}
                        <span className="max-w-[120px] truncate">{s.display_name}</span>
                        {s.royalty_rate_bps > 0 && (
                          <span className="text-[10px] text-amber-300/80">
                            {(s.royalty_rate_bps / 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-6 text-xs text-white/40">
              Powered by Agentrix ClawBuddy · 灵魂×皮肤解耦 Phase 1
            </p>
          </div>
        </div>
      </main>
    </>
  );
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-white/50">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const petId = String(ctx.params?.petId || '');
  if (!petId) return { notFound: true };
  try {
    const resp = await fetch(`${API_BASE}/v1/pet/public/${encodeURIComponent(petId)}`);
    if (!resp.ok) return { notFound: true };
    const data = (await resp.json()) as {
      pet: PetPublic;
      soul: PetSoulDto | null;
      active_skin: { id: string; display_name: string } | null;
      lineage: LineageItem[];
    };
    if (!data?.pet) return { notFound: true };
    return {
      props: {
        pet: data.pet,
        soul: data.soul ?? null,
        activeSkin: data.active_skin ?? null,
        lineage: Array.isArray(data.lineage) ? data.lineage : [],
      },
    };
  } catch {
    return { notFound: true };
  }
};

export default PetPublicPage;
