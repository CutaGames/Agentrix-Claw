import { MarketingLayout } from '../components/marketing/MarketingLayout'
import {
  HeroLiving,
  ThreeLayerVision,
  FiveSurfaceStrip,
  V3FeaturesSection,
  CompetitiveTable,
  DownloadCallout,
  FAQ,
} from '../components/marketing/sections'
import { buildSeo } from '../lib/seo'
import { useLocalization } from '../contexts/LocalizationContext'

export default function Home() {
  const { t } = useLocalization()
  const seo = buildSeo({
    title: t({
      zh: 'Agentrix · 一只 Agent，陪你 · 帮你 · 替你赚钱',
      en: 'Agentrix · One agent — with you, for you, earning for you',
    }),
    description: t({
      zh: 'Living Agent / Doer / Economy 三层愿景，跨 Mobile / Desktop / Web / Watch / Server 5 端无缝陪伴、执行任务、自动结算收益。',
      en: 'Three-layer vision: Living Agent, Doer, Economy. The same Agent across Mobile, Desktop, Web, Watch and Server — companion, executor, earner.',
    }),
    path: '/',
  })

  return (
    <MarketingLayout seo={seo}>
      <HeroLiving />
      <V3FeaturesSection />
      <ThreeLayerVision />
      <FiveSurfaceStrip />
      <CompetitiveTable />
      <DownloadCallout />
      <FAQ />
    </MarketingLayout>
  )
}

