/**
 * Limited seed invites, v0 (L6-11).
 *
 * Seed members get a fixed number of invite codes. Whoever redeems one becomes a member under the inviter and gets
 * codes of their own, so the redemptions form an invite tree. A redemption also records the referral relation
 * (the existing referral ledger), so it counts toward referral rewards. Roots are the seed owners named in the server
 * configuration. Signing up does not need a code.
 *
 * v1: a code past its inviter's current quota, or whose inviter is no longer a member, cannot be redeemed (it answers
 * like an unknown code); an inviter can replace an open code, and the old one stops working.
 * Server switch: `SEED_INVITES_V0_ENABLED` exactly `1`; otherwise every route answers 404 to signed-in callers.
 * Web: `NEXT_PUBLIC_SEED_INVITES_ENABLED` exactly `1` shows the section.
 */

export const SEED_INVITES_ROUTES_V0 = {
  /** GET: the caller's membership and codes (missing codes are created up to the quota). */
  mine: '/api/seed-invites',
  /** POST `{ code }`: the caller joins under the code's owner. */
  redeem: '/api/seed-invites/redeem',
  /** v1, POST: the caller replaces one of their open codes (`:code`); answers the updated view. */
  replace: '/api/seed-invites/codes/:code/replace',
} as const;

export const SEED_INVITES_DEFAULT_PER_MEMBER_V0 = 3;
export const SEED_INVITES_MAX_PER_MEMBER_V0 = 5;

/** Ten characters from an alphabet without 0, O, 1 and I, so a code read aloud or typed by hand still matches. */
export const SEED_INVITE_CODE_ALPHABET_V0 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const SEED_INVITE_CODE_LENGTH_V0 = 10;
export const SEED_INVITE_CODE_PATTERN_V0 = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/;

export const SEED_INVITE_STATUSES_V0 = ['open', 'redeemed', 'revoked'] as const;
export type SeedInviteStatusV0 = (typeof SEED_INVITE_STATUSES_V0)[number];

export const SEED_INVITES_ERROR_CODES_V0 = {
  invalidCode: 'SEED_INVITE_INVALID_CODE',
  /** Unknown, already used or revoked; the three are not told apart. */
  notFound: 'SEED_INVITE_NOT_FOUND',
  alreadyMember: 'SEED_INVITE_ALREADY_MEMBER',
  signInRequired: 'SEED_INVITE_SIGN_IN_REQUIRED',
} as const;

/** The caller's own codes only. Who redeemed a code is never shown. */
export interface SeedInviteCodeViewV0 {
  code: string;
  status: 'open' | 'redeemed';
  redeemedAt: string | null;
}

export interface SeedInvitesViewV0 {
  member: boolean;
  /** A seed owner from the server configuration (the top of a tree). */
  root: boolean;
  quota: number;
  codes: SeedInviteCodeViewV0[];
}

export interface SeedInviteRedeemResultV0 {
  member: true;
}

/** Trims, upper-cases and drops spaces and dashes; anything that is not a well-formed code gives null. */
export function normalizeSeedInviteCodeV0(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 64) return null;
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  return SEED_INVITE_CODE_PATTERN_V0.test(code) ? code : null;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

export function decodeSeedInviteCodeViewV0(value: unknown): SeedInviteCodeViewV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.code !== 'string' || !SEED_INVITE_CODE_PATTERN_V0.test(raw.code)) return null;
  if (raw.status !== 'open' && raw.status !== 'redeemed') return null;
  if (raw.redeemedAt !== null && !isIsoTimestamp(raw.redeemedAt)) return null;
  if ((raw.status === 'redeemed') !== (raw.redeemedAt !== null)) return null;
  return { code: raw.code, status: raw.status, redeemedAt: raw.redeemedAt as string | null };
}

export function decodeSeedInvitesViewV0(value: unknown): SeedInvitesViewV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.member !== 'boolean' || typeof raw.root !== 'boolean') return null;
  if (!Number.isInteger(raw.quota) || (raw.quota as number) < 0 || (raw.quota as number) > SEED_INVITES_MAX_PER_MEMBER_V0) return null;
  if (!Array.isArray(raw.codes) || raw.codes.length > SEED_INVITES_MAX_PER_MEMBER_V0) return null;
  const codes: SeedInviteCodeViewV0[] = [];
  for (const entry of raw.codes) {
    const code = decodeSeedInviteCodeViewV0(entry);
    if (!code) return null;
    codes.push(code);
  }
  if (!raw.member && (raw.root || codes.length > 0)) return null;
  return { member: raw.member, root: raw.root, quota: raw.quota as number, codes };
}
