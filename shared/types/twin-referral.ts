/**
 * L9 P1-3b 分身提议转介 + P1-3-shadow 给 B 的转介文案草稿。
 *
 * 硬规则（target-l9 3.2 规则 0、1、2）：
 * - 分身只在主人自己打开「满额或不对口时，允许分身向访客提出转介」之后才会提；默认关。拿不准一律不提。
 * - 只提 B 已经同意被列入、没有撤回的同行（`TwinPeerListedV1`）。分身不替 B 报档期，不承诺 B 多久回。
 * - 价格、折扣、合同、退款、医疗、法律、投资类问题一律只转本人，不提转介。
 * - 提问文案是固定模板（`renderTwinReferralOfferTextV1`），不让模型自由发挥；访客的联系方式在 B 接受之后才给 B。
 * - `inquiry_fit` 是新字段，不是 `noAnswerReason`，也不往 `DIGITAL_TWIN_NO_ANSWER_REASONS_V1` 里加值。
 * - 草稿（shadow）只供人看，不发送，不带客户联系方式，不碰同意流程。
 *
 * 开关：`TWIN_REFERRAL_OFFER_V1_ENABLED`（只认精确的 `'1'`，默认关），同时要 `PEER_LIST_V1_ENABLED` 开着。
 * 解码函数拒收未知字段，失败时给原因码和字段名，不抛异常。
 */
import { INTRODUCTION_NEED_REGIONS_V1, INTRODUCTION_PAGE_PATHS_V1, decodeIntroductionNeedCardV1, type IntroductionNeedCardV1, type IntroductionNeedRegionV1 } from './introduction';

export const TWIN_REFERRAL_SCHEMA_VERSION_V1 = 1 as const;

/**
 * 访客点「要」之后的免登录接口（令牌放请求体）。服务端核对这条提问是自己发出的、没过期、没用过，B 此刻仍在名单里，
 * 再按 P1-1 的客户先同意流程建一条引荐，回给访客一个同意页链接；访客在同意页自己输入联系方式并同意，之前什么都不离开访客。
 */
export const TWIN_REFERRAL_START_ROUTE_V1 = '/peers/referral/start';

export const TWIN_REFERRAL_OFFER_LIMITS_V1 = {
  /** 一条提问发出后多久内可以点「要」。 */
  offerMinutes: 30,
  /** 每令牌每分钟、每网络地址每分钟（同 P1-1 的免登录规则）。 */
  tokenPerMinute: 30,
  ipPerMinute: 60,
  /** 每网络地址每小时最多开始几次（同 P1-1 同意接口的每小时 10 次）。 */
  startPerIpPerHour: 10,
} as const;

/** 提问令牌：32 字节随机的 base64url，43 个字符，只存 SHA-256。格式不对的直接当作不存在。 */
export const TWIN_REFERRAL_OFFER_TOKEN_PATTERN_V1 = /^[A-Za-z0-9_-]{43}$/;

/** 询问和主人的匹配度。`full` 来自「这段时间满额」开关；其余由主题标签规则给出（C 线 P1-5 落库）；默认 `ok`。 */
export const INQUIRY_FITS_V1 = ['full', 'off_topic', 'out_of_scope', 'ok'] as const;
export type InquiryFitV1 = (typeof INQUIRY_FITS_V1)[number];

/** 不提转介的原因，只给主人和日志看，不给访客。 */
export const TWIN_REFERRAL_SKIP_REASONS_V1 = [
  'owner_not_opted_in',
  'consent_flow_unavailable',
  'fit_ok',
  'fit_unknown',
  'blocked_by_no_answer_reason',
  'commitment_topic',
  'no_listed_peer',
  'no_matching_peer',
] as const;
export type TwinReferralSkipReasonV1 = (typeof TWIN_REFERRAL_SKIP_REASONS_V1)[number];

/** 这些 `noAnswerReason` 一律不提转介（价格、折扣、合同、专业建议这一类；只读，不改共享枚举）。 */
export const TWIN_REFERRAL_BLOCKING_NO_ANSWER_REASONS_V1 = [
  'requires_human',
  'hard_boundary',
  'price_or_contract_commitment',
  'professional_advice_restricted',
] as const;

export type TwinReferralLanguageV1 = 'zh-CN' | 'en';

