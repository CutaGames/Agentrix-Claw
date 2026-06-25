import Link from 'next/link';
import { GetStaticPaths, GetStaticProps } from 'next';
import { MarketingLayout } from '../../components/marketing/MarketingLayout';
import { buildSeo } from '../../lib/seo';
import { useLocalization } from '../../contexts/LocalizationContext';

interface LegacyEntry {
  zhTitle: string;
  enTitle: string;
  zhBody: string;
  enBody: string;
  /** Where to redirect users who still want this capability. */
  zhCtaLabel: string;
  enCtaLabel: string;
  ctaHref: string;
}

const LEGACY_MAP: Record<string, LegacyEntry> = {
  claw: {
    zhTitle: 'Agentrix Claw 已迁移',
    enTitle: 'Agentrix Claw has moved',
    zhBody: 'Claw 移动客户端已并入统一下载中心。请前往「下载」页获取最新 Mobile / Desktop 客户端。',
    enBody: 'The Claw mobile client is now part of the unified Downloads page. Grab the latest Mobile / Desktop apps there.',
    zhCtaLabel: '前往下载页',
    enCtaLabel: 'Go to Downloads',
    ctaHref: '/downloads',
  },
  predict: {
    zhTitle: 'Predict 已并入 Skill 市场',
    enTitle: 'Predict has merged into the Skill marketplace',
    zhBody: '预测类玩法已重构为可安装的 Skill，请在 Skill 市场中搜索 “Predict”。',
    enBody: 'Prediction features are now installable Skills. Search "Predict" in the Skill marketplace.',
    zhCtaLabel: '前往 Skill 市场',
    enCtaLabel: 'Browse Skills',
    ctaHref: '/skills',
  },
  'ax-payment': {
    zhTitle: 'AX Payment 已升级为 Console 钱包',
    enTitle: 'AX Payment has upgraded into Console Wallet',
    zhBody: '统一支付能力已迁移到 Web Console > Wallet，并叠加 X402 微支付与 Auto-Earn。',
    enBody: 'Unified payments now live under Web Console > Wallet, with X402 micropay and Auto-Earn on top.',
    zhCtaLabel: '打开 Console',
    enCtaLabel: 'Open Console',
    ctaHref: '/auth/login?next=/console/wallet',
  },
  'payment-demo': {
    zhTitle: '支付 Demo 已下线',
    enTitle: 'Payment demo retired',
    zhBody: '原演示页面已合并至开发者文档；最新示例请见 SDK 仓库。',
    enBody: 'The old demo page is consolidated into developer docs. See the SDK repo for the latest samples.',
    zhCtaLabel: '前往开发者中心',
    enCtaLabel: 'Visit Developers',
    ctaHref: '/developers',
  },
  alliance: {
    zhTitle: '联盟计划已升级为生态合作',
    enTitle: 'Alliance has upgraded to Ecosystem partnerships',
    zhBody: '原联盟生态已重构为 Skill 开发者分润 + 企业合作两条线，请联系 partners@agentrix.top。',
    enBody: 'The Alliance has been split into Skill developer revenue share and Enterprise partnerships. Contact partners@agentrix.top.',
    zhCtaLabel: '联系生态团队',
    enCtaLabel: 'Contact ecosystem',
    ctaHref: 'mailto:partners@agentrix.top',
  },
};

interface LegacyPageProps {
  slug: string;
  entry: LegacyEntry;
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: Object.keys(LEGACY_MAP).map((slug) => ({ params: { slug } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<LegacyPageProps> = async ({ params }) => {
  const slug = String(params?.slug ?? '');
  const entry = LEGACY_MAP[slug];
  if (!entry) return { notFound: true };
  return { props: { slug, entry } };
};

export default function LegacySlugPage({ slug, entry }: LegacyPageProps) {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: entry.zhTitle, en: entry.enTitle }),
    description: t({ zh: entry.zhBody, en: entry.enBody }),
    path: `/legacy/${slug}`,
  });
  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-24">
        <div className="container mx-auto max-w-2xl px-6 text-center">
          <p className="mb-3 text-xs uppercase tracking-widest text-agentrix-mist">
            {t({ zh: '页面已迁移', en: 'Page moved' })}
          </p>
          <h1 className="text-3xl font-extrabold md:text-4xl">
            {t({ zh: entry.zhTitle, en: entry.enTitle })}
          </h1>
          <p className="mt-6 text-agentrix-fog">{t({ zh: entry.zhBody, en: entry.enBody })}</p>
          <div className="mt-10">
            {entry.ctaHref.startsWith('mailto:') ? (
              <a href={entry.ctaHref} className="inline-block rounded-full bg-agentrix-solar px-7 py-3 text-sm font-bold text-agentrix-ink">
                {t({ zh: entry.zhCtaLabel, en: entry.enCtaLabel })}
              </a>
            ) : (
              <Link href={entry.ctaHref} className="inline-block rounded-full bg-agentrix-solar px-7 py-3 text-sm font-bold text-agentrix-ink">
                {t({ zh: entry.zhCtaLabel, en: entry.enCtaLabel })}
              </Link>
            )}
          </div>
          <p className="mt-8 text-xs text-agentrix-mist">
            {t({ zh: '感谢一路同行 — Agentrix v3 已经在 5 端等你。', en: 'Thanks for being here — Agentrix v3 is waiting across 5 surfaces.' })}
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}
