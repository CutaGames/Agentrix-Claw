/**
 * L9 devices and assets L5 (S25): read-only search over second-hand listings, for other people's AI assistants.
 *
 * - The seller chooses, listing by listing, whether an item is searchable. The default is **not**: no choice, no entry.
 *   The choice lives in `resale_discovery_listings` (migration 2261), one row per chosen listing.
 * - What a search returns is the least there is: the title, the category, the condition, the asking price, the rough
 *   area (north, south, east, west or central), the handover method, the two times and the path of the item page. There is
 *   no seller name, no Agent, no account id, no description, no question and answer, no photo, no conversation, no offer
 *   and no pickup point: the types below have no room for them, and the decoders refuse a key that is not listed.
 * - Only listings that are `published`, not expired and whose seller is on `DEVICE_ASSETS_AUDIENCE_V1` appear. A listing
 *   that is reserved, sold, withdrawn or expired is gone from search.
 * - Every public answer carries `X-Robots-Tag: noindex, nofollow, noarchive` and `Cache-Control: no-store`. The item page
 *   itself stays out of search engines (D13, E140); `resaleDiscoveryJsonLdV1` only ever describes the same few fields.
 * - Rate limited per source and for the whole process. Backend switch `RESALE_PUBLIC_DISCOVERY_V1_ENABLED`, web switch
 *   `NEXT_PUBLIC_RESALE_DISCOVERY_ENABLED`; both exactly `'1'`, default off. Off: every route answers the 404 of a route
 *   that does not exist and the MCP tool is not in the list.
 */
import {
  DEVICE_ASSET_CONDITIONS_V1,
  RESALE_CATEGORIES_V1,
  deviceAssetsShapeV1,
  type DeviceAssetConditionV1,
  type ResaleCategoryV1,
} from './device-assets';
import {
  RESALE_AREAS_V1,
  RESALE_HANDOVERS_V1,
  RESALE_LISTING_LIMITS_V1,
  RESALE_LISTING_REF_PATTERN_V1,
  resaleItemPagePathV1,
  type ResaleAreaV1,
  type ResaleHandoverV1,
  type ResaleMoneySgdV1,
} from './resale';

export const RESALE_PUBLIC_DISCOVERY_FLAG_V1 = 'RESALE_PUBLIC_DISCOVERY_V1_ENABLED' as const;
export const RESALE_DISCOVERY_WEB_FLAG_V1 = 'NEXT_PUBLIC_RESALE_DISCOVERY_ENABLED' as const;

/** Under `/api`. The two public routes need no login; the two owner routes need a person's own sign-in. */
export const RESALE_DISCOVERY_ROUTES_V1 = {
  search: 'GET /resale/public/discovery/listings',
  item: 'GET /resale/public/discovery/listings/:listingRef',
  ownerState: 'GET /resale/listings/:listingRef/discovery',
  ownerSet: 'PUT /resale/listings/:listingRef/discovery',
} as const;

export const RESALE_DISCOVERY_PUBLIC_PATH_V1 = '/resale/public/discovery/listings';
/** Search (`GET`, with the query keys of `ResaleDiscoveryQueryV1`). */
export function resaleDiscoverySearchPathV1(): string {
  return RESALE_DISCOVERY_PUBLIC_PATH_V1;
}
/** One searchable listing, by its reference (`GET`; 404 unless the seller chose to make it searchable). */
export function resaleDiscoveryItemPathV1(listingRef: string): string {
  return `${RESALE_DISCOVERY_PUBLIC_PATH_V1}/${encodeURIComponent(listingRef)}`;
}
/** The seller's choice for one of their listings (`GET`, `PUT { discoverable }`). */
export function resaleListingDiscoveryPathV1(listingRef: string): string {
  return `/resale/listings/${encodeURIComponent(listingRef)}/discovery`;
}

export const RESALE_DISCOVERY_MCP_TOOL_NAME_V1 = 'resale_search_listings' as const;

export const RESALE_DISCOVERY_LIMITS_V1 = {
  qMax: 40,
  pageDefault: 10,
  pageMax: 20,
  cursorMax: 120,
  maxPriceMinorMin: RESALE_LISTING_LIMITS_V1.askingMinorMin,
  maxPriceMinorMax: RESALE_LISTING_LIMITS_V1.askingMinorMax,
  /** Per source, per minute. */
  perSourcePerMinute: 30,
  /** For the whole process, per minute. */
  totalPerMinute: 600,
} as const;

/** The keys a search may carry. Anything else is refused. */
export const RESALE_DISCOVERY_QUERY_KEYS_V1 = ['q', 'category', 'area', 'maxPrice', 'limit', 'cursor'] as const;

export interface ResaleDiscoveryQueryV1 {
  /** Words in the title (case is ignored; `%` and `_` count as themselves). */
  q?: string;
  category?: ResaleCategoryV1;
  area?: ResaleAreaV1;
  /** Asking price at most this, in SGD cents. */
  maxPrice?: number;
  limit?: number;
  cursor?: string;
}

