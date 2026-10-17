/**
 * D2 on the phone: the payment approval card (contract `shared/types/spend-budget.ts` v0, E99; L5 backlog mobile 2).
 * Off unless the build sets `EXPO_PUBLIC_SPEND_APPROVAL_CARD=1`; the server routes are not live yet.
 *
 * - Where it shows: 事项 → 待我处理 when an `approval_required` push carries an `spa_…` ref, and under the
 *   assistant bubble when the chat stream sends an `approval_required` event with `approvalRef`.
 * - Read: `GET /spend-approvals/:ref`, decoded with `decodeSpendApprovalViewV0` (a pending one past its expiry
 *   reads as expired). The card always shows what the server answered, never an optimistic state.
 * - Buttons follow `spendApprovalActionsV0`: approve only while pending; reject while pending or expired.
 * - Approve / reject: `POST …/approve` | `…/reject` with the user's own token.
 *   - A 403 asking for a recent sign-in opens StepUpSheet, then retries once; asked again → stop
 *     (same rule as the web card). Both the standard `STEP_UP_REQUIRED` + `recent_sign_in_required` and the
 *     draft's `SPEND_APPROVAL_STEP_UP_REQUIRED` count until v0.1 settles it (REQ-backend-096.re-mobile 1).
 *   - 403 `SPEND_APPROVAL_SIGN_IN_REQUIRED` (not the owner's own credential) never opens the sheet.
 *   - 409 expired / args changed / budget exceeded: the card locks and reads the record again.
 * - Money: the amount is the server's `amountCents` (USD); the phone never converts or computes a price (D19).
 * No React Native import: the transport, token and clock are injected.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import { parseApiErrorBodyV1 } from '../../shared/types/api-error';
import {
  SPEND_APPROVAL_ERROR_CODES_V0,
  SPEND_APPROVAL_REF_PATTERN_V0,
  decodeSpendApprovalEventV0,
  decodeSpendApprovalViewV0,
  spendApprovalActionsV0,
  type SpendApprovalEventV0,
  type SpendApprovalStatusV0,
  type SpendApprovalSummaryV0,
  type SpendApprovalViewV0,
} from '../../shared/types/spend-budget';
import { needsStepUp } from './stepUp';
import { plainDisplayLine } from './plainDisplayText';

type Copy = { zh: string; en: string };
type Lang = 'zh' | 'en';

/** Off by default; the card only appears when the build value is exactly `1`. */
export function spendApprovalCardEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const SPEND_APPROVAL_CARD_ENABLED = spendApprovalCardEnabled(process.env.EXPO_PUBLIC_SPEND_APPROVAL_CARD);

export function isSpendApprovalRef(value: unknown): value is string {
  return typeof value === 'string' && SPEND_APPROVAL_REF_PATTERN_V0.test(value);
}

/** A chat stream event that is a payment approval; ordinary tool approvals and broken events give null. */
export function spendApprovalFromStreamEvent(event: unknown): SpendApprovalEventV0 | null {
  const decoded = decodeSpendApprovalEventV0(event);
  return decoded && decoded.kind === 'spend' ? decoded.event : null;
}

// ── Client ─────────────────────────────────────────────────────────────────────────────

export type SpendApprovalFailureV0 =
  | 'step_up_required'
  | 'sign_in_required'
  | 'not_found'
  | 'expired'
  | 'args_changed'
  | 'budget_exceeded'
  | 'rate_limited'
  | 'unreadable'
  | 'unavailable'
  | 'no_session';

export class SpendApprovalError extends Error {
  readonly failure: SpendApprovalFailureV0;
  /** A record the server sent with the error (`current`), when it decodes. */
  readonly current: SpendApprovalViewV0 | null;
  constructor(failure: SpendApprovalFailureV0, current: SpendApprovalViewV0 | null = null) {
    super(failure);
    this.name = 'SpendApprovalError';
    this.failure = failure;
    this.current = current;
  }
}

function payloadOf(response: HttpResponseV1): unknown {
  const body = response.body as Record<string, unknown> | undefined;
  return body && typeof body === 'object' && body.data && typeof body.data === 'object' && !('approvalRef' in body) ? body.data : body;
}

