/**
 * Shared types & helpers for marketing sections.
 *
 * Kept private to the sections directory (`_` prefix) — consumers should
 * import sections from `../sections` (the barrel) and pricing data from
 * the same barrel (`PRICING_TIERS`, `PricingTier`).
 */
import { Check, X } from 'lucide-react';

// ---------- Pricing types (also re-exported from index.ts for external use) ----------

export interface PricingTier {
  key: 'free' | 'lite' | 'plus' | 'pro' | 'elite' | 'enterprise';
  name: { zh: string; en: string };
  monthlyPrice: string;
  yearlyPrice: string | null;
  yearlySavings: { zh: string; en: string } | null;
  unit: { zh: string; en: string };
  tagline: { zh: string; en: string };
  axpCashback: number;
  features: Array<{ zh: string; en: string }>;
  cta: { zh: string; en: string };
  ctaHref: string;
  highlight?: boolean;
  isEnterprise?: boolean;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    key: 'free',
    name: { zh: 'Free', en: 'Free' },
    monthlyPrice: '$0',
    yearlyPrice: null,
    yearlySavings: null,
    unit: { zh: '永久免费', en: 'Forever free' },
    tagline: { zh: '规模 + 教育 + AXP 裂变', en: 'Scale + education + AXP virality' },
    axpCashback: 0,
    features: [
      { zh: '1-2 只宠 + 基础陪伴', en: '1-2 pets + basic companion' },
      { zh: '$0.30 LLM 硬顶 + 本地模型', en: '$0.30 LLM cap + local models' },
      { zh: '每日 20 轮对话 + 5 min 语音', en: '20 rounds/day + 5 min voice' },
      { zh: '1 技能 / 1 皮肤 / 1 商品 免费上架', en: '1 skill / 1 skin / 1 product free listing' },
      { zh: '无 AXP 返现', en: 'No AXP cashback' },
    ],
    cta: { zh: '免费开始', en: 'Start free' },
    ctaHref: '/invite',
  },
  {
    key: 'lite',
    name: { zh: 'Lite', en: 'Lite' },
    monthlyPrice: '$4.99',
    yearlyPrice: '$49',
    yearlySavings: { zh: '省 $10.88', en: 'Save $10.88' },
    unit: { zh: '/ 月', en: '/ month' },
    tagline: { zh: '去除硬限，继续探索', en: 'Remove hard caps, keep exploring' },
    axpCashback: 5,
    features: [
      { zh: '5 只宠 + 无限对话 + 无限语音', en: '5 pets + unlimited chat + voice' },
      { zh: '$2.5 LLM cloud 预算', en: '$2.5 LLM cloud budget' },
      { zh: '3 技能 / 3 皮肤 / 5 商品', en: '3 skills / 3 skins / 5 products' },
      { zh: 'Sonnet / 4o 模型', en: 'Sonnet / 4o models' },
      { zh: '5% AXP 消费返现', en: '5% AXP cashback' },
    ],
    cta: { zh: '升级 Lite', en: 'Upgrade to Lite' },
    ctaHref: '/invite?plan=lite&billing=monthly',
  },
  {
    key: 'plus',
    name: { zh: 'Plus', en: 'Plus' },
    monthlyPrice: '$14.99',
    yearlyPrice: '$149',
    yearlySavings: { zh: '省 $30.88', en: 'Save $30.88' },
    unit: { zh: '/ 月', en: '/ month' },
    tagline: { zh: '黄金档 · 活跃玩家 / 创作者 / 小商户', en: 'Sweet spot — active players / creators / SMBs' },
    axpCashback: 10,
    features: [
      { zh: '15 只宠 + $8 LLM cloud 预算', en: '15 pets + $8 LLM cloud budget' },
      { zh: '10 技能 / 10 皮肤 / 30 商品', en: '10 skills / 10 skins / 30 products' },
      { zh: '首个可发布游戏 / 公会席位', en: 'First game / guild slot' },
      { zh: '集市推荐权重 1.5×', en: 'Marketplace boost 1.5×' },
      { zh: '10% AXP 消费返现', en: '10% AXP cashback' },
    ],
    cta: { zh: '升级 Plus', en: 'Upgrade to Plus' },
    ctaHref: '/invite?plan=plus&billing=monthly',
    highlight: true,
  },
  {
    key: 'pro',
    name: { zh: 'Pro', en: 'Pro' },
    monthlyPrice: '$29.99',
    yearlyPrice: '$299',
    yearlySavings: { zh: '省 $60.88', en: 'Save $60.88' },
    unit: { zh: '/ 月', en: '/ month' },
    tagline: { zh: '核心用户 · 全职开发者 / 中型商户', en: 'Power users — full-time devs / mid merchants' },
    axpCashback: 15,
    features: [
      { zh: '40 只宠 + $20 LLM cloud 预算', en: '40 pets + $20 LLM cloud budget' },
      { zh: '30 技能 / ∞ 皮肤 / 100 商品', en: '30 skills / ∞ skins / 100 products' },
      { zh: 'A2A 优先匹配 · L3 多端协签', en: 'A2A priority · L3 multi-surface co-sign' },
      { zh: '自定义 System Prompt + 模型路由', en: 'Custom system prompt + model routing' },
      { zh: '15% AXP 消费返现', en: '15% AXP cashback' },
    ],
    cta: { zh: '升级 Pro', en: 'Upgrade to Pro' },
    ctaHref: '/invite?plan=pro&billing=monthly',
  },
  {
    key: 'elite',
    name: { zh: 'Elite', en: 'Elite' },
    monthlyPrice: '$69',
    yearlyPrice: '$690',
    yearlySavings: { zh: '省 $138', en: 'Save $138' },
    unit: { zh: '/ 月', en: '/ month' },
    tagline: { zh: '品牌绑定 · 全能力无限 · 流量王者', en: 'Brand-tier — unlimited everything' },
    axpCashback: 20,
    features: [
      { zh: '无限宠 + $50 LLM cloud 预算', en: 'Unlimited pets + $50 LLM cloud budget' },
      { zh: '所有配额 ∞ + Pet SDK Beta', en: 'All quotas ∞ + Pet SDK Beta' },
      { zh: '季度限定皮肤 + Elite Creator 徽章', en: 'Seasonal skins + Elite Creator badge' },
      { zh: '2h 审核 lane + 4h 专属客服', en: '2h review lane + 4h dedicated support' },
      { zh: '20% AXP 消费返现 · 首页推荐 3×', en: '20% AXP cashback · homepage boost 3×' },
    ],
    cta: { zh: '升级 Elite', en: 'Upgrade to Elite' },
    ctaHref: '/invite?plan=elite&billing=monthly',
  },
  {
    key: 'enterprise',
    name: { zh: 'Enterprise', en: 'Enterprise' },
    monthlyPrice: '',
    yearlyPrice: null,
    yearlySavings: null,
    unit: { zh: '合同定制', en: 'Custom contract' },
    tagline: { zh: '私有化 / SLA / SOC2 / 合规', en: 'Private deploy / SLA / SOC2 / compliance' },
    axpCashback: 0,
    features: [
      { zh: '$500 起 · 10 席位 · VPC · 99.5% SLA', en: 'From $500 · 10 seats · VPC · 99.5% SLA' },
      { zh: '$5k · 100 席位 · on-prem · 99.9% SLA', en: '$5k · 100 seats · on-prem · 99.9% SLA' },
      { zh: '$50k+ · 无限 · SOC2 · ISO27001 · 白标 SDK', en: '$50k+ · unlimited · SOC2 · ISO27001 · white-label SDK' },
      { zh: '7×24 电话支持 + 专属客户经理', en: '7×24 phone support + dedicated CSM' },
    ],
    cta: { zh: '联系销售', en: 'Contact sales' },
    ctaHref: 'mailto:enterprise@agentrix.top',
    isEnterprise: true,
  },
];

// ---------- Compete table cell helper ----------

export function CompareCell({ value }: { value: boolean | 'partial' }) {
  if (value === true) return <Check size={16} className="mx-auto text-agentrix-electric" />;
  if (value === 'partial') return <span className="text-xs text-agentrix-solar">±</span>;
  return <X size={16} className="mx-auto text-agentrix-inkLine" />;
}

// ---------- FAQ chevron indicator ----------

export function ChevronIndicator() {
  return (
    <span className="ml-4 inline-block h-2 w-2 rotate-45 border-b-2 border-r-2 border-agentrix-electric transition-transform group-open:-rotate-135" />
  );
}
