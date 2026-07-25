/**
 * lsmPosterCopy — LSM 世界杯分享海报的**转化文案**纯函数（World Cup 拉新）。
 *
 * 目标：让看到海报的人「扫码 / 复制链接注册进来玩」。海报此前几乎没有营销文案，
 * 这里注入吸引力钩子：
 *   - 稀缺：新人限量前 1000 名；
 *   - 利益：注册即领 100 AXP + 100 USDC 体验金，直接下注开仓/平仓体验；
 *   - 行动：扫码或复制链接注册即玩。
 *
 * 合规（AXP 红线）：AXP 与 USDC **分开表述**、分别列出，绝不呈现「N AXP = M USD」这类
 * 固定兑换比例或等价关系。USDC 为 Injective 测试网体验金（新人试玩用）。
 *
 * 纯函数、无 RN 依赖 → 可在移动端 pure-logic jest harness 单测（RN 渲染/系统分享另由
 * ShareCardView + APK 端到端验证）。
 */

/** 新人赠币展示口径（与后端 signup-bonus 默认一致；仅用于文案展示，不参与结算）。 */
export const SIGNUP_BONUS_DISPLAY = {
  /** 限量名额（前 N 名）。 */
  limit: 1000,
  /** 欢迎 AXP。 */
  axp: 100,
  /** 欢迎 USDC（体验金，Injective 测试网）。 */
  usdc: 100,
} as const;

export interface WorldCupPosterInput {
  zh: boolean;
  homeTeam: string;
  awayTeam: string;
  league?: string;
  /** 'live' | 'pre' | 'final' | 'suspended' | 其它 */
  status?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  sport?: string;
}

export interface WorldCupPosterCopy {
  subtitle: string;
  description: string;
  ctaLabel: string;
  categoryLabel: string;
  tags: string[];
  /** 比分文本（"2 : 1"），无则空串。 */
  score: string;
  /** 状态文本（本地化）。 */
  statusText: string;
}

/** 状态码 → 本地化文案。 */
export function lsmStatusText(status: string | undefined, zh: boolean): string {
  switch (status) {
    case 'live':
      return zh ? '滚球进行中' : 'LIVE';
    case 'pre':
      return zh ? '即将开赛' : 'UPCOMING';
    case 'final':
      return zh ? '完场' : 'FINAL';
    case 'suspended':
      return zh ? '暂停' : 'SUSPENDED';
    default:
      return status ? status.toUpperCase() : '';
  }
}

/** 比分文本（两侧皆有分数才渲染）。 */
export function lsmScoreText(homeScore?: number | null, awayScore?: number | null): string {
  if (homeScore != null && awayScore != null) return `${homeScore} : ${awayScore}`;
  return '';
}

/**
 * 构造世界杯海报的转化文案。含新人赠币利益点 + 稀缺 + 行动号召，
 * AXP / USDC 分开表述（不呈现兑换比例）。
 */
export function buildWorldCupPosterCopy(input: WorldCupPosterInput): WorldCupPosterCopy {
  const { zh } = input;
  const b = SIGNUP_BONUS_DISPLAY;
  const statusText = lsmStatusText(input.status, zh);
  const score = lsmScoreText(input.homeScore, input.awayScore);
  const scorePart = score ? (zh ? `  比分 ${score}` : `  ${score}`) : '';

  const subtitle = input.league
    ? input.league
    : zh
      ? '世界杯滚球预测 · 注册即玩'
      : 'World Cup Live Predictions · Play now';

  // 利益点分开表述（AXP + USDC 各自列出，无固定兑换比例）。USDC 明确为站内体验金（测试网·
  // 可直接下注，不可直接转出），避免「打进你钱包」的误解（诚实口径，防落差伤转化）。
  // 精简为一句强利益点，避免海报内被截断（比分/状态已由 priceLabel 单独展示）。
  const description = zh
    ? `🎁 注册即领 ${b.axp} AXP + ${b.usdc} USDC 站内体验金，直接下注体验杠杆赔率。`
    : `🎁 Sign up to get ${b.axp} AXP + ${b.usdc} USDC in-app trial credits — bet right away.`;

  const ctaLabel = zh
    ? `扫码注册 · 领 ${b.axp} AXP + ${b.usdc} USDC 体验金`
    : `Scan to register · Get ${b.axp} AXP + ${b.usdc} USDC credits`;

  const categoryLabel = zh ? '世界杯' : 'World Cup';

  const tags = zh
    ? ['世界杯', '注册即玩', input.sport || 'soccer']
    : ['WorldCup', 'PlayFree', input.sport || 'soccer'];

  return { subtitle, description, ctaLabel, categoryLabel, tags, score, statusText };
}

/** WorldCupHero 屏内营销标语（一行，吸引点击/注册）。 */
export function worldCupHeroTagline(zh: boolean): string {
  const b = SIGNUP_BONUS_DISPLAY;
  return zh
    ? `🎁 新人注册即领 ${b.axp} AXP + ${b.usdc} USDC 站内体验金（测试网）`
    : `🎁 Sign up to get ${b.axp} AXP + ${b.usdc} USDC in-app trial credits (testnet)`;
}
