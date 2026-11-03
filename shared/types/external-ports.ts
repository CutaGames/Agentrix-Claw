/**
 * 外部前提的端口合同 v0 草案（E94 ④，I-070，I-074）。**只有合同，没有实现。**
 *
 * L5 的代码先全部做完：收款付款、卖方 KYC、报税、条款版本这四样外部前提，先做成端口、接测试实现；
 * 律师、收款主体、KYC 服务商定了以后，换成真实现，调用方不改。
 * - 每个端口都有 `configured`：没接真实现时如实返回 `not_configured`，调用方据此显示"还没开通"，不装作成功。
 * - 测试实现只在非生产环境可用；生产上没配真实现就是 `not_configured`。
 * - 端口的结果是服务端内部的，三端只看到下面带 `View` 的投影（不含服务商编号、证件信息）。
 */

export const EXTERNAL_PORT_NOT_CONFIGURED_V0 = 'EXTERNAL_PORT_NOT_CONFIGURED' as const;
export const EXTERNAL_PORT_IMPLEMENTATIONS_V0 = ['not_configured', 'test', 'live'] as const;
export type ExternalPortImplementationV0 = (typeof EXTERNAL_PORT_IMPLEMENTATIONS_V0)[number];

export interface ExternalPortStatusV0 {
  port: 'payments' | 'seller_kyc' | 'tax' | 'terms';
  implementation: ExternalPortImplementationV0;
  /** 例如 `stripe_connect_hk`、`test_in_memory`；`not_configured` 时为 null。 */
  provider: string | null;
}

/** 测试实现在生产上一律当作没配：防止把假的"已收款"当成真的。 */
export function effectivePortImplementationV0(implementation: ExternalPortImplementationV0, nodeEnv: string | undefined): ExternalPortImplementationV0 {
  return implementation === 'test' && nodeEnv === 'production' ? 'not_configured' : implementation;
}

// ── 收款和付款 ───────────────────────────────────────────────────────────────────────

export const PAYMENT_PORT_OUTCOMES_V0 = ['not_configured', 'pending', 'succeeded', 'failed', 'unknown'] as const;
export type PaymentPortOutcomeV0 = (typeof PAYMENT_PORT_OUTCOMES_V0)[number];

export interface PaymentsPortCollectInputV0 {
  /** 订单托管的订单（钱只走订单托管）。 */
  orderId: string;
  amountCents: number;
  currency: 'USD' | 'HKD' | 'SGD';
  idempotencyKey: string;
}
export interface PaymentsPortPayoutInputV0 {
  orderId: string;
  /** 卖方的收款账户（端口内部的引用，不是服务商编号）。 */
  payeeRef: string;
  amountCents: number;
  currency: 'USD' | 'HKD' | 'SGD';
  idempotencyKey: string;
}
export interface PaymentsPortResultV0 {
  outcome: PaymentPortOutcomeV0;
  /** 端口内部引用，用来对账；`not_configured` 时为 null。 */
  providerRef: string | null;
  /** `failed` / `unknown` 的原因，只给运营看。 */
  reasonCode?: string;
}
/** 服务端端口（实现在 backend）。同一个幂等键再调一次，返回第一次的结果。 */
export interface PaymentsPortV0 {
  status(): ExternalPortStatusV0;
  collect(input: PaymentsPortCollectInputV0): Promise<PaymentsPortResultV0>;
  payout(input: PaymentsPortPayoutInputV0): Promise<PaymentsPortResultV0>;
  refund(input: { orderId: string; amountCents: number; idempotencyKey: string }): Promise<PaymentsPortResultV0>;
}

// ── 卖方 KYC ─────────────────────────────────────────────────────────────────────────

export const SELLER_KYC_STATES_V0 = ['not_configured', 'not_started', 'pending', 'cleared', 'rejected', 'expired'] as const;
export type SellerKycStateV0 = (typeof SELLER_KYC_STATES_V0)[number];

/** 三端看到的 KYC 状态：没有证件内容，只有状态和下一步。 */
export interface SellerKycViewV0 {
  state: SellerKycStateV0;
  /** 收款主体所在地（例如 `HK`）；卖方必须在这里才能收款（路线图 3.5）。 */
  jurisdiction: string | null;
  /** `not_started` / `expired` 时，去服务商页面的地址（只认 https）。 */
  startUrl: string | null;
  updatedAt: string | null;
}
export interface SellerKycPortV0 {
  status(): ExternalPortStatusV0;
  view(userId: string): Promise<SellerKycViewV0>;
  start(userId: string, returnUrl: string): Promise<SellerKycViewV0>;
}
/** 只有 `cleared` 能收款；其余（包括 `not_configured`）一律不能。 */
export function sellerKycAllowsPayoutV0(view: Pick<SellerKycViewV0, 'state'>): boolean {
  return view.state === 'cleared';
}

// ── 报税 ─────────────────────────────────────────────────────────────────────────────

