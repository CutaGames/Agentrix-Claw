import { MarketingLayout } from '../components/marketing/MarketingLayout'
import {
  HeroLiving,
  ThreeSideEcosystem,
  ThreeLayerVision,
  FiveSurfaceStrip,
  V3FeaturesSection,
  AxpNarrative,
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
      zh: 'Agentrix · 你养的每一只宠物，都是一个能赚钱的 AI Agent',
      en: 'Agentrix · Every pet you raise is an AI agent that earns',
    }),
    description: t({
      zh: 'Pet-as-Agent Economy：ERC-8004 独立身份 · MPC 钱包 · X402 微支付。跨 5 端陪你、帮你、替你赚钱。AXP 积分 + 5 档订阅。',
      en: 'Pet-as-Agent Economy: ERC-8004 identity · MPC wallet · X402 micropay. Across 5 surfaces — companions, works, earns. AXP points + 5-tier subscription.',
    }),
    path: '/',
  })

  return (
    <MarketingLayout seo={seo}>
      <HeroLiving />
      <V3FeaturesSection />
      <ThreeSideEcosystem />
      <ThreeLayerVision />
      <FiveSurfaceStrip />
      <AxpNarrative />
      <CompetitiveTable />
      <DownloadCallout />
      <FAQ />
    </MarketingLayout>
  )
}

