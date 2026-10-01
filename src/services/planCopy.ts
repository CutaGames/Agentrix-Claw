/**
 * 我的 → 套餐与模型 (D19): the plan structure and what is never charged, word for word the web pricing page
 * (`frontend/components/marketing/sections/PricingTable.tsx`); no price until a real checkout works, and AXP
 * never shown as money (DECISIONS: AXP has no fixed dollar value). A test compares this file with the web page.
 *
 * No React Native import here, so the copy and the links are testable in plain jest.
 */
export type PlanCopyV1 = { zh: string; en: string };

/** Where the plan links open: the public site, in the browser. */
export const PLAN_SITE_ORIGIN = 'https://www.agentrix.top';

export interface PlanCardV1 {
  key: 'free' | 'pro' | 'creator';
  name: PlanCopyV1;
  price: PlanCopyV1;
  description: PlanCopyV1;
  features: readonly PlanCopyV1[];
  /** Free has no button on the phone: the owner is already using it. */
  cta: PlanCopyV1 | null;
  path: '/soul-core/founding-access' | '/twin' | null;
  highlight: boolean;
}

export const PLANS: readonly PlanCardV1[] = [
  {
    key: 'free',
    name: { zh: '免费', en: 'Free' },
    price: { zh: '免费', en: 'Free' },
    description: {
      zh: '有一个自己的 AI 伙伴，把以前的记忆带进来。',
      en: 'Your own AI companion, with your earlier memories brought in.',
    },
    features: [
      { zh: '伙伴对话', en: 'Chat with your companion' },
      { zh: '从 ChatGPT、Claude 等带入记忆', en: 'Bring memories in from ChatGPT, Claude and others' },
      { zh: '私密分身（只有你能用）', en: 'A private twin only you can use' },
    ],
    cta: null,
    path: null,
    highlight: false,
  },
  {
    key: 'pro',
    name: { zh: 'Pro', en: 'Pro' },
    price: { zh: '开放购买时显示', en: 'Shown when available' },
    description: {
      zh: '用得更多：更多用量、跨设备同步，让你的电脑替你干活。',
      en: 'For heavier use: more usage, sync across devices, and your computer doing the work.',
    },
    features: [
      { zh: '更多用量', en: 'More usage' },
      { zh: '手机、电脑、网页之间同步', en: 'Sync across phone, computer and web' },
      { zh: '在你的电脑上执行任务', en: 'Tasks run on your computer' },
    ],
    cta: { zh: '查看当前体验方式', en: 'See current access options' },
    path: '/soul-core/founding-access',
    highlight: true,
  },
  {
    key: 'creator',
    name: { zh: '创作者附加', en: 'Creator add-on' },
    price: { zh: '开放购买时显示', en: 'Shown when available' },
    description: {
      zh: '让分身对外：公开名片、接单和收费。',
      en: 'Take your twin public: a public card, bookings and paid work.',
    },
    features: [
      { zh: '公开分身名片', en: 'A public twin card' },
      { zh: '服务目录', en: 'A service catalogue' },
      { zh: '付费问答与定金', en: 'Paid questions and deposits' },
    ],
    cta: { zh: '了解分身', en: 'About twins' },
    path: '/twin',
    highlight: false,
  },
];

export const PLAN_HIGHLIGHT_BADGE: PlanCopyV1 = { zh: '频繁使用', en: 'Frequent use' };

/** Never charged, on any plan (twin spec §12.2, D19). */
export const NEVER_CHARGED: readonly PlanCopyV1[] = [
  { zh: '核验状态', en: 'Verification status' },
  { zh: '撤销', en: 'Revocation' },
  { zh: '急停', en: 'Emergency stop' },
  { zh: '举报', en: 'Reporting' },
  { zh: '最低限度的数据导出', en: 'A baseline data export' },
  { zh: '争议处理', en: 'Dispute handling' },
];

export const NEVER_CHARGED_TITLE: PlanCopyV1 = { zh: '这些永远不收费', en: 'These are never charged' };

/** `PRICING_ESCROW_NOTE` in `frontend/lib/public-site/l3-copy.ts`. */
export const ESCROW_NOTE: PlanCopyV1 = {
  zh: '付费问答和定金：钱在托管里，买方验收后放款；放款前可以全额退款；争议 7 天内由平台裁决。',
  en: 'Paid questions and deposits: the money is held in escrow and released after the buyer accepts; it can be refunded in full before release; disputes are decided by the platform within 7 days.',
};

export const NO_PRICE_NOTE: PlanCopyV1 = {
  zh: '功能正在分批开放。真实结账开通之前这里不写价格；任何价格、税费、地区限制、额度和超额费用都会在购买前显示，并以结算页或双方书面方案为准。',
  en: 'Features are opening in stages. No price is listed here until real checkout opens; any price, tax, regional limit, quota, or overage is shown before purchase and governed by checkout or a written agreement.',
};

export const AXP_NOTE: PlanCopyV1 = {
  zh: 'AXP 是平台内不可提现的积分，不是现金、证券、稳定币或收益凭证。它没有保证兑换率、现金价值或投资回报；具体用途和有效规则以产品内说明为准。',
  en: 'AXP is a non-withdrawable in-app point—not cash, securities, stablecoin, or an earnings instrument. It has no guaranteed exchange rate, cash value, or investment return; current uses and rules are shown in-product.',
};

/** A plan link, always on the public site (never a server-supplied address). */
export function planUrl(path: '/soul-core/founding-access' | '/twin' | '/pricing'): string {
  return `${PLAN_SITE_ORIGIN}${path}`;
}
