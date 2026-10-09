/**
 * Hardware G1, v0 contract only (L6-10): the device gateway in production (off, open only to allowlisted hardware
 * makers), certified boards, and the desk companion's e-ink day view of today's bookings. The boards are not bought
 * yet (OA-107), so nothing reads this in v0.
 */

/** Future server switch; nothing reads it in v0. */
export const DEVICE_GATEWAY_G1_FLAG = 'DEVICE_GATEWAY_G1_ENABLED';

export const HARDWARE_MAKER_STATUSES_G1 = ['pending', 'approved', 'suspended'] as const;
export type HardwareMakerStatusG1 = (typeof HARDWARE_MAKER_STATUSES_G1)[number];

export interface HardwareMakerAllowlistEntryG1 {
  makerId: string;
  name: string;
  status: HardwareMakerStatusG1;
}

export interface CertifiedBoardG1 {
  boardId: string;
  makerId: string;
  model: string;
  firmwareVersion: string;
  certifiedAt: string;
}

export interface EinkDayViewG1 {
  /** YYYY-MM-DD in the owner's time zone. */
  date: string;
  /** IANA name, for example Asia/Singapore. */
  timeZone: string;
  /** At most 12, already sorted by start. */
  bookings: { start: string; end: string; title: string }[];
}

const ID = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const SEMVER = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** A board may join the gateway only when it is certified and its maker is approved. */
export function boardMayConnectG1(board: CertifiedBoardG1, makers: readonly HardwareMakerAllowlistEntryG1[]): boolean {
  return makers.some((m) => m.makerId === board.makerId && m.status === 'approved');
}

export function decodeCertifiedBoardG1(value: unknown): CertifiedBoardG1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const { boardId, makerId, model, firmwareVersion, certifiedAt } = raw;
  if (typeof boardId !== 'string' || !ID.test(boardId) || typeof makerId !== 'string' || !ID.test(makerId)) return null;
  if (typeof model !== 'string' || !model.trim() || model.length > 80) return null;
  if (typeof firmwareVersion !== 'string' || !SEMVER.test(firmwareVersion)) return null;
  if (typeof certifiedAt !== 'string' || Number.isNaN(Date.parse(certifiedAt))) return null;
  return { boardId, makerId, model: model.trim(), firmwareVersion, certifiedAt };
}

export function decodeEinkDayViewG1(value: unknown): EinkDayViewG1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const date = raw.date;
  const timeZone = raw.timeZone;
  const bookings = raw.bookings;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (typeof timeZone !== 'string' || !/^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(timeZone) || timeZone.length > 64) return null;
  if (!Array.isArray(bookings) || bookings.length > 12) return null;
  const kept: { start: string; end: string; title: string }[] = [];
  for (const booking of bookings) {
    const b = booking as Record<string, unknown> | null;
    const start = b ? b.start : undefined;
    const end = b ? b.end : undefined;
    const title = b ? b.title : undefined;
    if (typeof start !== 'string' || typeof end !== 'string' || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) return null;
    if (Date.parse(end) <= Date.parse(start)) return null;
    if (typeof title !== 'string' || title.length > 40) return null;
    kept.push({ start, end, title });
  }
  for (let i = 1; i < kept.length; i++) if (Date.parse(kept[i].start) < Date.parse(kept[i - 1].start)) return null;
  return { date, timeZone, bookings: kept };
}
