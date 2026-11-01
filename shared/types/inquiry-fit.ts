/**
 * L9 P1-5a `inquiry_fit`: whether an inquiry is one the owner can take.
 *
 *   full          the owner is full for now ("这段时间满额")
 *   off_topic     same broad area, a different specialty
 *   out_of_scope  not the owner's services at all
 *   ok            nothing wrong (the default; also "not marked")
 *
 * It is a NEW field. It is not `noAnswerReason`, and nothing here adds a value to `DIGITAL_TWIN_NO_ANSWER_REASONS_V1`.
 * The owner marks "I can't take this" on a lead in "Visitors and leads" (`full`, `off_topic` or `out_of_scope`; `ok`
 * takes the mark back). The referral offer rules (lane B, P1-3b2) read the same four values; every surface that uses
 * the field checks it with `isInquiryFitV1` / `decodeInquiryFitV1` rather than trusting a string.
 */
export const INQUIRY_FITS_V1 = ['full', 'off_topic', 'out_of_scope', 'ok'] as const;
export type InquiryFitV1 = (typeof INQUIRY_FITS_V1)[number];

/** The three values that mean "the owner cannot take it". */
export const INQUIRY_UNABLE_FITS_V1 = ['full', 'off_topic', 'out_of_scope'] as const;
export type InquiryUnableFitV1 = (typeof INQUIRY_UNABLE_FITS_V1)[number];

/** The default when nothing says otherwise: ambiguity is `ok`, never an invented reason. */
export const INQUIRY_FIT_DEFAULT_V1: InquiryFitV1 = 'ok';

export function isInquiryFitV1(value: unknown): value is InquiryFitV1 {
  return typeof value === 'string' && (INQUIRY_FITS_V1 as readonly string[]).includes(value);
}

/** A stored or received value read back: a known value stays, anything else (missing, wrong type, unknown string) is `ok`. */
export function decodeInquiryFitV1(value: unknown): InquiryFitV1 {
  return isInquiryFitV1(value) ? value : INQUIRY_FIT_DEFAULT_V1;
}

/** True for `full`, `off_topic` and `out_of_scope`. */
export function isInquiryUnableFitV1(value: unknown): value is InquiryUnableFitV1 {
  return typeof value === 'string' && (INQUIRY_UNABLE_FITS_V1 as readonly string[]).includes(value);
}