function failureOf(status: number, body: unknown): SpendApprovalFailureV0 {
  if (needsStepUp(status, body)) return 'step_up_required';
  const { code } = parseApiErrorBodyV1(body);
  if (status === 403 && code === SPEND_APPROVAL_ERROR_CODES_V0.stepUpRequired) return 'step_up_required';
  if (status === 403 && code === SPEND_APPROVAL_ERROR_CODES_V0.signInRequired) return 'sign_in_required';
  if (status === 404) return 'not_found';
  if (status === 409 && code === SPEND_APPROVAL_ERROR_CODES_V0.expired) return 'expired';
  if (status === 409 && code === SPEND_APPROVAL_ERROR_CODES_V0.argsChanged) return 'args_changed';
  if (status === 409 && code === SPEND_APPROVAL_ERROR_CODES_V0.budgetExceeded) return 'budget_exceeded';
  if (status === 429) return 'rate_limited';
  // Any other 401 / 403 is not this card's to fix; it is never read as "approved".
  return 'unavailable';
}

export type SpendApprovalDecisionV0 = 'approve' | 'reject';

export interface MobileSpendApprovalClientV0 {
  read(approvalRef: string): Promise<SpendApprovalViewV0>;
  /** The record after the decision, or null when the answer carried none (the caller reads it again). */
  decide(approvalRef: string, decision: SpendApprovalDecisionV0): Promise<SpendApprovalViewV0 | null>;
}

export function createMobileSpendApprovalClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
  now?: () => number;
}): MobileSpendApprovalClientV0 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const now = deps.now ?? (() => Date.now());
  const call = async (method: 'GET' | 'POST', approvalRef: string, suffix: '' | '/approve' | '/reject'): Promise<unknown> => {
    // Checked before sending: the ref goes into the path.
    if (!isSpendApprovalRef(approvalRef)) throw new SpendApprovalError('not_found');
    const token = deps.token();
    if (!token) throw new SpendApprovalError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}/spend-approvals/${approvalRef}${suffix}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(method === 'POST' ? { body: {} } : {}),
      });
    } catch {
      throw new SpendApprovalError('unavailable');
    }
    if (response.status < 200 || response.status >= 300) {
      const body = payloadOf(response);
      const parsed = parseApiErrorBodyV1(body);
      const current = parsed.current ? decodeSpendApprovalViewV0(parsed.current, now()) : null;
      throw new SpendApprovalError(failureOf(response.status, body), current && current.approvalRef === approvalRef ? current : null);
    }
    return payloadOf(response);
  };
  return {
    async read(approvalRef) {
      const view = decodeSpendApprovalViewV0(await call('GET', approvalRef, ''), now());
      if (!view || view.approvalRef !== approvalRef) throw new SpendApprovalError('unreadable');
      return view;
    },
    async decide(approvalRef, decision) {
      const answer = await call('POST', approvalRef, decision === 'approve' ? '/approve' : '/reject');
      const view = decodeSpendApprovalViewV0(answer, now());
      return view && view.approvalRef === approvalRef ? view : null;
    },
  };
}

// ── One decision, with at most one step-up ──────────────────────────────────────────────

export type SpendApprovalOutcomeV0 =
  | { kind: 'done'; view: SpendApprovalViewV0 }
  /** The record could not be changed; `view` is the record as read afterwards when that worked. */
  | { kind: 'failed'; failure: SpendApprovalFailureV0 | 'step_up_cancelled' | 'step_up_again'; view: SpendApprovalViewV0 | null };

const REREAD_AFTER: ReadonlySet<SpendApprovalFailureV0> = new Set(['expired', 'args_changed', 'budget_exceeded']);

/**
 * Approve or reject once. A step-up request opens `confirmStepUp` (StepUpSheet); after it confirms, the call is
 * retried once; a second step-up request stops there. A 409 locks the card: the record is read again.
 */
export async function runSpendApprovalDecision(input: {
  client: MobileSpendApprovalClientV0;
  approvalRef: string;
  decision: SpendApprovalDecisionV0;
  confirmStepUp: () => Promise<boolean>;
}): Promise<SpendApprovalOutcomeV0> {
  const { client, approvalRef, decision } = input;
  const reread = async (): Promise<SpendApprovalViewV0 | null> => {
    try {
      return await client.read(approvalRef);
    } catch {
      return null;
    }
  };
  const settle = async (answer: SpendApprovalViewV0 | null): Promise<SpendApprovalOutcomeV0> => {
    const view = answer ?? (await reread());
    return view ? { kind: 'done', view } : { kind: 'failed', failure: 'unreadable', view: null };
  };
  const fail = async (error: unknown): Promise<SpendApprovalOutcomeV0> => {
    const failure: SpendApprovalFailureV0 = error instanceof SpendApprovalError ? error.failure : 'unavailable';
    const sent = error instanceof SpendApprovalError ? error.current : null;
    return { kind: 'failed', failure, view: sent ?? (REREAD_AFTER.has(failure) ? await reread() : null) };
  };
  try {
    return await settle(await client.decide(approvalRef, decision));
  } catch (error) {
    if (!(error instanceof SpendApprovalError) || error.failure !== 'step_up_required') return fail(error);
  }
  let confirmed = false;
  try {
    confirmed = await input.confirmStepUp();
  } catch {
    confirmed = false;
  }
  if (!confirmed) return { kind: 'failed', failure: 'step_up_cancelled', view: null };
  try {
    return await settle(await client.decide(approvalRef, decision));
  } catch (error) {
    if (error instanceof SpendApprovalError && error.failure === 'step_up_required') return { kind: 'failed', failure: 'step_up_again', view: null };
    return fail(error);
  }
}