export type ResaleDiscoveryCheckV1<T> = { ok: true; value: T } | { ok: false; field: string };

// eslint-disable-next-line no-control-regex
const CONTROL_OR_INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;
const DIGITS = /^\d{1,9}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** A whole number, from a number or from a string of digits (a query string, or an assistant that sends numbers as text). */
function wholeNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value === 'string' && DIGITS.test(value)) return Number(value);
  return null;
}

/**
 * Checks one search: only the keys of `ResaleDiscoveryQueryV1`; `q` is 1 to 40 characters once trimmed and holds no control
 * or invisible character; `category` and `area` come from the lists; `maxPrice` is a whole number of cents from S$1 to
 * S$10,000; `limit` is 1 to 20; `cursor` is what an earlier answer gave (base64url, at most 120 characters).
 */
export function validateResaleDiscoveryQueryV1(value: unknown): ResaleDiscoveryCheckV1<ResaleDiscoveryQueryV1> {
  if (value === undefined || value === null) return { ok: true, value: {} };
  if (!isRecord(value)) return { ok: false, field: '$' };
  for (const key of Object.keys(value)) if ((RESALE_DISCOVERY_QUERY_KEYS_V1 as readonly string[]).indexOf(key) < 0) return { ok: false, field: key };
  const out: ResaleDiscoveryQueryV1 = {};
  if (value.q !== undefined) {
    if (typeof value.q !== 'string' || CONTROL_OR_INVISIBLE.test(value.q)) return { ok: false, field: 'q' };
    const text = value.q.trim();
    if (text.length < 1 || text.length > RESALE_DISCOVERY_LIMITS_V1.qMax) return { ok: false, field: 'q' };
    out.q = text;
  }
  if (value.category !== undefined) {
    if (typeof value.category !== 'string' || (RESALE_CATEGORIES_V1 as readonly string[]).indexOf(value.category) < 0) return { ok: false, field: 'category' };
    out.category = value.category as ResaleCategoryV1;
  }
  if (value.area !== undefined) {
    if (typeof value.area !== 'string' || (RESALE_AREAS_V1 as readonly string[]).indexOf(value.area) < 0) return { ok: false, field: 'area' };
    out.area = value.area as ResaleAreaV1;
  }
  if (value.maxPrice !== undefined) {
    const price = wholeNumber(value.maxPrice);
    if (price === null || price < RESALE_DISCOVERY_LIMITS_V1.maxPriceMinorMin || price > RESALE_DISCOVERY_LIMITS_V1.maxPriceMinorMax) return { ok: false, field: 'maxPrice' };
    out.maxPrice = price;
  }
  if (value.limit !== undefined) {
    const limit = wholeNumber(value.limit);
    if (limit === null || limit < 1 || limit > RESALE_DISCOVERY_LIMITS_V1.pageMax) return { ok: false, field: 'limit' };
    out.limit = limit;
  }
  if (value.cursor !== undefined) {
    if (typeof value.cursor !== 'string' || value.cursor.length < 1 || value.cursor.length > RESALE_DISCOVERY_LIMITS_V1.cursorMax || !CURSOR_PATTERN.test(value.cursor)) {
      return { ok: false, field: 'cursor' };
    }
    out.cursor = value.cursor;
  }
  return { ok: true, value: out };
}

// ── what a search returns ─────────────────────────────────────────────────────────────────────

/** One searchable listing. Ten keys; the type has no room for a seller, a description, a photo or a place. */
export interface ResaleDiscoveryItemV1 {
  listingRef: string;
  title: string;
  category: ResaleCategoryV1;
  condition: DeviceAssetConditionV1;
  asking: ResaleMoneySgdV1;
  area: ResaleAreaV1;
  handover: ResaleHandoverV1;
  publishedAt: string;
  expiresAt: string;
  /** `/i/<listingRef>`: the item page, which anyone with the link sees. */
  itemPath: string;
}
export interface ResaleDiscoveryPageV1 {
  schemaVersion: 1;
  items: ResaleDiscoveryItemV1[];
  /** Give this back as `cursor` to read the next page; `null` on the last page. */
  nextCursor: string | null;
}
/** The seller's choice for one listing. */
export interface ResaleDiscoveryOwnerStateV1 {
  schemaVersion: 1;
  listingRef: string;
  discoverable: boolean;
}
/** `PUT /resale/listings/:listingRef/discovery`. */
export interface ResaleDiscoveryOwnerInputV1 {
  discoverable: boolean;
}

export const RESALE_DISCOVERY_ITEM_KEYS_V1 = ['listingRef', 'title', 'category', 'condition', 'asking', 'area', 'handover', 'publishedAt', 'expiresAt', 'itemPath'] as const;