export const TAX_PROFILE_STATES_V0 = ['not_configured', 'missing', 'submitted', 'verified', 'blocked'] as const;
export type TaxProfileStateV0 = (typeof TAX_PROFILE_STATES_V0)[number];
export interface TaxProfileViewV0 {
  state: TaxProfileStateV0;
  /** 需要卖方补的表（例如 `w8ben`），只给名字。 */
  formsNeeded: string[];
  updatedAt: string | null;
}
export interface TaxPortV0 {
  status(): ExternalPortStatusV0;
  view(userId: string): Promise<TaxProfileViewV0>;
  /** 一个周期的收入汇总（给卖方下载、给服务商报送）；`not_configured` 时为 null。 */
  periodSummary(userId: string, period: string): Promise<{ period: string; grossCents: number; feesCents: number } | null>;
}
export function taxProfileAllowsPayoutV0(view: Pick<TaxProfileViewV0, 'state'>): boolean {
  return view.state === 'verified';
}

// ── 条款版本和年龄确认 ────────────────────────────────────────────────────────────────

export const TERMS_DOCUMENTS_V0 = ['terms', 'privacy', 'seller_agreement', 'escrow_rules', 'device_rental_terms'] as const;
export type TermsDocumentV0 = (typeof TERMS_DOCUMENTS_V0)[number];
/** 年龄确认：年满 18 岁，或者当地法定成年年龄（`gtm/legal-L5-drafts.md` 1.2）。 */
export const AGE_CONFIRMATIONS_V0 = ['adult_18', 'local_age_of_majority'] as const;
export type AgeConfirmationV0 = (typeof AGE_CONFIRMATIONS_V0)[number];

export interface TermsVersionV0 {
  document: TermsDocumentV0;
  /** 例如 `2026-11-01`。 */
  version: string;
  effectiveAt: string;
  /** 正文地址（站内路径）。 */
  path: string;
}
export interface TermsAcceptanceV0 {
  document: TermsDocumentV0;
  version: string;
  acceptedAt: string;
  age: { confirmation: AgeConfirmationV0; confirmedAt: string } | null;
}
/** 三端看到的：每份文件现在的版本、本人接受过哪一版、还要不要重新接受。 */
export interface TermsStatusViewV0 {
  current: TermsVersionV0[];
  accepted: TermsAcceptanceV0[];
  /** 现在版本还没接受的文件。 */
  pending: TermsDocumentV0[];
  /** 还没做年龄确认。 */
  ageConfirmationMissing: boolean;
}
export interface TermsAcceptCommandV0 {
  document: TermsDocumentV0;
  /** 必须等于现在的版本（防止接受的是旧页面）。 */
  version: string;
  /** 第一次接受任何文件时必填；之后可省。 */
  age?: AgeConfirmationV0;
}
export interface TermsPortV0 {
  status(): ExternalPortStatusV0;
  current(): Promise<TermsVersionV0[]>;
  view(userId: string): Promise<TermsStatusViewV0>;
  accept(userId: string, command: TermsAcceptCommandV0): Promise<TermsStatusViewV0>;
}

const DOC_VERSION = /^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]{1,3})?$/;

/** 服务端和三端共用：接受条款的请求体。不认识的文件、版本格式不对、年龄确认不认识都返回 null。 */
export function decodeTermsAcceptCommandV0(value: unknown): TermsAcceptCommandV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.document !== 'string' || !(TERMS_DOCUMENTS_V0 as readonly string[]).includes(record.document)) return null;
  if (typeof record.version !== 'string' || !DOC_VERSION.test(record.version)) return null;
  if (record.age !== undefined && (typeof record.age !== 'string' || !(AGE_CONFIRMATIONS_V0 as readonly string[]).includes(record.age))) return null;
  return {
    document: record.document as TermsDocumentV0,
    version: record.version,
    ...(record.age !== undefined ? { age: record.age as AgeConfirmationV0 } : {}),
  };
}

/** 现在版本里，本人还没接受的文件（按 `TERMS_DOCUMENTS_V0` 的顺序）。 */
export function pendingTermsDocumentsV0(current: readonly TermsVersionV0[], accepted: readonly TermsAcceptanceV0[]): TermsDocumentV0[] {
  return TERMS_DOCUMENTS_V0.filter((document) => {
    const now = current.find((item) => item.document === document);
    return !!now && !accepted.some((item) => item.document === document && item.version === now.version);
  });
}

/**
 * 卖方能不能收钱：四样都要过。任何一个端口没配（`not_configured`），结果都是不能，原因写明是哪一样。
 */
export function sellerPayoutReadinessV0(input: {
  payments: ExternalPortStatusV0;
  kyc: Pick<SellerKycViewV0, 'state'>;
  tax: Pick<TaxProfileViewV0, 'state'>;
  terms: Pick<TermsStatusViewV0, 'pending' | 'ageConfirmationMissing'>;
}): { ready: boolean; blockers: Array<'payments_not_configured' | 'kyc' | 'tax' | 'terms' | 'age'> } {
  const blockers: Array<'payments_not_configured' | 'kyc' | 'tax' | 'terms' | 'age'> = [];
  if (input.payments.implementation === 'not_configured') blockers.push('payments_not_configured');
  if (!sellerKycAllowsPayoutV0(input.kyc)) blockers.push('kyc');
  if (!taxProfileAllowsPayoutV0(input.tax)) blockers.push('tax');
  if (input.terms.pending.includes('seller_agreement') || input.terms.pending.includes('terms')) blockers.push('terms');
  if (input.terms.ageConfirmationMissing) blockers.push('age');
  return { ready: blockers.length === 0, blockers };
}

