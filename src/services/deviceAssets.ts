/**
 * L9 S16 (L1, design 10): "My things" on the phone. Read and add things; photograph one to sell (record it → while
 * selling is open on the server, a draft listing with the photos → confirm the price); see a listing's state, read only;
 * answer the approval cards one by one; "I'm looking for". Editing a listing, publishing it and the item page stay on the
 * web.
 *
 * Off unless the build sets `EXPO_PUBLIC_DEVICE_ASSETS_ENABLED=1` (exactly). Off: the screens are not registered, the
 * devices page has no extra row, and every method of the client answers `off` without a request. The server checks its
 * own switches and the audience list again: a closed route answers 404 (`closed`).
 *
 * Every answer is decoded key by key with the shared decoders (`shared/types/device-assets.ts`, `resale.ts`); a 200
 * that does not decode is `unreadable`. Inputs go through the shared validators first and an invalid one is never sent.
 * No React Native import: the transport, the token and the upload `fetch` are injected.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import { parseApiErrorBodyV1 } from '../../shared/types/api-error';
import {
  DEVICE_ASSETS_ITEMS_PATH_V1,
  DEVICE_ASSET_REF_PATTERN_V1,
  decodeDeviceAssetListV1,
  decodeDeviceAssetViewV1,
  deviceAssetPathV1,
  deviceAssetsShapeV1,
  validateDeviceAssetInputV1,
  type DeviceAssetInputV1,
  type DeviceAssetListV1,
  type DeviceAssetStatusV1,
  type DeviceAssetViewV1,
} from '../../shared/types/device-assets';
import {
  RESALE_DISCLOSURE_CARDS_PATH_V1,
  RESALE_DISCLOSURE_CARD_REF_PATTERN_V1,
  RESALE_LISTINGS_PATH_V1,
  RESALE_LISTING_ENDED_STATUSES_V1,
  RESALE_LISTING_LIMITS_V1,
  RESALE_LISTING_REF_PATTERN_V1,
  RESALE_WANTED_PATH_V1,
  RESALE_WANTED_REF_PATTERN_V1,
  decodeResaleDisclosureCardListV1,
  decodeResaleListingOwnerListV1,
  decodeResaleListingOwnerViewV1,
  decodeResaleWantedListV1,
  resaleListingPathV1,
  validateResaleDisclosureDecisionInputV1,
  validateResaleListingPatchV1,
  validateResaleWantedInputV1,
  type ResaleDecodeResultV1,
  type ResaleDisclosureCardListV1,
  type ResaleDisclosureCardOwnerViewV1,
  type ResaleDisclosureCardStatusV1,
  type ResaleListingOwnerListV1,
  type ResaleListingOwnerViewV1,
  type ResaleWantedInputV1,
  type ResaleWantedListV1,
} from '../../shared/types/resale';

type Copy = { zh: string; en: string };

export function deviceAssetsEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const DEVICE_ASSETS_MOBILE_ENABLED = deviceAssetsEnabled(process.env.EXPO_PUBLIC_DEVICE_ASSETS_ENABLED);

export type DeviceAssetsMobileFailure =
  | 'off'
  | 'closed'
  | 'no_session'
  | 'invalid_input'
  | 'message_contains_contact'
  | 'owner_data_keys_off'
  | 'asset_limit'
  | 'device_already_linked'
  | 'asset_not_owned'
  | 'listing_exists'
  | 'listing_limit'
  | 'listing_state_changed'
  | 'listing_not_open'
  | 'photo_invalid'
  | 'photo_unreadable'
  | 'photo_limit'
  | 'photo_store_unavailable'
  | 'card_decided'
  | 'card_expired'
  | 'wanted_limit'
  | 'rate_limited'
  | 'keys_unavailable'
  | 'unavailable'
  | 'unreadable'
  | 'network'
  | 'failed';

export type DeviceAssetsMobileResult<T> = { ok: true; value: T } | { ok: false; failure: DeviceAssetsMobileFailure };

/** A photo picked on the phone (`expo-image-picker` asset). Only JPEG, PNG and WebP, at most 8 MB; the server re-checks. */
export interface DeviceAssetsMobilePhoto {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}