// ── What the card shows ─────────────────────────────────────────────────────────────────

/** Approve / reject buttons; a pending record past its expiry counts as expired even before a re-read. */
export function spendApprovalButtons(view: Pick<SpendApprovalViewV0, 'status' | 'expiresAt'>, nowMs: number): { approve: boolean; reject: boolean } {
  return spendApprovalActionsV0({ status: effectiveSpendApprovalStatus(view, nowMs) });
}

export function effectiveSpendApprovalStatus(view: Pick<SpendApprovalViewV0, 'status' | 'expiresAt'>, nowMs: number): SpendApprovalStatusV0 {
  return view.status === 'pending' && !(Date.parse(view.expiresAt) > nowMs) ? 'expired' : view.status;
}

/** Whole minutes left, rounded up; 0 once expired (same as the web card). */
export function spendApprovalMinutesLeft(expiresAt: string, nowMs: number): number {
  const ms = Date.parse(expiresAt) - nowMs;
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / 60_000);
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** `12.34 美元` / `$12.34`, like the web card. Positive integer cents only; anything else is not shown. */
export function formatSpendUsdCents(cents: number, lang: Lang): string | null {
  if (!Number.isInteger(cents) || cents <= 0) return null;
  const value = `${groupThousands(String(Math.floor(cents / 100)))}.${String(cents % 100).padStart(2, '0')}`;
  return lang === 'zh' ? `${value} 美元` : `$${value}`;
}

// ISO 4217 minor units that are not 2; stablecoins and unknown codes use 2 (USD-style cents), like the web card.
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

/** `HKD 96.00` for a non-USD original amount; null for USD or anything malformed. */
export function formatSpendOriginal(original: SpendApprovalSummaryV0['original']): string | null {
  if (!original || original.currency === 'USD') return null;
  if (!Number.isInteger(original.amountMinor) || original.amountMinor <= 0) return null;
  if (!/^[A-Z][A-Z0-9]{2,9}$/.test(original.currency)) return null;
  const digits = ZERO_DECIMAL.has(original.currency) ? 0 : THREE_DECIMAL.has(original.currency) ? 3 : 2;
  const raw = String(original.amountMinor).padStart(digits + 1, '0');
  const whole = groupThousands(raw.slice(0, raw.length - digits));
  return `${original.currency} ${digits > 0 ? `${whole}.${raw.slice(raw.length - digits)}` : whole}`;
}

/** The payee name as shown on the card: plain text, no control or direction characters, at most 80 characters. */
export function spendPayeeDisplay(label: string, lang: Lang): string {
  return plainDisplayLine(label, 80, lang === 'zh' ? '（收款方没有名字）' : '(payee has no name)');
}

/** Same words as the web card (`frontend/lib/spend-approval/card-model.ts`). */
const PATH_COPY: Readonly<Record<string, Copy>> = {
  x402: { zh: '按次付费的接口', en: 'Pay-per-use API' },
  ucp_mandate: { zh: '授权购买', en: 'Authorized purchase' },
  quickpay: { zh: '快捷付款', en: 'Quick pay' },
  wallet_transfer: { zh: '钱包转账', en: 'Wallet transfer' },
  skill_purchase: { zh: '购买技能', en: 'Skill purchase' },
  commerce_purchase: { zh: '购买商品', en: 'Purchase' },
  hire_escrow: { zh: '雇佣托管', en: 'Hiring (held in escrow)' },
  lsm: { zh: '预测市场', en: 'Prediction market' },
  platform_credit: { zh: '平台额度', en: 'Platform credit' },
  device_rental: { zh: '租用设备能力', en: 'Renting device capability' },
};

export function spendPathLabel(path: string): Copy {
  return PATH_COPY[path] ?? { zh: '付款', en: 'Payment' };
}