const S = deviceAssetsShapeV1;
type Check = (value: unknown) => boolean;
const ITEM_KEYS: Record<string, Check> = {
  listingRef: S.pattern(RESALE_LISTING_REF_PATTERN_V1),
  title: S.text(RESALE_LISTING_LIMITS_V1.titleMax),
  category: S.oneOf(RESALE_CATEGORIES_V1),
  condition: S.oneOf(DEVICE_ASSET_CONDITIONS_V1),
  asking: S.object({ amountMinor: S.int(RESALE_LISTING_LIMITS_V1.askingMinorMin, RESALE_LISTING_LIMITS_V1.askingMinorMax), currency: S.literal('SGD') }),
  area: S.oneOf(RESALE_AREAS_V1),
  handover: S.oneOf(RESALE_HANDOVERS_V1),
  publishedAt: S.isoTime,
  expiresAt: S.isoTime,
  itemPath: S.pattern(/^\/i\/rsl_[0-9a-f]{32}$/),
};
const ITEM: Check = (v) => S.object(ITEM_KEYS)(v) && (v as ResaleDiscoveryItemV1).itemPath === resaleItemPagePathV1((v as ResaleDiscoveryItemV1).listingRef);
const CURSOR: Check = (v) => typeof v === 'string' && v.length >= 1 && v.length <= RESALE_DISCOVERY_LIMITS_V1.cursorMax && CURSOR_PATTERN.test(v);

export type ResaleDiscoveryDecodeV1<T> = { ok: true; value: T } | { ok: false; field: string };

function decodeExact<T>(body: unknown, keys: Record<string, Check>, extra?: (value: T) => string | null): ResaleDiscoveryDecodeV1<T> {
  const value = S.unwrap(body);
  if (!S.isRecord(value)) return { ok: false, field: '$' };
  const field = S.exactKeysFailure(value, keys);
  if (field !== null) return { ok: false, field };
  const typed = value as unknown as T;
  const extraField = extra ? extra(typed) : null;
  return extraField === null ? { ok: true, value: typed } : { ok: false, field: extraField };
}

/** One entry, key by key: one key more (a `sellerLabel`, a `description`, `photos`, an account id) makes it unreadable. */
export function decodeResaleDiscoveryItemV1(body: unknown): ResaleDiscoveryDecodeV1<ResaleDiscoveryItemV1> {
  return decodeExact<ResaleDiscoveryItemV1>(body, ITEM_KEYS, (item) => (ITEM(item) ? null : 'itemPath'));
}
/** A page: at most 20 entries, and one bad entry makes the whole page unreadable. */
export function decodeResaleDiscoveryPageV1(body: unknown): ResaleDiscoveryDecodeV1<ResaleDiscoveryPageV1> {
  return decodeExact<ResaleDiscoveryPageV1>(body, {
    schemaVersion: S.literal(1),
    items: S.arrayOf(ITEM, RESALE_DISCOVERY_LIMITS_V1.pageMax),
    nextCursor: S.nullable(CURSOR),
  });
}
export function decodeResaleDiscoveryOwnerStateV1(body: unknown): ResaleDiscoveryDecodeV1<ResaleDiscoveryOwnerStateV1> {
  return decodeExact<ResaleDiscoveryOwnerStateV1>(body, {
    schemaVersion: S.literal(1),
    listingRef: S.pattern(RESALE_LISTING_REF_PATTERN_V1),
    discoverable: S.bool,
  });
}
/** `PUT` body: exactly `{ discoverable: boolean }`. */
export function validateResaleDiscoveryOwnerInputV1(value: unknown): ResaleDiscoveryCheckV1<ResaleDiscoveryOwnerInputV1> {
  if (!isRecord(value)) return { ok: false, field: '$' };
  for (const key of Object.keys(value)) if (key !== 'discoverable') return { ok: false, field: key };
  if (typeof value.discoverable !== 'boolean') return { ok: false, field: 'discoverable' };
  return { ok: true, value: { discoverable: value.discoverable } };
}

// ── the item page's structured data ───────────────────────────────────────────────────────────

const SCHEMA_CONDITION: Record<DeviceAssetConditionV1, string> = {
  new: 'https://schema.org/NewCondition',
  like_new: 'https://schema.org/UsedCondition',
  good: 'https://schema.org/UsedCondition',
  fair: 'https://schema.org/UsedCondition',
  for_parts: 'https://schema.org/DamagedCondition',
};

/** `65000` → `'650.00'`. */
export function resaleDiscoveryPriceTextV1(amountMinor: number): string {
  return `${Math.floor(amountMinor / 100)}.${String(amountMinor % 100).padStart(2, '0')}`;
}

/**
 * schema.org `Product` for the item page, from the search entry and nothing else, so it can never say more than a search
 * does: no `url`, no `seller`, no `image`, no `description`. Nothing in the page's indexing rules changes with it.
 */
export function resaleDiscoveryJsonLdV1(item: ResaleDiscoveryItemV1): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.title,
    category: item.category,
    itemCondition: SCHEMA_CONDITION[item.condition],
    offers: {
      '@type': 'Offer',
      price: resaleDiscoveryPriceTextV1(item.asking.amountMinor),
      priceCurrency: 'SGD',
      availability: 'https://schema.org/InStock',
    },
  };
}