/** 访客在对话里看到的转介提问。`peerId` 是名单条目的不透明 id，同意流用它指向 B。不含 B 的联系方式、档期和价格。 */
export interface TwinReferralOfferV1 {
  schemaVersion: typeof TWIN_REFERRAL_SCHEMA_VERSION_V1;
  peerId: string;
  peerDisplayName: string;
  subjects: string[];
  /** 固定模板，已按访客语言写好。 */
  text: string;
  /** 访客同意之前，任何信息都不离开访客。 */
  needsCustomerConsent: true;
  /** 访客点「要」时带回的一次性令牌（30 分钟内有效，只用一次）。服务端凭它认出这条提问，访客改不了转给谁。 */
  offerToken: string;
}

/** 访客点「要」：带上提问令牌和自己填的需求卡（类别、区域、时间窗、一句话 ≤140 字，不许有姓名、学校、号码、链接）。 */
export interface TwinReferralStartCommandV1 {
  schemaVersion: typeof TWIN_REFERRAL_SCHEMA_VERSION_V1;
  offerToken: string;
  needCard: IntroductionNeedCardV1;
}

/** 开始的结果：P1-1 同意页的链接（令牌在 `#t=` 之后）。访客到那里看清转给谁、给什么、留多久，自己输入联系方式再同意。 */
export interface TwinReferralStartResultV1 {
  schemaVersion: typeof TWIN_REFERRAL_SCHEMA_VERSION_V1;
  consentUrl: string;
}

const CONSENT_URL = new RegExp(`^https?://[^\\s/#?]+(?::\\d+)?${INTRODUCTION_PAGE_PATHS_V1.consent.replace(/\//g, '\\/')}#t=[A-Za-z0-9_-]{43}$`);

