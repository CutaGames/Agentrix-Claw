/**
 * L9 P2-5 晨报叙述版（开关 `OWNER_ALERTS_DIGEST_NARRATIVE_V1_ENABLED`，只认精确的 `'1'`，默认关）。
 *
 * 把每天的条数摘要换成一句叙述：「过去 24 小时分身答了 N 个问题，其中 X 个直接答、Y 个转给你，来了 Z 个转介请求。」
 * 下面最多 5 条「需要你」，每条带一个站内链接。每个数字的说法都和实际数的东西一致（E-R5）：N、X、Y 和各类提醒都是
 * 过去 24 小时的条数，只有「回答等你复核」是此刻还开着的条目数。全部是固定模板加数字：没有访客的原话、姓名、联系方式、金额，也没有
 * 分身的回答（延续 `owner-alert-copy.ts` 的规矩）。后端存中文一份，网页按界面语言用同一份数字重新组句。
 */
import type { PushLocale } from './push-notification';

export const OWNER_ALERTS_DIGEST_NARRATIVE_V1_FLAG = 'OWNER_ALERTS_DIGEST_NARRATIVE_V1_ENABLED' as const;

/** 「需要你」最多几条。 */
export const OWNER_DIGEST_NEEDS_MAX_V1 = 5;

/** 分身过去 24 小时回答访客的计数，只有数字。 */
export interface OwnerDigestTwinFactsV1 {
  /** 访客问题的回答数。 */
  answered: number;
  /** 其中用主人确认过的内容直接答的。 */
  direct: number;
  /** 其中转给主人的（不代答）。 */
  handedOff: number;
  /** 复核队列里还开着的条目数（不限 24 小时）。 */
  reviewOpen: number;
}

/** 「需要你」的种类，按这个顺序排，最多 5 条。 */
export const OWNER_DIGEST_NEED_KINDS_V1 = ['introduction_approval', 'introduction_received', 'guest_booking', 'review_queue', 'twin_lead'] as const;
export type OwnerDigestNeedKindV1 = (typeof OWNER_DIGEST_NEED_KINDS_V1)[number];

export interface OwnerDigestNeedV1 {
  kind: OwnerDigestNeedKindV1;
  count: number;
}

/** 存进站内通知 `data.narrative` 的内容（只有数字和种类），网页靠它按界面语言组句、给链接。 */
export interface OwnerDigestNarrativeDataV1 {
  schemaVersion: 1;
  /** 链接指向哪只分身（主人自己的 Agent id）；没有分身时为 null。 */
  agentId: string | null;
  twin: OwnerDigestTwinFactsV1;
  /**
   * 过去 24 小时新来的转介请求条数（「有一个转介等你批准」提醒的条数）。不是此刻还在等批的数，所以文字写「来了 Z 个转介请求」
   * （E-R5）；字段名沿用，A 线引荐表合进来以后可以换成待批数再改文字。
   */
  introductionsAwaiting: number;
  needs: OwnerDigestNeedV1[];
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1_000_000 ? value : 0;
}

/**
 * 由计数组出「需要你」：数为 0 的不列，按固定顺序，最多 5 条。`alertCounts` 是过去 24 小时各类提醒的条数
 * （`introduction_approval`、`introduction_received`、`booking_new`、`twin_lead`）。
 */
export function ownerDigestNeedsV1(input: { twin: OwnerDigestTwinFactsV1; alertCounts: Partial<Record<string, number>> }): OwnerDigestNeedV1[] {
  const byKind: Record<OwnerDigestNeedKindV1, number> = {
    introduction_approval: count(input.alertCounts.introduction_approval),
    introduction_received: count(input.alertCounts.introduction_received),
    guest_booking: count(input.alertCounts.booking_new),
    review_queue: count(input.twin.reviewOpen),
    twin_lead: count(input.alertCounts.twin_lead),
  };
  return OWNER_DIGEST_NEED_KINDS_V1.filter((kind) => byKind[kind] > 0)
    .slice(0, OWNER_DIGEST_NEEDS_MAX_V1)
    .map((kind) => ({ kind, count: byKind[kind] }));
}