/** What the phone sets on a draft listing: the asking price, and optionally the lowest price (never shown to buyers). */
export interface DeviceAssetsMobilePrice {
  askingMinor: number;
  floorMinor?: number | null;
}

export interface MobileDeviceAssetsClient {
  listThings(query?: { status?: DeviceAssetStatusV1; limit?: number }): Promise<DeviceAssetsMobileResult<DeviceAssetListV1>>;
  getThing(assetRef: string): Promise<DeviceAssetsMobileResult<DeviceAssetViewV1>>;
  addThing(input: DeviceAssetInputV1): Promise<DeviceAssetsMobileResult<DeviceAssetViewV1>>;
  listListings(): Promise<DeviceAssetsMobileResult<ResaleListingOwnerListV1>>;
  createDraft(assetRef: string): Promise<DeviceAssetsMobileResult<ResaleListingOwnerViewV1>>;
  addPhoto(listingRef: string, photo: DeviceAssetsMobilePhoto): Promise<DeviceAssetsMobileResult<ResaleListingOwnerViewV1>>;
  setPrice(listingRef: string, price: DeviceAssetsMobilePrice): Promise<DeviceAssetsMobileResult<ResaleListingOwnerViewV1>>;
  listCards(query?: { status?: ResaleDisclosureCardStatusV1 }): Promise<DeviceAssetsMobileResult<ResaleDisclosureCardListV1>>;
  decideCard(cardRef: string, decision: { decision: 'approve' | 'deny'; value?: string }): Promise<DeviceAssetsMobileResult<ResaleDisclosureCardOwnerViewV1>>;
  listWanted(): Promise<DeviceAssetsMobileResult<ResaleWantedListV1>>;
  addWanted(input: ResaleWantedInputV1): Promise<DeviceAssetsMobileResult<ResaleWantedListV1>>;
  pauseWanted(wantedRef: string): Promise<DeviceAssetsMobileResult<ResaleWantedListV1>>;
  resumeWanted(wantedRef: string): Promise<DeviceAssetsMobileResult<ResaleWantedListV1>>;
  removeWanted(wantedRef: string): Promise<DeviceAssetsMobileResult<true>>;
}

const CODE_FAILURES: ReadonlyArray<[number, string, DeviceAssetsMobileFailure]> = [
  [400, 'message_contains_contact', 'message_contains_contact'],
  [400, 'photo_invalid', 'photo_invalid'],
  [400, 'photo_unreadable', 'photo_unreadable'],
  [409, 'owner_data_keys_off', 'owner_data_keys_off'],
  [409, 'asset_limit', 'asset_limit'],
  [409, 'device_already_linked', 'device_already_linked'],
  [409, 'asset_not_owned', 'asset_not_owned'],
  [409, 'listing_exists', 'listing_exists'],
  [409, 'listing_limit', 'listing_limit'],
  [409, 'listing_state_changed', 'listing_state_changed'],
  [409, 'listing_not_open', 'listing_not_open'],
  [409, 'photo_limit', 'photo_limit'],
  [409, 'card_decided', 'card_decided'],
  [409, 'card_expired', 'card_expired'],
  [409, 'wanted_limit', 'wanted_limit'],
  [503, 'photo_store_unavailable', 'photo_store_unavailable'],
  [503, 'OWNER_DATA_KEYS_UNAVAILABLE', 'keys_unavailable'],
];

/** Which failure a non-200 answer is: the status and the server's code first, then the status alone. */
export function deviceAssetsMobileFailureOf(status: number, body: unknown): DeviceAssetsMobileFailure {
  const code = parseApiErrorBodyV1(body).code;
  for (const [s, c, failure] of CODE_FAILURES) if (status === s && code === c) return failure;
  if (status === 404) return 'closed';
  if (status === 401 || status === 403) return 'no_session';
  if (status === 400) return 'invalid_input';
  // Multer's own cap (10 MB) answers before the service does.
  if (status === 413) return 'photo_invalid';
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'unavailable';
  return 'failed';
}

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const PHOTO_EXTENSIONS: Record<(typeof PHOTO_TYPES)[number], string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** The upload type of a picked photo, or `null` when it is not one the server takes (or is larger than 8 MB). */
export function deviceAssetsPhotoType(photo: DeviceAssetsMobilePhoto): (typeof PHOTO_TYPES)[number] | null {
  if (!photo || typeof photo.uri !== 'string' || photo.uri.length === 0) return null;
  if (typeof photo.fileSize === 'number' && photo.fileSize > RESALE_LISTING_LIMITS_V1.photoBytesMax) return null;
  // The picker re-encodes camera shots as JPEG; a missing type is sent as JPEG and the server checks the bytes.
  const raw = (photo.mimeType ?? 'image/jpeg').toLowerCase();
  const type = raw === 'image/jpg' ? 'image/jpeg' : raw;
  return (PHOTO_TYPES as readonly string[]).indexOf(type) >= 0 ? (type as (typeof PHOTO_TYPES)[number]) : null;
}