// ── v0.1（10-03，L5 C1）：路由、三端解码、开通前的条款门槛（加法） ─────────────────────────

/** 服务端实现 `external-ports/*`，`EXTERNAL_PORTS_V0_ENABLED` 默认关（关着时一律 404）。 */
export const EXTERNAL_PORT_ROUTES_V0 = {
  termsStatus: 'GET /api/terms/status',
  termsAccept: 'POST /api/terms/accept',
  sellerReadiness: 'GET /api/seller/readiness',
  kycStart: 'POST /api/seller/kyc/start',
} as const;

export type SellerPayoutBlockerV0 = 'payments_not_configured' | 'kyc' | 'tax' | 'terms' | 'age';

/** `GET /api/seller/readiness`：卖方能不能收钱，以及每个端口现在的投影。 */
export interface SellerReadinessViewV0 {
  ready: boolean;
  blockers: SellerPayoutBlockerV0[];
  payments: ExternalPortStatusV0;
  kyc: SellerKycViewV0;
  tax: TaxProfileViewV0;
}

/** 开通这几样之前要接受的文件（web 3、mobile 4）；年龄确认三样都要。 */
export const TERMS_REQUIRED_FOR_V0: Readonly<Record<'public_twin' | 'payouts' | 'device_rental', readonly TermsDocumentV0[]>> = {
  public_twin: ['terms', 'privacy'],
  payouts: ['terms', 'privacy', 'seller_agreement', 'escrow_rules'],
  device_rental: ['terms', 'privacy', 'device_rental_terms'],
};

/** 现在能不能开通：要接受的文件里还差哪些、年龄确认还缺不缺。文件没有现行版本（没发布）时不挡。 */
export function termsGateV0(view: Pick<TermsStatusViewV0, 'pending' | 'ageConfirmationMissing'>, action: keyof typeof TERMS_REQUIRED_FOR_V0): { ok: boolean; pending: TermsDocumentV0[]; ageMissing: boolean } {
  const pending = TERMS_REQUIRED_FOR_V0[action].filter((document) => view.pending.includes(document));
  return { ok: pending.length === 0 && !view.ageConfirmationMissing, pending, ageMissing: view.ageConfirmationMissing };
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function isTermsDocument(value: unknown): value is TermsDocumentV0 {
  return typeof value === 'string' && (TERMS_DOCUMENTS_V0 as readonly string[]).includes(value);
}

/** 三端用：解码条款状态。任何一项不对整份不收（返回 null，界面按"读不到"处理，不放行）。 */
export function decodeTermsStatusViewV0(value: unknown): TermsStatusViewV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.current) || !Array.isArray(record.accepted) || !Array.isArray(record.pending)) return null;
  if (typeof record.ageConfirmationMissing !== 'boolean') return null;
  const current: TermsVersionV0[] = [];
  for (const item of record.current) {
    if (!item || typeof item !== 'object') return null;
    const v = item as Record<string, unknown>;
    if (!isTermsDocument(v.document) || typeof v.version !== 'string' || !DOC_VERSION.test(v.version)) return null;
    if (typeof v.effectiveAt !== 'string' || !ISO_UTC.test(v.effectiveAt) || typeof v.path !== 'string' || !v.path.startsWith('/')) return null;
    current.push({ document: v.document, version: v.version, effectiveAt: v.effectiveAt, path: v.path });
  }
  const accepted: TermsAcceptanceV0[] = [];
  for (const item of record.accepted) {
    if (!item || typeof item !== 'object') return null;
    const v = item as Record<string, unknown>;
    if (!isTermsDocument(v.document) || typeof v.version !== 'string' || !DOC_VERSION.test(v.version)) return null;
    if (typeof v.acceptedAt !== 'string' || !ISO_UTC.test(v.acceptedAt)) return null;
    let age: TermsAcceptanceV0['age'] = null;
    if (v.age !== null) {
      const a = v.age as Record<string, unknown> | undefined;
      if (!a || typeof a !== 'object' || typeof a.confirmation !== 'string' || !(AGE_CONFIRMATIONS_V0 as readonly string[]).includes(a.confirmation)) return null;
      if (typeof a.confirmedAt !== 'string' || !ISO_UTC.test(a.confirmedAt)) return null;
      age = { confirmation: a.confirmation as AgeConfirmationV0, confirmedAt: a.confirmedAt };
    }
    accepted.push({ document: v.document, version: v.version, acceptedAt: v.acceptedAt, age });
  }
  const pending: TermsDocumentV0[] = [];
  for (const document of record.pending) {
    if (!isTermsDocument(document)) return null;
    pending.push(document);
  }
  return { current, accepted, pending, ageConfirmationMissing: record.ageConfirmationMissing };
}
