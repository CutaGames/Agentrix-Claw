import Link from 'next/link';
import { GetServerSideProps } from 'next';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';

interface SkillListing {
  id: string;
  title: string;
  description?: string;
  author?: string;
  price?: number | string;
  rating?: number;
  installs?: number;
  tags?: string[];
}

interface SkillsPageProps {
  listings: SkillListing[];
  fetched: boolean;
}

export const getServerSideProps: GetServerSideProps<SkillsPageProps> = async () => {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.BACKEND_URL || 'https://api.agentrix.top';
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/skill-listings?status=published&limit=24`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { props: { listings: [], fetched: false } };
    const data = await res.json();
    const arr: any[] = Array.isArray(data) ? data : data.items ?? data.data ?? [];
    const listings: SkillListing[] = arr.map((it) => ({
      id: String(it.id ?? it.slug ?? it.skillId ?? Math.random()),
      title: it.title ?? it.name ?? 'Untitled Skill',
      description: it.description ?? it.summary,
      author: it.author?.displayName ?? it.author ?? it.publisher,
      price: it.price ?? it.priceUsd ?? it.price_usd,
      rating: it.rating ?? it.avg_rating,
      installs: it.installs ?? it.downloads,
      tags: it.tags ?? it.categories,
    }));
    return { props: { listings, fetched: true } };
  } catch {
    return { props: { listings: [], fetched: false } };
  }
};

export default function SkillsMarketplacePage({ listings, fetched }: SkillsPageProps) {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: 'Skill 市场 · Agentrix', en: 'Skill Marketplace · Agentrix' }),
    description: t({
      zh: '浏览社区贡献的 Skill 与 Agent 模板，安装即可让你的 Agent 获得新能力。',
      en: 'Browse community Skills and Agent templates — install to give your Agent new capabilities.',
    }),
    path: '/skills',
  });
  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-16">
        <div className="container mx-auto px-6">
          <div className="mx-auto mb-10 max-w-3xl text-center">
            <h1 className="text-4xl font-extrabold md:text-5xl">
              {t({ zh: 'Skill 市场', en: 'Skill Marketplace' })}
            </h1>
            <p className="mt-4 text-agentrix-fog">
              {t({
                zh: '由开发者、公司、社区贡献的 Skill / Agent 模板。安装到你的 Agent，让它立即学会新能力。',
                en: 'Skills and Agent templates contributed by developers, companies and the community. Install to teach your Agent new capabilities instantly.',
              })}
            </p>
          </div>

          {listings.length === 0 ? (
            <div className="mx-auto max-w-2xl rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-10 text-center">
              <p className="text-agentrix-fog">
                {fetched
                  ? t({ zh: '市场刚刚开放，第一批 Skill 即将上线。', en: 'The marketplace just opened. The first wave of Skills is on the way.' })
                  : t({ zh: '正在连接 Skill 市场服务…', en: 'Connecting to the Skill marketplace…' })}
              </p>
              <Link
                href="/developers"
                className="mt-6 inline-block rounded-full bg-agentrix-solar px-6 py-2.5 text-sm font-bold text-agentrix-ink"
              >
                {t({ zh: '我要发布 Skill', en: 'Publish a Skill' })}
              </Link>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {listings.map((s) => (
                <article
                  key={s.id}
                  className="flex flex-col rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-5 transition-colors hover:border-agentrix-electric/40"
                >
                  <h3 className="text-lg font-bold text-white">{s.title}</h3>
                  {s.author && (
                    <p className="mt-1 text-xs text-agentrix-mist">@{s.author}</p>
                  )}
                  {s.description && (
                    <p className="mt-3 line-clamp-3 text-sm text-agentrix-fog">{s.description}</p>
                  )}
                  <div className="mt-4 flex items-center justify-between text-xs text-agentrix-mist">
                    <span>
                      {s.price === 0 || s.price == null
                        ? t({ zh: '免费', en: 'Free' })
                        : `$${s.price}`}
                    </span>
                    {s.installs != null && <span>{s.installs} installs</span>}
                  </div>
                  <div className="mt-4">
                    <Link
                      href="/auth/login?next=/console/dashboard"
                      className="inline-block rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold text-white hover:bg-white/15"
                    >
                      {t({ zh: '安装', en: 'Install' })}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </MarketingLayout>
  );
}