/** "650" or "650.50" Singapore dollars → minor units; anything else (empty, negative, three decimals, letters) → `null`. */
export function parseDeviceAssetsSgd(text: string): number | null {
  const trimmed = typeof text === 'string' ? text.trim().replace(/^S?\$/i, '') : '';
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, cents = ''] = trimmed.split('.');
  return Number(whole) * 100 + Number(cents.padEnd(2, '0'));
}

export function formatDeviceAssetsMoney(money: { amountMinor: number; currency: string } | null): string | null {
  if (!money) return null;
  const amount = (money.amountMinor / 100).toFixed(money.amountMinor % 100 === 0 ? 0 : 2);
  return money.currency === 'SGD' ? `S$${amount}` : `${money.currency} ${amount}`;
}

function fromDecoder<T>(decode: (body: unknown) => ResaleDecodeResultV1<T>): (body: unknown) => T | null {
  return (body) => {
    const decoded = decode(body);
    return decoded.ok === false ? null : (decoded as Extract<ResaleDecodeResultV1<T>, { ok: true }>).value;
  };
}

const deleted = (body: unknown): true | null => {
  const data = deviceAssetsShapeV1.unwrap(body) as { deleted?: unknown } | null;
  return data && typeof data === 'object' && data.deleted === true ? true : null;
};

/** One card (the decision answer), checked key by key as a list of one. */
const oneCard = (body: unknown): ResaleDisclosureCardOwnerViewV1 | null => {
  const decoded = decodeResaleDisclosureCardListV1({ schemaVersion: 1, items: [deviceAssetsShapeV1.unwrap(body)] });
  return decoded.ok === false ? null : (decoded as Extract<typeof decoded, { ok: true }>).value.items[0];
};

