export const SOUL_CORE_FOUNDING_ACCESS_CONSENT_VERSION = '2026-07-v1' as const;

export type SoulCoreHardwareInterest =
  | 'founder_card'
  | 'duo_recovery'
  | 'developer_kit'
  | 'trust_sdk'
  | 'unsure';

export type SoulCoreInterestPersona =
  | 'agent_operator'
  | 'developer'
  | 'team'
  | 'creator'
  | 'companion_user'
  | 'other';

export interface SoulCoreFoundingAccessInput {
  email: string;
  countryCode?: string;
  locale?: 'zh' | 'en';
  persona: SoulCoreInterestPersona;
  interest: SoulCoreHardwareInterest;
  useCase?: string;
  consent: true;
  consentVersion: typeof SOUL_CORE_FOUNDING_ACCESS_CONSENT_VERSION;
  anonId?: string;
  channel?: string;
  attribution?: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    attributionRef?: string;
    firstTouchAt?: string;
    lastTouchAt?: string;
  };
  /** Honeypot. Human users must leave this empty. */
  companyWebsite?: string;
}

export interface SoulCoreFoundingAccessResult {
  ok: true;
  interestId: string;
  status: 'interested';
  duplicate: boolean;
  message: string;
}
