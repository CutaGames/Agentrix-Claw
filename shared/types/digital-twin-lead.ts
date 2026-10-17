/**
 * Digital Twin — consented Lead and human handoff (design §6.9; Task 13; Seed Trial §0.1.4).
 *
 * When the public twin cannot or must not answer, a Visitor may leave a way to
 * be contacted. The Visitor's affirmative consent (the exact copy shown, the
 * version, the moment) is part of the record; purpose is fixed to "the Creator
 * contacts you back"; the record binds to one Creator/Agent/Visitor session and
 * never touches the Self Model. Retention is 90 days (expired leads are rewritten
 * to `deleted` in storage on owner access); the Creator can delete a lead at any
 * time, which blanks the contact value, and can export their own leads as JSON or
 * CSV. No payment, no deposit. Stored as an `interim_seed_lead` product record
 * (Lead owner port unpublished).
 */
import {
  DIGITAL_TWIN_DECODE_HELPERS_V1,
  DIGITAL_TWIN_SCHEMA_VERSION,
  type DigitalTwinDecodeResultV1,
  type DigitalTwinRefV1,
} from './digital-twin';

const { isRecord, isNonEmptyString, isMember, isIsoTimestamp, unknownKeys, fail } = DIGITAL_TWIN_DECODE_HELPERS_V1;

export const DIGITAL_TWIN_LEAD_CHANNELS_V1 = ['email', 'phone', 'wechat', 'other'] as const;
export type DigitalTwinLeadChannelV1 = (typeof DIGITAL_TWIN_LEAD_CHANNELS_V1)[number];

export const DIGITAL_TWIN_LEAD_STATES_V1 = ['new', 'accepted', 'rejected', 'contacted', 'converted', 'deleted'] as const;
export type DigitalTwinLeadRecordStateV1 = (typeof DIGITAL_TWIN_LEAD_STATES_V1)[number];

export const DIGITAL_TWIN_LEAD_ACTIONS_V1 = ['accept', 'reject', 'contacted', 'converted', 'delete'] as const;
export type DigitalTwinLeadActionV1 = (typeof DIGITAL_TWIN_LEAD_ACTIONS_V1)[number];

export const DIGITAL_TWIN_LEAD_RETENTION_DAYS_V1 = 90 as const;
export const DIGITAL_TWIN_LEAD_CONTACT_MAX_CHARS = 120;
export const DIGITAL_TWIN_LEAD_MESSAGE_MAX_CHARS = 500;
export const DIGITAL_TWIN_LEAD_DELETED_CONTACT = '[deleted]' as const;

export const DIGITAL_TWIN_LEAD_EXPORT_FORMATS_V1 = ['json', 'csv'] as const;
export type DigitalTwinLeadExportFormatV1 = (typeof DIGITAL_TWIN_LEAD_EXPORT_FORMATS_V1)[number];

/** The consent copy the Visitor affirms; versioned so the record can prove which text was accepted. */
export const DIGITAL_TWIN_LEAD_CONSENT_COPY_V1 = {
  version: 1,
  'zh-CN': '我同意把这条联系方式交给这位创作者本人，仅用于回复我这次的问题；90 天后自动删除，我也可以随时请求删除。这不是付款或预约。',
  en: 'I agree to share this contact with the creator themselves, only so they can reply to this question; it is deleted after 90 days and I can ask for deletion any time. This is not a payment or a booking.',
} as const;

export interface DigitalTwinLeadRecordV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  record: 'interim_seed_lead';
  notAGrant: true;
  leadRef: DigitalTwinRefV1;
  profileRef: DigitalTwinRefV1;
  agentRef: DigitalTwinRefV1;
  visitorSessionRef: DigitalTwinRefV1;
  contact: { channel: DigitalTwinLeadChannelV1; value: string };
  message?: string;
  /** The question/decision that led here, when the Visitor came from a no_answer. */
  sourceDecisionRef?: DigitalTwinRefV1;
  purpose: 'contact_back';
  consent: { copyVersion: number; language: 'zh-CN' | 'en'; acceptedAt: string };
  retention: { expiresAt: string };
  state: DigitalTwinLeadRecordStateV1;
  createdAt: string;
  updatedAt: string;
}

/** The interim container stored on `DigitalTwinInterimStateV1.leads`. */
export interface DigitalTwinLeadStateV1 {
  leads: DigitalTwinLeadRecordV1[];
  updatedAt: string;
}

export interface DigitalTwinLeadSubmitCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  visitorSessionId: string;
  contact: { channel: DigitalTwinLeadChannelV1; value: string };
  message?: string;
  sourceDecisionRef?: DigitalTwinRefV1;
  /** Must be `true`; the Visitor ticked the consent copy of `consentCopyVersion`. */
  consentAccepted: true;
  consentCopyVersion: number;
  language?: 'zh-CN' | 'en';
}

export interface DigitalTwinLeadDecisionCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  action: DigitalTwinLeadActionV1;
}

/** Owner-facing lead as listed; identical to the record (the owner is the recipient). */
export interface DigitalTwinLeadListV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  leads: DigitalTwinLeadRecordV1[];
  generatedAt: string;
}

/** Visitor receipt: no contact echo, just the ref and retention promise. */
export interface DigitalTwinLeadReceiptV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  leadRef: DigitalTwinRefV1;
  state: 'new';
  retentionExpiresAt: string;
  consentCopyVersion: number;
  createdAt: string;
}

/** Query-string command for the owner export: `format` only. */
export interface DigitalTwinLeadExportCommandV1 {
  format: DigitalTwinLeadExportFormatV1;
}