export function buildOwnerDigestNarrativeDataV1(input: {
  agentId: string | null;
  twin: OwnerDigestTwinFactsV1;
  alertCounts: Partial<Record<string, number>>;
}): OwnerDigestNarrativeDataV1 {
  const twin = { answered: count(input.twin.answered), direct: count(input.twin.direct), handedOff: count(input.twin.handedOff), reviewOpen: count(input.twin.reviewOpen) };
  return {
    schemaVersion: 1,
    agentId: input.agentId,
    twin,
    introductionsAwaiting: count(input.alertCounts.introduction_approval),
    needs: ownerDigestNeedsV1({ twin, alertCounts: input.alertCounts }),
  };
}

/** 有没有值得发的东西：分身答过问题，或者有「需要你」。 */
export function ownerDigestNarrativeHasContentV1(data: OwnerDigestNarrativeDataV1): boolean {
  return data.twin.answered > 0 || data.needs.length > 0;
}

export function ownerDigestNarrativeTitleV1(locale: PushLocale): string {
  return locale === 'en' ? 'What your twin handled for you' : '分身替你处理了什么';
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** 那一句叙述。固定模板，只有数字。 */
export function ownerDigestNarrativeSentenceV1(data: Pick<OwnerDigestNarrativeDataV1, 'twin' | 'introductionsAwaiting'>, locale: PushLocale): string {
  const { answered, direct, handedOff } = data.twin;
  const z = data.introductionsAwaiting;
  if (locale === 'en') {
    const first =
      answered === 0
        ? 'In the past 24 hours your twin had no questions to answer'
        : `In the past 24 hours your twin answered ${plural(answered, 'question', 'questions')}: ${direct} directly, ${handedOff} handed to you`;
    return `${first}; ${z === 0 ? 'no new referral requests came in' : `${plural(z, 'new referral request', 'new referral requests')} came in`}.`;
  }
  const first = answered === 0 ? '过去 24 小时分身没有收到要回答的问题' : `过去 24 小时分身答了 ${answered} 个问题，其中 ${direct} 个直接答、${handedOff} 个转给你`;
  return `${first}，${z === 0 ? '没有新的转介请求' : `来了 ${z} 个转介请求`}。`;
}

/**
 * 「需要你」每条的说法和数的东西一致（E-R5）：转介请求、同行转来的客户、新预约、访客留下的联系方式都是过去 24 小时
 * 收到的提醒条数（不说「等你批准」「等你确认」，因为其中可能已经处理过）；复核是此刻还开着的条目数。
 */
const NEED_COPY: Record<OwnerDigestNeedKindV1, Record<'zh' | 'en', (n: number) => string>> = {
  introduction_approval: { zh: (n) => `${n} 个新的转介请求`, en: (n) => plural(n, 'new referral request', 'new referral requests') },
  introduction_received: { zh: (n) => `同行转来 ${n} 位客户`, en: (n) => `${plural(n, 'client', 'clients')} referred to you` },
  guest_booking: { zh: (n) => `${n} 个新预约`, en: (n) => plural(n, 'new booking', 'new bookings') },
  review_queue: { zh: (n) => `${n} 条回答等你复核`, en: (n) => `${plural(n, 'answer', 'answers')} to review` },
  twin_lead: { zh: (n) => `访客留下 ${n} 条联系方式`, en: (n) => `${plural(n, 'contact', 'contacts')} left by visitors` },
};

export function ownerDigestNeedLabelV1(need: OwnerDigestNeedV1, locale: PushLocale): string {
  return NEED_COPY[need.kind][locale === 'en' ? 'en' : 'zh'](need.count);
}

/** 每条「需要你」的站内路径。没有分身 id 时只能回到 Agent 列表。 */
export function ownerDigestNeedPathV1(kind: OwnerDigestNeedKindV1, agentId: string | null): string {
  if (!agentId || !/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/.test(agentId)) return '/agents';
  const agent = encodeURIComponent(agentId);
  switch (kind) {
    case 'introduction_approval':
    case 'introduction_received':
      return `/agents/${agent}/twin/status`;
    case 'guest_booking':
      return `/agents/${agent}/twin/bookings`;
    case 'review_queue':
      return `/agents/${agent}/twin#twin-block-review-content`;
    case 'twin_lead':
      return `/agents/${agent}/twin`;
    default:
      return '/agents';
  }
}

/** 站内通知那一行的正文：一句叙述，加上「需要你」每行一条。 */
export function ownerDigestNarrativeMessageV1(data: OwnerDigestNarrativeDataV1, locale: PushLocale): string {
  const sentence = ownerDigestNarrativeSentenceV1(data, locale);
  if (data.needs.length === 0) return sentence;
  const head = locale === 'en' ? 'Needs you:' : '需要你：';
  return [sentence, head, ...data.needs.map((need) => `· ${ownerDigestNeedLabelV1(need, locale)}`)].join('\n');
}

/** 网页读 `data.narrative` 用：形状不对就当没有（退回条数版）。 */
export function decodeOwnerDigestNarrativeDataV1(value: unknown): OwnerDigestNarrativeDataV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1) return null;
  if (v.agentId !== null && (typeof v.agentId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/.test(v.agentId))) return null;
  const twin = v.twin as Record<string, unknown> | null;
  if (!twin || typeof twin !== 'object') return null;
  const nums = ['answered', 'direct', 'handedOff', 'reviewOpen'] as const;
  if (!nums.every((key) => typeof twin[key] === 'number' && count(twin[key]) === twin[key])) return null;
  if (typeof v.introductionsAwaiting !== 'number' || count(v.introductionsAwaiting) !== v.introductionsAwaiting) return null;
  if (!Array.isArray(v.needs) || v.needs.length > OWNER_DIGEST_NEEDS_MAX_V1) return null;
  const needs: OwnerDigestNeedV1[] = [];
  for (const raw of v.needs) {
    const need = raw as Record<string, unknown>;
    if (!need || !(OWNER_DIGEST_NEED_KINDS_V1 as readonly unknown[]).includes(need.kind) || typeof need.count !== 'number' || count(need.count) !== need.count || need.count === 0) return null;
    needs.push({ kind: need.kind as OwnerDigestNeedKindV1, count: need.count });
  }
  return {
    schemaVersion: 1,
    agentId: v.agentId as string | null,
    twin: { answered: twin.answered as number, direct: twin.direct as number, handedOff: twin.handedOff as number, reviewOpen: twin.reviewOpen as number },
    introductionsAwaiting: v.introductionsAwaiting,
    needs,
  };
}

/** 邮件只链接到站点本身和不带 id 的路径（和 C 线 P1-4 的提醒邮件同一条规矩）。 */
export const OWNER_DIGEST_EMAIL_LINK_V1 = 'https://agentrix.top/agents';

/** 晨报邮件：收件人由服务端从主人自己的账户读出；正文只有固定模板和数字。 */
export function buildOwnerDigestNarrativeEmailV1(data: OwnerDigestNarrativeDataV1, accountEmail: string, locale: PushLocale = 'zh'): { to: string; subject: string; text: string } {
  const en = locale === 'en';
  return {
    to: accountEmail,
    subject: `Agentrix${en ? ': ' : '：'}${ownerDigestNarrativeTitleV1(locale)}`,
    text: [
      ownerDigestNarrativeMessageV1(data, locale),
      '',
      en ? `Open Agentrix: ${OWNER_DIGEST_EMAIL_LINK_V1}` : `打开 Agentrix 处理：${OWNER_DIGEST_EMAIL_LINK_V1}`,
      '',
      en ? 'This is a fixed daily summary from Agentrix; it contains no client details.' : '这是 Agentrix 每天自动发出的固定摘要，邮件里没有任何客户信息。',
    ].join('\n'),
  };
}
