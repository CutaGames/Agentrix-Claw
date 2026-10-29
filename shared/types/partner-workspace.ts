/**
 * L8 3A E3: what apps that signed in with Agentrix keep in the owner's account (the partner workspace), as the owner's pages
 * read it from `/api/partner-workspace`. The shapes the server answers with, and strict decoders for them: an unknown field,
 * a wrong type or an address that is not what it claims to be makes the whole answer unreadable.
 *
 * The owner sees and can export, delete, forget and offer to the memory inbox what an app wrote; the app's text is shown as plain
 * text only (never HTML), and an item that cannot be opened is `readable: false` with no label and no text.
 *
 * Switches: server `PARTNER_WORKSPACE_V1_ENABLED` (404 while off); pages `NEXT_PUBLIC_PARTNER_WORKSPACE_ENABLED`.
 */
export const PARTNER_WORKSPACE_SCHEMA_VERSION_V1 = 1 as const;
export const PARTNER_WORKSPACE_FLAG_V1 = 'PARTNER_WORKSPACE_V1_ENABLED' as const;

export interface PartnerWorkspaceItemViewV1 {
  id: string;
  clientId: string;
  label: string | null;
  bytes: number;
  createdAt: string;
  promotedAt: string | null;
  retainUntil: string | null;
  readable: boolean;
  /** Only on a single read and in the export. */
  text?: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const CLIENT_ID = /^https:\/\/[^\s"<>\\^`{|}]{1,2040}$|^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const DIGEST = /^[0-9a-f]{64}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isIso = (value: unknown): value is string => typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value));
const hasOnly = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every((key) => allowed.includes(key));

export function decodePartnerWorkspaceItemV1(value: unknown): PartnerWorkspaceItemViewV1 | null {
  if (!isRecord(value) || !hasOnly(value, ['id', 'clientId', 'label', 'bytes', 'createdAt', 'promotedAt', 'retainUntil', 'readable', 'text'])) return null;
  if (typeof value.id !== 'string' || !UUID.test(value.id)) return null;
  if (typeof value.clientId !== 'string' || !CLIENT_ID.test(value.clientId)) return null;
  if (value.label !== null && (typeof value.label !== 'string' || value.label.length > 100)) return null;
  if (typeof value.bytes !== 'number' || !Number.isInteger(value.bytes) || value.bytes < 0 || value.bytes > 2_000_000) return null;
  if (!isIso(value.createdAt)) return null;
  if (value.promotedAt !== null && !isIso(value.promotedAt)) return null;
  if (value.retainUntil !== null && !isIso(value.retainUntil)) return null;
  if (typeof value.readable !== 'boolean') return null;
  if (value.readable === false && value.label !== null) return null;
  if (value.text !== undefined && value.text !== null && (typeof value.text !== 'string' || value.text.length > 8000)) return null;
  if (value.readable === false && typeof value.text === 'string') return null;
  return {
    id: value.id,
    clientId: value.clientId,
    label: value.label as string | null,
    bytes: value.bytes,
    createdAt: value.createdAt,
    promotedAt: (value.promotedAt as string | null) ?? null,
    retainUntil: (value.retainUntil as string | null) ?? null,
    readable: value.readable,
    ...(value.text !== undefined ? { text: value.text as string | null } : {}),
  };
}

/** `{ items: [...] }`, at most 500 of them. */
export function decodePartnerWorkspaceListV1(body: unknown): PartnerWorkspaceItemViewV1[] | null {
  if (!isRecord(body) || !hasOnly(body, ['items', 'truncated']) || !Array.isArray(body.items) || body.items.length > 500) return null;
  const out: PartnerWorkspaceItemViewV1[] = [];
  for (const item of body.items as unknown[]) {
    const decoded = decodePartnerWorkspaceItemV1(item);
    if (!decoded) return null;
    out.push(decoded);
  }
  return out;
}

export function isPartnerWorkspaceItemIdV1(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export function isPartnerWorkspaceAppDigestV1(value: unknown): value is string {
  return typeof value === 'string' && DIGEST.test(value);
}

/** Days an app's workspace is kept once it is no longer connected. Says the same thing as the server's retention. */
export const PARTNER_WORKSPACE_RETENTION_DAYS_V1 = 30 as const;