function cleanName(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff"“”「」]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

/**
 * 访客看到的固定提问。不替 B 报档期，不说多久回，不提价格；说明联系方式在 B 接受之后才给 B，访客随时可以撤回。
 * 一种语言一段文字：中文版没有英文单词（B 的名字除外），英文版没有汉字（B 的名字除外）。
 */
export function renderTwinReferralOfferTextV1(language: TwinReferralLanguageV1, peerDisplayName: string): string {
  const name = cleanName(peerDisplayName);
  if (language === 'en') {
    return `This is an AI twin. The person cannot take this on right now. Someone on their trusted list, “${name}”, may be a good fit. Would you like me to show your request to ${name}, so that ${name} can decide whether to take it? Your contact details go to ${name} only after they accept, and you can withdraw at any time.`;
  }
  return `我是 AI 分身。本人暂时接不了这件事。本人的信得过名单里有一位同行「${name}」，可能合适。要不要把你的需求给「${name}」看一眼，由「${name}」自己决定接不接？你的联系方式要等「${name}」接受之后才会给对方，你随时可以撤回。`;
}

// ── 解码 ────────────────────────────────────────────────────────────────────────────

export const TWIN_REFERRAL_REASON_CODES_V1 = ['unsupported_schema_version', 'unknown_field', 'missing_field', 'invalid_type', 'invalid_value', 'inquiry_not_desensitised'] as const;
export type TwinReferralReasonCodeV1 = (typeof TWIN_REFERRAL_REASON_CODES_V1)[number];
export type TwinReferralDecodeResultV1<T> = { ok: true; value: T } | { ok: false; reasonCode: TwinReferralReasonCodeV1; field: string };

type Failure = { ok: false; reasonCode: TwinReferralReasonCodeV1; field: string };
const CONTROL = /[\u0000-\u001f\u007f]/;

function fail(reasonCode: TwinReferralReasonCodeV1, field: string): Failure {
  return { ok: false, reasonCode, field };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isFailure(value: Failure | Record<string, unknown>): value is Failure {
  return value.ok === false && typeof value.reasonCode === 'string';
}
function envelope(value: unknown, allowed: readonly string[], required: readonly string[]): Failure | Record<string, unknown> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  if (value.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (typeof value.schemaVersion !== 'number') return fail('invalid_type', 'schemaVersion');
  if (value.schemaVersion !== TWIN_REFERRAL_SCHEMA_VERSION_V1) return fail('unsupported_schema_version', 'schemaVersion');
  for (const key of Object.keys(value)) if (key !== 'schemaVersion' && !allowed.includes(key)) return fail('unknown_field', key);
  for (const key of required) if (value[key] === undefined) return fail('missing_field', key);
  return value;
}

/** 校验服务端发来的转介提问（网页用）。 */
export function decodeTwinReferralOfferV1(value: unknown): TwinReferralDecodeResultV1<TwinReferralOfferV1> {
  const keys = ['peerId', 'peerDisplayName', 'subjects', 'text', 'needsCustomerConsent', 'offerToken'];
  const rec = envelope(value, keys, keys);
  if (isFailure(rec)) return rec;
  if (typeof rec.peerId !== 'string' || rec.peerId.length === 0 || rec.peerId.length > 80) return fail('invalid_value', 'peerId');
  if (typeof rec.peerDisplayName !== 'string' || rec.peerDisplayName.trim().length === 0 || rec.peerDisplayName.length > 100 || CONTROL.test(rec.peerDisplayName)) return fail('invalid_value', 'peerDisplayName');
  if (!Array.isArray(rec.subjects) || rec.subjects.length > 5 || rec.subjects.some((item) => typeof item !== 'string' || item.length === 0 || item.length > 30)) return fail('invalid_value', 'subjects');
  if (typeof rec.text !== 'string' || rec.text.length === 0 || rec.text.length > 1200) return fail('invalid_value', 'text');
  if (rec.needsCustomerConsent !== true) return fail('invalid_value', 'needsCustomerConsent');
  if (typeof rec.offerToken !== 'string' || !TWIN_REFERRAL_OFFER_TOKEN_PATTERN_V1.test(rec.offerToken)) return fail('invalid_value', 'offerToken');
  return {
    ok: true,
    value: {
      schemaVersion: TWIN_REFERRAL_SCHEMA_VERSION_V1,
      peerId: rec.peerId,
      peerDisplayName: rec.peerDisplayName,
      subjects: rec.subjects as string[],
      text: rec.text,
      needsCustomerConsent: true,
      offerToken: rec.offerToken,
    },
  };
}

/**
 * 服务端校验访客的「要」。令牌格式不对给 `invalid_value` / `offerToken`（服务端一律当作不存在，回 404）；
 * 需求卡的原因码沿用 P1-1 契约（例如 `need_note_personal`、`need_note_too_long`），页面按当前语言写人话。
 */
export function decodeTwinReferralStartCommandV1(value: unknown): { ok: true; value: TwinReferralStartCommandV1 } | { ok: false; reasonCode: string; field: string } {
  const rec = envelope(value, ['offerToken', 'needCard'], ['offerToken', 'needCard']);
  if (isFailure(rec)) return rec;
  if (typeof rec.offerToken !== 'string' || !TWIN_REFERRAL_OFFER_TOKEN_PATTERN_V1.test(rec.offerToken)) return fail('invalid_value', 'offerToken');
  const card = decodeIntroductionNeedCardV1(rec.needCard, 'needCard');
  if (card.ok === false) return { ok: false, reasonCode: card.reasonCode, field: card.field };
  return { ok: true, value: { schemaVersion: TWIN_REFERRAL_SCHEMA_VERSION_V1, offerToken: rec.offerToken, needCard: card.value } };
}

/**
 * 校验开始的结果（网页用）。只认同意页路径、令牌在片段里的链接，别的一律不跳。
 * 主机名这里不判断：网页只取路径和片段，主机一律换成本站自己的（`consentPagePath`）。
 */
export function decodeTwinReferralStartResultV1(value: unknown): TwinReferralDecodeResultV1<TwinReferralStartResultV1> {
  const rec = envelope(value, ['consentUrl'], ['consentUrl']);
  if (isFailure(rec)) return rec;
  if (typeof rec.consentUrl !== 'string' || !CONSENT_URL.test(rec.consentUrl)) return fail('invalid_value', 'consentUrl');
  return { ok: true, value: { schemaVersion: TWIN_REFERRAL_SCHEMA_VERSION_V1, consentUrl: rec.consentUrl } };
}

// ── shadow：给 B 的转介文案草稿 ─────────────────────────────────────────────────────

export const TWIN_REFERRAL_SHADOW_LIMITS_V1 = { inquiryMax: 140, subjectsMax: 5, subjectMax: 30, regionsMax: 3 } as const;

/**
 * 输入一条脱敏询问，加后台人手填的 `inquiry_fit`，加 B 的科目与区域标签（不读名单表）。
 * 询问里不许有姓名、学校、号码、链接的模式；有就拒绝，要求先脱敏。
 */
export interface PeerShadowInputV1 {
  schemaVersion: typeof TWIN_REFERRAL_SCHEMA_VERSION_V1;
  inquiry: string;
  inquiryFit: InquiryFitV1;
  peer: { subjects: string[]; regions: IntroductionNeedRegionV1[] };
  language: TwinReferralLanguageV1;
  /** 转介人的显示名（可不填，不填写「一位同行」）。 */
  introducerName: string | null;
}

export interface PeerShadowDraftV1 {
  schemaVersion: typeof TWIN_REFERRAL_SCHEMA_VERSION_V1;
  language: TwinReferralLanguageV1;
  text: string;
  /** 草稿里没有客户的联系方式，永远是 false。 */
  containsContact: false;
  /** 草稿不发送，永远是 false。 */
  sent: false;
}

export function decodePeerShadowInputV1(value: unknown, hasPersonalData: (text: string) => boolean): TwinReferralDecodeResultV1<PeerShadowInputV1> {
  const rec = envelope(value, ['inquiry', 'inquiryFit', 'peer', 'language', 'introducerName'], ['inquiry', 'inquiryFit', 'peer', 'language']);
  if (isFailure(rec)) return rec;
  if (typeof rec.inquiry !== 'string') return fail('invalid_type', 'inquiry');
  const inquiry = rec.inquiry.replace(/\s+/g, ' ').trim();
  if (inquiry.length === 0 || CONTROL.test(inquiry) || Array.from(inquiry).length > TWIN_REFERRAL_SHADOW_LIMITS_V1.inquiryMax) return fail('invalid_value', 'inquiry');
  if (hasPersonalData(inquiry)) return fail('inquiry_not_desensitised', 'inquiry');
  if (typeof rec.inquiryFit !== 'string' || !(INQUIRY_FITS_V1 as readonly string[]).includes(rec.inquiryFit)) return fail('invalid_value', 'inquiryFit');
  if (rec.language !== 'zh-CN' && rec.language !== 'en') return fail('invalid_value', 'language');
  if (!isRecord(rec.peer)) return fail('invalid_type', 'peer');
  for (const key of Object.keys(rec.peer)) if (key !== 'subjects' && key !== 'regions') return fail('unknown_field', `peer.${key}`);
  const subjectsRaw = rec.peer.subjects ?? [];
  const regionsRaw = rec.peer.regions ?? [];
  if (!Array.isArray(subjectsRaw) || subjectsRaw.length > TWIN_REFERRAL_SHADOW_LIMITS_V1.subjectsMax) return fail('invalid_value', 'peer.subjects');
  const subjects: string[] = [];
  for (const item of subjectsRaw) {
    if (typeof item !== 'string') return fail('invalid_type', 'peer.subjects');
    const text = item.replace(/\s+/g, ' ').trim();
    if (text.length === 0 || Array.from(text).length > TWIN_REFERRAL_SHADOW_LIMITS_V1.subjectMax || CONTROL.test(text)) return fail('invalid_value', 'peer.subjects');
    if (!subjects.includes(text)) subjects.push(text);
  }
  if (!Array.isArray(regionsRaw) || regionsRaw.length > TWIN_REFERRAL_SHADOW_LIMITS_V1.regionsMax) return fail('invalid_value', 'peer.regions');
  const regions: IntroductionNeedRegionV1[] = [];
  for (const item of regionsRaw) {
    if (typeof item !== 'string' || !(INTRODUCTION_NEED_REGIONS_V1 as readonly string[]).includes(item)) return fail('invalid_value', 'peer.regions');
    if (!regions.includes(item as IntroductionNeedRegionV1)) regions.push(item as IntroductionNeedRegionV1);
  }
  let introducerName: string | null = null;
  if (rec.introducerName !== undefined && rec.introducerName !== null) {
    if (typeof rec.introducerName !== 'string') return fail('invalid_type', 'introducerName');
    const name = cleanName(rec.introducerName);
    if (name.length === 0) return fail('invalid_value', 'introducerName');
    introducerName = name;
  }
  return {
    ok: true,
    value: { schemaVersion: TWIN_REFERRAL_SCHEMA_VERSION_V1, inquiry, inquiryFit: rec.inquiryFit as InquiryFitV1, peer: { subjects, regions }, language: rec.language, introducerName },
  };
}
