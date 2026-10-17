/**
 * Which computers 事项 → 电脑上 lists (REQ-mobile-074 known issue, L3 §known issues; rule proposed in
 * REQ-mobile-094).
 *
 * `GET /desktop-sync/state` returns every presence row the account ever had, with no age limit. Before a
 * computer is bound it heartbeats as `desktop-<uuid>`; once bound it heartbeats as its device-key id `dev_…`
 * (desktop `deviceEnrollment.ts`, REQ-mobile-074.re-desktop). The old row then stays forever, so the same
 * computer showed twice, one row with "还没有急停回执", and any old row kept the 电脑上 tab visible.
 *
 * Rule:
 * - a bound computer (`dev_…`) is always listed, online or not: it is registered and has receipts;
 * - any other row is listed only while the server says it is online (`isOnline`, heartbeat within 5 minutes,
 *   server clock). A computer not bound yet shows while it runs; a pre-binding row goes within 5 minutes;
 * - a server that does not send `isOnline` (older backend): listed, as before.
 */
export const BOUND_COMPUTER_ID_PREFIX = 'dev_';

export interface PresenceRowV1 {
  deviceId: string;
  isOnline?: boolean;
}

export function isListedComputer(row: PresenceRowV1): boolean {
  if (typeof row?.deviceId !== 'string' || !row.deviceId) return false;
  if (row.deviceId.startsWith(BOUND_COMPUTER_ID_PREFIX)) return true;
  return row.isOnline !== false;
}

/** The rows 电脑上 shows, in the server's order (most recently seen first). */
export function listedComputers<T extends PresenceRowV1>(rows: readonly T[] | null | undefined): T[] {
  return (rows ?? []).filter(isListedComputer);
}
