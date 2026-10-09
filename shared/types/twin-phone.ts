/**
 * Twin phone number and calls, v0 contract only (L6-4). No runtime reads this yet: the number region, the provider
 * (Vapi is the current integration) and the lawyer's view on recording and disclosure are still open.
 *
 * Rules the runtime must keep: every call opens with the AI disclosure; a call that would commit the owner (an amount,
 * a time or a place) needs the owner's approval card first; recording only after the other side consents.
 */

/** Future server switch; nothing reads it in v0. */
export const TWIN_PHONE_V0_FLAG = 'TWIN_PHONE_V0_ENABLED';

export const TWIN_PHONE_CALL_PURPOSES_V0 = ['booking', 'inquiry', 'follow_up'] as const;
export type TwinPhoneCallPurposeV0 = (typeof TWIN_PHONE_CALL_PURPOSES_V0)[number];

export const TWIN_PHONE_RECORDING_CONSENT_V0 = ['not_asked', 'granted', 'declined'] as const;
export type TwinPhoneRecordingConsentV0 = (typeof TWIN_PHONE_RECORDING_CONSENT_V0)[number];

/** The first sentence of every call; `{owner}` is replaced with the owner's display name. */
export const TWIN_PHONE_DISCLOSURE_V0 = {
  en: "Hello, this is {owner}'s AI assistant calling on their behalf.",
  zh: '您好，我是{owner}的 AI 助理，代表{owner}来电。',
} as const;

export interface TwinPhoneCommitmentV0 {
  amountMinor?: number;
  currency?: string;
  at?: string;
  place?: string;
}

export interface TwinPhoneCallRequestV0 {
  purpose: TwinPhoneCallPurposeV0;
  /** E.164, for example +6591234567. */
  to: string;
  /** What the call should achieve, in the owner's words. */
  brief: string;
  commitment?: TwinPhoneCommitmentV0;
}

const E164 = /^\+[1-9][0-9]{7,14}$/;

export function twinPhoneDisclosureV0(ownerName: string, language: 'en' | 'zh'): string {
  const name = ownerName.trim().slice(0, 60) || (language === 'zh' ? '主人' : 'the owner');
  return TWIN_PHONE_DISCLOSURE_V0[language].split('{owner}').join(name);
}

export function twinPhoneCallNeedsApprovalV0(request: TwinPhoneCallRequestV0): boolean {
  const c = request.commitment;
  return !!c && (c.amountMinor !== undefined || c.at !== undefined || c.place !== undefined);
}

export function twinPhoneMayRecordV0(consent: TwinPhoneRecordingConsentV0): boolean {
  return consent === 'granted';
}

export function decodeTwinPhoneCallRequestV0(value: unknown): TwinPhoneCallRequestV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const purpose = raw.purpose;
  const to = raw.to;
  const brief = raw.brief;
  if (typeof purpose !== 'string' || !(TWIN_PHONE_CALL_PURPOSES_V0 as readonly string[]).includes(purpose)) return null;
  if (typeof to !== 'string' || !E164.test(to)) return null;
  if (typeof brief !== 'string' || !brief.trim() || brief.length > 1000) return null;
  const out: TwinPhoneCallRequestV0 = { purpose: purpose as TwinPhoneCallPurposeV0, to, brief: brief.trim() };
  const commitment = raw.commitment;
  if (commitment === undefined) return out;
  if (!commitment || typeof commitment !== 'object' || Array.isArray(commitment)) return null;
  const c = commitment as Record<string, unknown>;
  const kept: TwinPhoneCommitmentV0 = {};
  const amount = c.amountMinor;
  const currency = c.currency;
  const at = c.at;
  const place = c.place;
  if (amount !== undefined) {
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || amount > 10_000_000) return null;
    if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return null;
    kept.amountMinor = amount;
    kept.currency = currency;
  }
  if (at !== undefined) {
    if (typeof at !== 'string' || at.length > 40 || Number.isNaN(Date.parse(at))) return null;
    kept.at = new Date(at).toISOString();
  }
  if (place !== undefined) {
    if (typeof place !== 'string' || !place.trim() || place.length > 200) return null;
    kept.place = place.trim();
  }
  return { ...out, commitment: kept };
}