async function uploadBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export function createMobileDeviceAssetsClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
  /** Photo uploads are multipart and go straight through fetch (the JSON transport cannot carry a file). */
  fetchImpl?: typeof fetch;
  /** Tests only; the build switch otherwise. */
  enabled?: boolean;
}): MobileDeviceAssetsClient {
  const enabled = deps.enabled ?? DEVICE_ASSETS_MOBILE_ENABLED;
  const base = deps.baseUrl.replace(/\/+$/, '');
  const off = { ok: false as const, failure: 'off' as const };
  const fail = (failure: DeviceAssetsMobileFailure) => ({ ok: false as const, failure });
  const headers = (token: string): Record<string, string> => ({ Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' });

  function finish<T>(response: HttpResponseV1 | { status: number; body: unknown }, decode: (body: unknown) => T | null): DeviceAssetsMobileResult<T> {
    if (response.status !== 200) return fail(deviceAssetsMobileFailureOf(response.status, response.body));
    const value = decode(response.body);
    return value === null ? fail('unreadable') : { ok: true, value };
  }

  async function call<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, decode: (body: unknown) => T | null, body?: unknown): Promise<DeviceAssetsMobileResult<T>> {
    if (!enabled) return off;
    const token = deps.token();
    if (!token) return fail('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({ method, path: `${base}${path}`, headers: headers(token), ...(body === undefined ? {} : { body }) });
    } catch {
      return fail('network');
    }
    return finish(response, decode);
  }

  const listing = fromDecoder(decodeResaleListingOwnerViewV1);
  const wantedList = fromDecoder(decodeResaleWantedListV1);
  const wantedPath = (ref: string) => `${RESALE_WANTED_PATH_V1}/${encodeURIComponent(ref)}`;
  const listingRefOk = (ref: string) => typeof ref === 'string' && RESALE_LISTING_REF_PATTERN_V1.test(ref);
  const wantedRefOk = (ref: string) => typeof ref === 'string' && RESALE_WANTED_REF_PATTERN_V1.test(ref);

  return {
    listThings: (query = {}) => {
      const params: string[] = [];
      if (query.status) params.push(`status=${encodeURIComponent(query.status)}`);
      if (query.limit !== undefined) params.push(`limit=${encodeURIComponent(String(query.limit))}`);
      return call('GET', `${DEVICE_ASSETS_ITEMS_PATH_V1}${params.length ? `?${params.join('&')}` : ''}`, fromDecoder(decodeDeviceAssetListV1));
    },
    getThing: async (assetRef) => {
      if (!enabled) return off;
      if (typeof assetRef !== 'string' || !DEVICE_ASSET_REF_PATTERN_V1.test(assetRef)) return fail('closed');
      return call('GET', deviceAssetPathV1(assetRef), fromDecoder(decodeDeviceAssetViewV1));
    },
    addThing: async (input) => {
      if (!enabled) return off;
      const checked = validateDeviceAssetInputV1(input, { mode: 'create' });
      if (checked.ok === false) return fail('invalid_input');
      return call('POST', DEVICE_ASSETS_ITEMS_PATH_V1, fromDecoder(decodeDeviceAssetViewV1), (checked as Extract<typeof checked, { ok: true }>).value);
    },
    listListings: () => call('GET', RESALE_LISTINGS_PATH_V1, fromDecoder(decodeResaleListingOwnerListV1)),
    createDraft: async (assetRef) => {
      if (!enabled) return off;
      if (typeof assetRef !== 'string' || !DEVICE_ASSET_REF_PATTERN_V1.test(assetRef)) return fail('closed');
      return call('POST', RESALE_LISTINGS_PATH_V1, listing, { assetRef });
    },
    addPhoto: async (listingRef, photo) => {
      if (!enabled) return off;
      if (!listingRefOk(listingRef)) return fail('closed');
      const type = deviceAssetsPhotoType(photo);
      if (!type) return fail('photo_invalid');
      const token = deps.token();
      if (!token) return fail('no_session');
      const form = new FormData();
      // React Native's FormData sends `{ uri, name, type }` as the file part.
      form.append('file', { uri: photo.uri, name: `photo.${PHOTO_EXTENSIONS[type]}`, type } as unknown as Blob);
      try {
        const response = await (deps.fetchImpl ?? fetch)(`${base}${resaleListingPathV1(listingRef)}/photos`, { method: 'POST', headers: headers(token), body: form });
        return finish({ status: response.status, body: await uploadBody(response) }, listing);
      } catch {
        return fail('network');
      }
    },
    setPrice: async (listingRef, price) => {
      if (!enabled) return off;
      if (!listingRefOk(listingRef)) return fail('closed');
      const patch: Record<string, unknown> = { asking: { amountMinor: price.askingMinor, currency: 'SGD' } };
      if (price.floorMinor !== undefined && price.floorMinor !== null) patch.floor = { amountMinor: price.floorMinor, currency: 'SGD' };
      const checked = validateResaleListingPatchV1(patch);
      if (checked.ok === false) return fail('invalid_input');
      return call('PATCH', resaleListingPathV1(listingRef), listing, (checked as Extract<typeof checked, { ok: true }>).value);
    },
    listCards: (query = {}) =>
      call('GET', `${RESALE_DISCLOSURE_CARDS_PATH_V1}${query.status ? `?status=${encodeURIComponent(query.status)}` : ''}`, fromDecoder(decodeResaleDisclosureCardListV1)),
    decideCard: async (cardRef, decision) => {
      if (!enabled) return off;
      if (typeof cardRef !== 'string' || !RESALE_DISCLOSURE_CARD_REF_PATTERN_V1.test(cardRef)) return fail('closed');
      // Only `decision` and, with approve, `value`: there is no "always allow" to send.
      const body: Record<string, unknown> = { decision: decision?.decision };
      if (typeof decision?.value === 'string' && decision.value.trim().length > 0) body.value = decision.value;
      const checked = validateResaleDisclosureDecisionInputV1(body);
      if (checked.ok === false) return fail(checked.guard ? 'message_contains_contact' : 'invalid_input');
      return call('POST', `${RESALE_DISCLOSURE_CARDS_PATH_V1}/${encodeURIComponent(cardRef)}/decision`, oneCard, (checked as Extract<typeof checked, { ok: true }>).value);
    },
    listWanted: () => call('GET', RESALE_WANTED_PATH_V1, wantedList),
    addWanted: async (input) => {
      if (!enabled) return off;
      const checked = validateResaleWantedInputV1(input);
      if (checked.ok === false) return fail('invalid_input');
      const value = (checked as Extract<typeof checked, { ok: true }>).value;
      return call('POST', RESALE_WANTED_PATH_V1, wantedList, { category: value.category, maxPrice: value.maxPrice, area: value.area });
    },
    pauseWanted: async (ref) => (!enabled ? off : wantedRefOk(ref) ? call('POST', `${wantedPath(ref)}/pause`, wantedList, {}) : fail('closed')),
    resumeWanted: async (ref) => (!enabled ? off : wantedRefOk(ref) ? call('POST', `${wantedPath(ref)}/resume`, wantedList, {}) : fail('closed')),
    removeWanted: async (ref) => (!enabled ? off : wantedRefOk(ref) ? call('DELETE', wantedPath(ref), deleted) : fail('closed')),
  };
}

// ── "photograph one thing" (add, then a draft with photos, then the price) ──────────────────────────

export interface DeviceAssetsAddWithPhotosInput {
  thing: DeviceAssetInputV1;
  /** `null`: only record it. */
  sell: { photos: DeviceAssetsMobilePhoto[]; price: DeviceAssetsMobilePrice | null } | null;
}

export type DeviceAssetsAddWithPhotosOutcome =
  | { ok: false; failure: DeviceAssetsMobileFailure }
  | {
      ok: true;
      asset: DeviceAssetViewV1;
      /** `null` when nothing was to be sold or the draft could not be made (`draftFailure` says why). */
      listing: ResaleListingOwnerViewV1 | null;
      draftFailure: DeviceAssetsMobileFailure | null;
      photosSent: number;
      photosFailed: number;
      priceFailure: DeviceAssetsMobileFailure | null;
    };

/**
 * Records the thing; when selling, makes the draft listing, sends the photos one by one (stopping at the photo limit)
 * and sets the price. The record stays even when the draft cannot be made (selling not open: `draftFailure` `closed`).
 * Nothing is published: the owner fills in the rest and publishes on the web.
 */
export async function addThingWithPhotos(client: MobileDeviceAssetsClient, input: DeviceAssetsAddWithPhotosInput): Promise<DeviceAssetsAddWithPhotosOutcome> {
  const added = await client.addThing(input.thing);
  if (added.ok === false) return { ok: false, failure: added.failure };
  const asset = (added as Extract<typeof added, { ok: true }>).value;
  const done = { ok: true as const, asset, listing: null, draftFailure: null, photosSent: 0, photosFailed: 0, priceFailure: null };
  if (!input.sell) return done;
  const draft = await client.createDraft(asset.assetRef);
  if (draft.ok === false) return { ...done, draftFailure: draft.failure };
  let listing = (draft as Extract<typeof draft, { ok: true }>).value;
  let photosSent = 0;
  let photosFailed = 0;
  const photos = input.sell.photos.slice(0, RESALE_LISTING_LIMITS_V1.photosMax);
  for (let i = 0; i < photos.length; i += 1) {
    const sent = await client.addPhoto(listing.listingRef, photos[i]);
    if (sent.ok === false) {
      if (sent.failure === 'photo_limit') {
        photosFailed += photos.length - i;
        break;
      }
      photosFailed += 1;
      continue;
    }
    listing = (sent as Extract<typeof sent, { ok: true }>).value;
    photosSent += 1;
  }
  let priceFailure: DeviceAssetsMobileFailure | null = null;
  if (input.sell.price) {
    const priced = await client.setPrice(listing.listingRef, input.sell.price);
    if (priced.ok === false) priceFailure = priced.failure;
    else listing = (priced as Extract<typeof priced, { ok: true }>).value;
  }
  return { ...done, listing, photosSent, photosFailed, priceFailure };
}

/** The listing the detail page shows for a thing: the open one (draft, published, reserved) first, else the latest. */
export function deviceAssetsListingFor(listings: ResaleListingOwnerViewV1[], assetRef: string): ResaleListingOwnerViewV1 | null {
  const mine = listings.filter((item) => item.assetRef === assetRef);
  const ended = RESALE_LISTING_ENDED_STATUSES_V1 as readonly string[];
  const open = mine.find((item) => ended.indexOf(item.status) < 0);
  if (open) return open;
  return mine.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;
}

// ── the devices page row ─────────────────────────────────────────────────────────────────────────

/** The one row the devices page gains with the switch on; `null` (nothing extra at all) with it off. */
export function myDevicesThingsEntry(enabled: boolean = DEVICE_ASSETS_MOBILE_ENABLED): { route: 'MyThings'; label: Copy; hint: Copy } | null {
  if (!enabled) return null;
  return {
    route: 'MyThings',
    label: { zh: '我的东西', en: 'My things' },
    hint: { zh: '我有什么、值多少、保修到哪天；拍照加一件想卖的', en: 'What you have, what it is worth, warranty; photograph one to sell' },
  };
}

// ── copy ────────────────────────────────────────────────────────────────────────────────────────

export const DEVICE_ASSETS_MOBILE_FAILURE_COPY: Readonly<Record<DeviceAssetsMobileFailure, Copy>> = {
  off: { zh: '这个版本还没有「我的东西」。', en: 'My things is not in this version.' },
  closed: { zh: '没有找到，或者还没对你开放。', en: 'Not found, or not open to you yet.' },
  no_session: { zh: '请先登录。', en: 'Please sign in first.' },
  invalid_input: { zh: '有一项填得不对，请检查后再试。', en: 'One of the fields is not valid. Check it and try again.' },
  message_contains_contact: { zh: '不能写链接。地址和号码可以写。', en: 'Links cannot be written here. An address or a number is fine.' },
  owner_data_keys_off: { zh: '开启加密以后才能填私密信息。这次没有保存。', en: 'Private details can be entered once encryption is on. Nothing was saved.' },
  asset_limit: { zh: '最多记 500 件东西。', en: 'You can record up to 500 items.' },
  device_already_linked: { zh: '这台设备已经挂在另一件东西上。', en: 'This device is already linked to another item.' },
  asset_not_owned: { zh: '只有「我手上的」东西才能卖。', en: 'Only things you still have can be sold.' },
  listing_exists: { zh: '这件东西已经有一个没结束的挂牌，到网页上看。', en: 'This item already has an open listing. See it on the web.' },
  listing_limit: { zh: '最多同时卖 20 件东西。', en: 'You can have up to 20 items for sale at the same time.' },
  listing_state_changed: { zh: '状态刚变了，请刷新再试。', en: 'Something just changed. Refresh and try again.' },
  listing_not_open: { zh: '这件东西已经结束（卖出、下架或到期），不能再批准。', en: 'This listing has ended (sold, withdrawn or expired), so you cannot approve any more.' },
  photo_invalid: { zh: '只收 8 MB 以内的 JPEG、PNG 或 WebP 照片。', en: 'Only JPEG, PNG or WebP photos up to 8 MB.' },
  photo_unreadable: { zh: '这张照片打不开，换一张试试。', en: 'This photo cannot be read. Try another one.' },
  photo_limit: { zh: '最多 4 张照片。', en: 'Up to 4 photos.' },
  photo_store_unavailable: { zh: '照片暂时存不了，请稍后到网页上补。', en: 'Photos cannot be saved right now. Add them on the web later.' },
  card_decided: { zh: '这张卡已经处理过了。', en: 'This request has already been answered.' },
  card_expired: { zh: '这张卡已经过期（24 小时）。买家可以再问一次。', en: 'This request has expired (24 hours). The buyer can ask again.' },
  wanted_limit: { zh: '最多同时找 3 样东西。先暂停或删掉一条再加。', en: 'You can look for up to 3 things at a time. Pause or delete one first.' },
  rate_limited: { zh: '太频繁了，请稍后再试。', en: 'Too many tries. Try again later.' },
  keys_unavailable: { zh: '加密暂时用不了，这次没有保存。请稍后再试。', en: 'Encryption is unavailable right now, so nothing was saved. Try again later.' },
  unavailable: { zh: '暂时用不了，请稍后再试。', en: 'Unavailable right now. Try again later.' },
  unreadable: { zh: '读不懂服务器的回答，请稍后再试。', en: 'The answer from the server cannot be read. Try again later.' },
  network: { zh: '网络不稳，请稍后再试。', en: 'Network trouble. Please try again.' },
  failed: { zh: '没有处理成功，请重试。', en: 'That did not go through. Try again.' },
};

export const DEVICE_ASSETS_STATUS_COPY: Readonly<Record<DeviceAssetStatusV1, Copy>> = {
  owned: { zh: '我手上的', en: 'I have it' },
  listed: { zh: '在卖', en: 'For sale' },
  sold: { zh: '卖掉了', en: 'Sold' },
  recycled: { zh: '回收了', en: 'Traded in' },
  given_away: { zh: '送人了', en: 'Given away' },
  disposed: { zh: '处理掉了', en: 'Disposed of' },
};

export const DEVICE_ASSETS_LISTING_STATUS_COPY: Readonly<Record<ResaleListingOwnerViewV1['status'], Copy>> = {
  draft: { zh: '草稿，还没发布', en: 'Draft, not published' },
  published: { zh: '在卖', en: 'For sale' },
  reserved: { zh: '已约', en: 'Arranged' },
  sold: { zh: '卖掉了', en: 'Sold' },
  withdrawn: { zh: '下架了', en: 'Withdrawn' },
  expired: { zh: '到期了', en: 'Expired' },
};

export const DEVICE_ASSETS_CARD_FIELD_COPY: Readonly<Record<ResaleDisclosureCardOwnerViewV1['field'], Copy>> = {
  pickup_point: { zh: '取货地点', en: 'Pickup point' },
  meetup_time: { zh: '见面时间', en: 'Meeting time' },
};

export const DEVICE_ASSETS_CARD_STATUS_COPY: Readonly<Record<ResaleDisclosureCardStatusV1, Copy>> = {
  pending: { zh: '等你批准', en: 'Waiting for you' },
  approved: { zh: '已批准', en: 'Approved' },
  denied: { zh: '已拒绝', en: 'Denied' },
  expired: { zh: '已过期', en: 'Expired' },
};

export const DEVICE_ASSETS_WANTED_STATUS_COPY: Readonly<Record<ResaleWantedListV1['items'][number]['status'], Copy>> = {
  active: { zh: '在找', en: 'Looking' },
  paused: { zh: '暂停了', en: 'Paused' },
  expired: { zh: '过期了（90 天）', en: 'Expired (90 days)' },
};

/** Said under the photo step: what happens with the photos and that nothing is published from the phone. */
export const DEVICE_ASSETS_SELL_COPY = {
  explain: {
    zh: '照片和价格存进一个草稿，不会发布。到网页上补标题、区域和交收方式，确认后再发布。',
    en: 'The photos and the price go into a draft; nothing is published. Add the title, area and handover on the web, then publish.',
  },
  floor: {
    zh: '最低价只有你自己看得到，也不会交给 AI。低于它的出价会自动婉拒。',
    en: 'Only you can see the lowest price, and it is never given to the AI. Offers below it are declined automatically.',
  },
  notOpen: {
    zh: '记下了。卖东西还没对你开放，照片和价格没有保存。',
    en: 'Saved. Selling is not open to you yet, so the photos and the price were not kept.',
  },
} as const;

/** Said on the approval card screen. */
export const DEVICE_ASSETS_CARDS_COPY = {
  explain: {
    zh: '买家问取货地点或见面时间时，要你每次亲手批准；没有「始终允许」。批准的内容只给这一位买家看。',
    en: 'When a buyer asks for the pickup point or a meeting time, you approve each one yourself; there is no "always allow". What you approve is shown to that one buyer only.',
  },
  valueHint: {
    zh: '可以改成具体的地方或时间（不能写链接）。取货地点留空就用你在挂牌上预设的。',
    en: 'You can write the exact place or time (no links). Leave the pickup point empty to use the one preset on the listing.',
  },
} as const;