/**
 * Owner export of the Creator's own leads. `body` is the rendered document
 * (JSON = the list shape; CSV = RFC 4180, every cell quoted, formula-leading
 * cells neutralised). Deleted and expired leads carry `[deleted]` and no message.
 */
export interface DigitalTwinLeadExportV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  format: DigitalTwinLeadExportFormatV1;
  contentType: string;
  filename: string;
  body: string;
  count: number;
  generatedAt: string;
}

function contactLooksValid(channel: DigitalTwinLeadChannelV1, value: string): boolean {
  if (value.length > DIGITAL_TWIN_LEAD_CONTACT_MAX_CHARS || value.length < 3) return false;
  if (channel === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (channel === 'phone') return /^\+?[0-9][0-9 -]{5,}$/.test(value);
  return !/[\r\n]/.test(value);
}

export function decodeDigitalTwinLeadSubmitCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinLeadSubmitCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['root']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', ['schemaVersion']);
  if (!isNonEmptyString(input.visitorSessionId) || !/^[0-9A-Za-z_-]{8,64}$/.test(input.visitorSessionId)) return fail('invalid_shape', ['visitorSessionId']);
  if (!isRecord(input.contact) || !isMember(DIGITAL_TWIN_LEAD_CHANNELS_V1, input.contact.channel) || !isNonEmptyString(input.contact.value)) {
    return fail('invalid_shape', ['contact']);
  }
  const value = input.contact.value.trim();
  if (!contactLooksValid(input.contact.channel, value)) return fail('invalid_shape', ['contact.value']);
  if (input.consentAccepted !== true) return fail('invalid_shape', ['consentAccepted must be true']);
  if (input.consentCopyVersion !== DIGITAL_TWIN_LEAD_CONSENT_COPY_V1.version) return fail('invalid_shape', ['consentCopyVersion']);
  let message: string | undefined;
  if (input.message !== undefined) {
    if (typeof input.message !== 'string' || input.message.length > DIGITAL_TWIN_LEAD_MESSAGE_MAX_CHARS) return fail('invalid_shape', ['message']);
    message = input.message.trim() || undefined;
  }
  let sourceDecisionRef: DigitalTwinRefV1 | undefined;
  if (input.sourceDecisionRef !== undefined) {
    const ref = input.sourceDecisionRef;
    if (!isRecord(ref) || ref.kind !== 'answer_decision' || !isNonEmptyString(ref.id)) return fail('invalid_ref', ['sourceDecisionRef']);
    sourceDecisionRef = { kind: 'answer_decision', id: ref.id };
  }
  let language: 'zh-CN' | 'en' | undefined;
  if (input.language !== undefined) {
    if (input.language !== 'zh-CN' && input.language !== 'en') return fail('invalid_enum', ['language']);
    language = input.language;
  }
  return {
    ok: true,
    value: {
      schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
      visitorSessionId: input.visitorSessionId,
      contact: { channel: input.contact.channel, value },
      ...(message ? { message } : {}),
      ...(sourceDecisionRef ? { sourceDecisionRef } : {}),
      consentAccepted: true,
      consentCopyVersion: DIGITAL_TWIN_LEAD_CONSENT_COPY_V1.version,
      ...(language ? { language } : {}),
    },
  };
}

export function decodeDigitalTwinLeadDecisionCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinLeadDecisionCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['root']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', ['schemaVersion']);
  if (!isMember(DIGITAL_TWIN_LEAD_ACTIONS_V1, input.action)) return fail('invalid_enum', ['action']);
  return { ok: true, value: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, action: input.action } };
}

/** `format` absent → json; anything outside the enum → invalid_enum; nothing extra. */
export function decodeDigitalTwinLeadExportCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinLeadExportCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['root']);
  const extra = unknownKeys(input, ['format']);
  if (extra.length > 0) return fail('unknown_field', extra);
  if (input.format === undefined) return { ok: true, value: { format: 'json' } };
  if (!isMember(DIGITAL_TWIN_LEAD_EXPORT_FORMATS_V1, input.format)) return fail('invalid_enum', ['format']);
  return { ok: true, value: { format: input.format } };
}

export function decodeDigitalTwinLeadReceiptV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinLeadReceiptV1> {
  if (!isRecord(input) || input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('invalid_shape', ['receipt']);
  if (!isRecord(input.leadRef) || !isNonEmptyString(input.leadRef.id) || input.state !== 'new') return fail('invalid_shape', ['leadRef/state']);
  if (!isIsoTimestamp(input.retentionExpiresAt) || !isIsoTimestamp(input.createdAt)) return fail('invalid_timestamp', ['timestamps']);
  // A Visitor receipt must never echo the contact back.
  if ('contact' in input) return fail('unknown_field', ['contact']);
  return { ok: true, value: input as unknown as DigitalTwinLeadReceiptV1 };
}

/** Allowed state transitions for the Creator's lead actions. */
export function nextDigitalTwinLeadStateV1(current: DigitalTwinLeadRecordStateV1, action: DigitalTwinLeadActionV1): DigitalTwinLeadRecordStateV1 | null {
  if (current === 'deleted') return null;
  switch (action) {
    case 'delete':
      return 'deleted';
    case 'accept':
      return current === 'new' ? 'accepted' : null;
    case 'reject':
      return current === 'new' || current === 'accepted' ? 'rejected' : null;
    case 'contacted':
      return current === 'accepted' ? 'contacted' : null;
    case 'converted':
      return current === 'contacted' || current === 'accepted' ? 'converted' : null;
    default:
      return null;
  }
}
