/**
 * Partner lifecycle events (L8 3A E3; event kinds reworked in L9.2 batch 11 item 7). This header is the reference for apps
 * that sign in with Agentrix and register an event address.
 *
 * Delivery: a Security Event Token (RFC 8417) pushed to the registered https address per RFC 8935, `Content-Type:
 * application/secevent+jwt`, signed with the platform key (`typ: secevent+jwt`). Success is 200, 202 or 204; anything else is
 * retried with a growing wait and then given up.
 *
 * Every token carries `iss`, `iat`, a unique `jti`, the app's client id as `aud`, `sub_id: { format: 'iss_sub', iss, sub }` where
 * `sub` is the same pairwise subject the app already has for that user, and exactly one event under `events`. No name, no
 * email, no Agent, no data.
 *
 * The kinds, and when each one is sent:
 * - `session_revoked` (CAEP session-revoked): the user disconnected this app (its Pass was revoked). Sent. Payload `{}`.
 * - `account_deletion_requested` (Agentrix): the user asked for the Agentrix account to be deleted. The account is not
 *   disabled and not deleted yet, and the request can still be withdrawn. Sent to every app with an address. Payload
 *   `{ reason: 'deletion_requested' }`. Before this kind existed (until batch 11) the same moment went out as
 *   `account_disabled` with that reason.
 * - `account_disabled` (RISC account-disabled): the account was disabled. Not sent yet: nothing disables an account through
 *   the event bus.
 * - `account_enabled` (RISC account-enabled) and `account_purged` (RISC account-purged): not sent yet. A deletion request never
 *   produces `account_purged`.
 */
export const PARTNER_EVENT_KINDS_V1 = ['session_revoked', 'account_disabled', 'account_enabled', 'account_purged', 'account_deletion_requested'] as const;
export type PartnerEventKindV1 = (typeof PARTNER_EVENT_KINDS_V1)[number];

/** The event type URI each kind is sent under (the key inside `events`). */
export const PARTNER_EVENT_URIS_V1: Readonly<Record<PartnerEventKindV1, string>> = Object.freeze({
  session_revoked: 'https://schemas.openid.net/secevent/caep/event-type/session-revoked',
  account_disabled: 'https://schemas.openid.net/secevent/risc/event-type/account-disabled',
  account_enabled: 'https://schemas.openid.net/secevent/risc/event-type/account-enabled',
  account_purged: 'https://schemas.openid.net/secevent/risc/event-type/account-purged',
  account_deletion_requested: 'https://agentrix.top/secevent/event-type/account-deletion-requested',
});

/** The kinds this server sends today. */
export const PARTNER_EVENT_KINDS_SENT_V1: readonly PartnerEventKindV1[] = Object.freeze(['session_revoked', 'account_deletion_requested']);

/** `reason` in the payload of `account_deletion_requested`. */
export const PARTNER_EVENT_DELETION_REASON_V1 = 'deletion_requested' as const;

/** Width of `partner_event_deliveries.event_kind` (migration 2283): every kind has to fit. */
export const PARTNER_EVENT_KIND_MAX_LENGTH_V1 = 32;
