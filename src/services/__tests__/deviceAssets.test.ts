/**
 * L9 S16 (L1) "My things" on the phone (deviceAssets.ts): the build switch, zero requests while it is off, the shared
 * decoders, inputs checked before anything is sent, approval cards that only ever send `decision` and `value`, the
 * "photograph one thing" flow, and the switch guards on the devices page and the Me stack.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import type { DeviceAssetSummaryV1, DeviceAssetViewV1 } from '../../../shared/types/device-assets';
import type { ResaleDisclosureCardOwnerViewV1, ResaleListingOwnerViewV1, ResaleWantedListV1 } from '../../../shared/types/resale';
import {
  addThingWithPhotos,
  createMobileDeviceAssetsClient,
  deviceAssetsEnabled,
  deviceAssetsListingFor,
  deviceAssetsMobileFailureOf,
  deviceAssetsPhotoType,
  formatDeviceAssetsMoney,
  myDevicesThingsEntry,
  parseDeviceAssetsSgd,
  type MobileDeviceAssetsClient,
} from '../deviceAssets';

type Mod = typeof import('../deviceAssets');

const BASE = 'https://api.agentrix.top/api/';
const API = 'https://api.agentrix.top/api';
const AT = '2026-10-29T08:00:00.000Z';
const ASSET_REF = `das_${'a'.repeat(32)}`;
const LISTING_REF = `rsl_${'b'.repeat(32)}`;
const THREAD_REF = `rst_${'c'.repeat(32)}`;
const CARD_REF = `rsd_${'e'.repeat(32)}`;
const WANTED_REF = `rsw_${'f'.repeat(32)}`;
const PHOTO_ID = `rs_${'1'.repeat(32)}`;

function summary(overrides: Partial<DeviceAssetSummaryV1> = {}): DeviceAssetSummaryV1 {
  return {
    assetRef: ASSET_REF,
    name: 'MacBook Air M1',
    category: 'laptop',
    brand: 'Apple',
    model: null,
    condition: 'like_new',
    status: 'owned',
    purchasedOn: null,
    purchasePrice: null,
    warrantyUntil: null,
    estimate: null,
    linkedDeviceRef: null,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}
function assetView(overrides: Partial<DeviceAssetViewV1> = {}): DeviceAssetViewV1 {
  return { ...summary(), privateState: 'none', private: null, sellable: true, rentable: null, ...overrides };
}
function listingView(overrides: Partial<ResaleListingOwnerViewV1> = {}): ResaleListingOwnerViewV1 {
  return {
    schemaVersion: 1,
    listingRef: LISTING_REF,
    assetRef: ASSET_REF,
    status: 'draft',
    title: null,
    description: null,
    category: 'laptop',
    condition: 'like_new',
    asking: null,
    floor: null,
    area: null,
    handover: null,
    faq: [],
    photos: [],
    twinReplies: false,
    pickupPointState: 'none',
    pickupPoint: null,
    sellerLabel: 'Sam',
    blockedContactAttempts: 0,
    publishedAt: null,
    expiresAt: null,
    reservedAt: null,
    closedAt: null,
    sold: null,
    nudge: null,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}
function cardView(overrides: Partial<ResaleDisclosureCardOwnerViewV1> = {}): ResaleDisclosureCardOwnerViewV1 {
  return {
    cardRef: CARD_REF,
    listingRef: LISTING_REF,
    listingTitle: 'MacBook Air M1 256GB',
    threadRef: THREAD_REF,
    buyerLabel: 'Bea',
    field: 'pickup_point',
    status: 'pending',
    requestedAt: AT,
    expiresAt: '2026-10-30T08:00:00.000Z',
    decidedAt: null,
    ...overrides,
  };
}
function wantedList(overrides: Partial<ResaleWantedListV1> = {}): ResaleWantedListV1 {
  return {
    schemaVersion: 1,
    items: [{ wantedRef: WANTED_REF, category: 'laptop', maxPrice: { amountMinor: 70000, currency: 'SGD' }, area: null, status: 'active', expiresAt: '2027-01-27T08:00:00.000Z', createdAt: AT }],
    matches: [],
    ...overrides,
  };
}

const ok = (body: unknown): HttpResponseV1 => ({ status: 200, headers: {}, body });
const err = (status: number, code?: string): HttpResponseV1 => ({ status, headers: {}, body: code ? { success: false, code, message: 'x' } : { message: 'x' } });

type Answer = HttpResponseV1 | Error | ((req: HttpRequestV1) => HttpResponseV1);

/** A transport answering by "<METHOD> <path after the API base>"; anything unexpected is a 500 and is recorded. */
function fakeTransport(routes: Record<string, Answer> = {}) {
  const calls: HttpRequestV1[] = [];
  const transport: HttpTransportV1 = {
    request: jest.fn(async (req: HttpRequestV1): Promise<HttpResponseV1> => {
      calls.push(req);
      const key = `${req.method} ${req.path.slice(API.length)}`;
      const answer = routes[key];
      if (answer === undefined) return err(500);
      if (answer instanceof Error) throw answer;
      return typeof answer === 'function' ? answer(req) : answer;
    }) as never,
  };
  return { transport, calls, keys: () => calls.map((c) => `${c.method} ${c.path.slice(API.length)}`) };
}

/** Upload answers in order; each is a status and a body (or an Error to throw). */
function fakeFetch(answers: Array<{ status: number; body?: unknown } | Error>) {
  const calls: Array<{ url: string; init: any }> = [];
  const impl = jest.fn(async (url: string, init: any) => {
    calls.push({ url, init });
    const answer = answers[calls.length - 1] ?? { status: 500 };
    if (answer instanceof Error) throw answer;
    return { status: answer.status, text: async () => (answer.body === undefined ? '' : JSON.stringify(answer.body)) };
  });
  return { fetchImpl: impl as unknown as typeof fetch, calls };
}

class RecordingFormData {
  parts: Array<[string, unknown]> = [];
  append(name: string, value: unknown) {
    this.parts.push([name, value]);
  }
}
const realFormData = (globalThis as any).FormData;
beforeEach(() => {
  (globalThis as any).FormData = RecordingFormData;
});
afterEach(() => {
  (globalThis as any).FormData = realFormData;
});

function makeClient(routes: Record<string, Answer> = {}, uploads: Array<{ status: number; body?: unknown } | Error> = [], token: string | null = 'tok') {
  const t = fakeTransport(routes);
  const f = fakeFetch(uploads);
  const tokenFn = jest.fn(() => token);
  const client = createMobileDeviceAssetsClient({ transport: t.transport, baseUrl: BASE, token: tokenFn, fetchImpl: f.fetchImpl, enabled: true });
  return { client, ...t, uploads: f.calls, tokenFn };
}

const PHOTO = { uri: 'file:///cache/a.jpg', mimeType: 'image/jpeg', fileName: 'a.jpg', fileSize: 1_000_000 };

function loadWithEnv(value: string | undefined): Mod {
  const before = process.env.EXPO_PUBLIC_DEVICE_ASSETS_ENABLED;
  if (value === undefined) delete process.env.EXPO_PUBLIC_DEVICE_ASSETS_ENABLED;
  else process.env.EXPO_PUBLIC_DEVICE_ASSETS_ENABLED = value;
  let mod: Mod | undefined;
  try {
    jest.isolateModules(() => {
      mod = require('../deviceAssets') as Mod;
    });
  } finally {
    if (before === undefined) delete process.env.EXPO_PUBLIC_DEVICE_ASSETS_ENABLED;
    else process.env.EXPO_PUBLIC_DEVICE_ASSETS_ENABLED = before;
  }
  return mod as Mod;
}

/** Every method once, with valid arguments. */
async function callEverything(client: MobileDeviceAssetsClient) {
  return Promise.all([
    client.listThings(),
    client.getThing(ASSET_REF),
    client.addThing({ name: 'Sofa', category: 'furniture', condition: 'good' }),
    client.listListings(),
    client.createDraft(ASSET_REF),
    client.addPhoto(LISTING_REF, PHOTO),
    client.setPrice(LISTING_REF, { askingMinor: 65000, floorMinor: 48000 }),
    client.listCards({ status: 'pending' }),
    client.decideCard(CARD_REF, { decision: 'approve', value: 'Tampines MRT exit A' }),
    client.listWanted(),
    client.addWanted({ category: 'laptop', maxPrice: null, area: null }),
    client.pauseWanted(WANTED_REF),
    client.resumeWanted(WANTED_REF),
    client.removeWanted(WANTED_REF),
  ]);
}

describe('the build switch (EXPO_PUBLIC_DEVICE_ASSETS_ENABLED)', () => {
  it('is on only for exactly 1', () => {
    expect(deviceAssetsEnabled('1')).toBe(true);
    for (const value of [undefined, null, '', '0', 'true', 'TRUE', '1 ', ' 1', 1, true]) expect(deviceAssetsEnabled(value)).toBe(false);
  });

  it.each([undefined, '', '0', 'true', 'TRUE', '1 ', ' 1'])('off (%p): no row on the devices page, and not one request, token read or upload', async (value) => {
    const mod = loadWithEnv(value);
    expect(mod.DEVICE_ASSETS_MOBILE_ENABLED).toBe(false);
    expect(mod.myDevicesThingsEntry()).toBeNull();
    const t = fakeTransport({});
    const f = fakeFetch([]);
    const token = jest.fn(() => 'tok');
    const client = mod.createMobileDeviceAssetsClient({ transport: t.transport, baseUrl: BASE, token, fetchImpl: f.fetchImpl });
    const results = await callEverything(client);
    for (const result of results) expect(result).toEqual({ ok: false, failure: 'off' });
    await expect(mod.addThingWithPhotos(client, { thing: { name: 'Sofa', category: 'furniture', condition: 'good' }, sell: { photos: [PHOTO], price: { askingMinor: 10000 } } })).resolves.toEqual({
      ok: false,
      failure: 'off',
    });
    expect(t.calls).toHaveLength(0);
    expect(f.calls).toHaveLength(0);
    expect(token).not.toHaveBeenCalled();
  });

  it('on (1): the build constant is true and the devices page gains exactly one row', () => {
    const mod = loadWithEnv('1');
    expect(mod.DEVICE_ASSETS_MOBILE_ENABLED).toBe(true);
    expect(mod.myDevicesThingsEntry()).toMatchObject({ route: 'MyThings', label: { zh: '我的东西', en: 'My things' } });
    expect(myDevicesThingsEntry(false)).toBeNull();
  });
});

describe('reads (shared decoders)', () => {
  it('lists the things with the session token and the mobile surface header, and unwraps { success, data }', async () => {
    const list = { schemaVersion: 1, items: [summary()], privateFieldsEnabled: true };
    const { client, calls } = makeClient({ 'GET /device-assets/items?limit=200': ok({ success: true, data: list }) });
    await expect(client.listThings({ limit: 200 })).resolves.toEqual({ ok: true, value: list });
    expect(calls[0]).toMatchObject({ method: 'GET', path: `${API}/device-assets/items?limit=200` });
    expect(calls[0].headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' });
  });

  it('a 200 that does not decode is unreadable: an unknown key (a private field in a list row), a missing key, a wrong ref', async () => {
    for (const items of [[{ ...summary(), serialNumber: 'C02XYZ' }], [{ ...summary(), name: undefined }], [summary({ assetRef: 'das_123' })]]) {
      const { client } = makeClient({ 'GET /device-assets/items': ok({ schemaVersion: 1, items, privateFieldsEnabled: false }) });
      await expect(client.listThings()).resolves.toEqual({ ok: false, failure: 'unreadable' });
    }
    // A detail that carries private values without `sealed`.
    const { client } = makeClient({ [`GET /device-assets/items/${ASSET_REF}`]: ok(assetView({ private: { serialNumber: 'X', imei: null, receiptRef: null, notes: null } })) });
    await expect(client.getThing(ASSET_REF)).resolves.toEqual({ ok: false, failure: 'unreadable' });
  });

  it('404 is closed, 401 no session, 503 unavailable, a throw is network; no session or a bad ref sends nothing', async () => {
    const route = 'GET /device-assets/items';
    await expect(makeClient({ [route]: err(404) }).client.listThings()).resolves.toEqual({ ok: false, failure: 'closed' });
    await expect(makeClient({ [route]: err(401) }).client.listThings()).resolves.toEqual({ ok: false, failure: 'no_session' });
    await expect(makeClient({ [route]: err(503, 'device_assets_unavailable') }).client.listThings()).resolves.toEqual({ ok: false, failure: 'unavailable' });
    await expect(makeClient({ [route]: new Error('offline') }).client.listThings()).resolves.toEqual({ ok: false, failure: 'network' });
    const signedOut = makeClient({ [route]: ok({}) }, [], null);
    await expect(signedOut.client.listThings()).resolves.toEqual({ ok: false, failure: 'no_session' });
    expect(signedOut.calls).toHaveLength(0);
    const badRef = makeClient({});
    for (const ref of ['das_123', `../${ASSET_REF}`, ASSET_REF.toUpperCase()]) await expect(badRef.client.getThing(ref)).resolves.toEqual({ ok: false, failure: 'closed' });
    expect(badRef.calls).toHaveLength(0);
  });

  it('maps the server codes the screens explain', () => {
    expect(deviceAssetsMobileFailureOf(409, { code: 'card_decided' })).toBe('card_decided');
    expect(deviceAssetsMobileFailureOf(409, { code: 'card_expired' })).toBe('card_expired');
    expect(deviceAssetsMobileFailureOf(409, { code: 'listing_not_open' })).toBe('listing_not_open');
    expect(deviceAssetsMobileFailureOf(409, { code: 'wanted_limit' })).toBe('wanted_limit');
    expect(deviceAssetsMobileFailureOf(409, { code: 'asset_limit' })).toBe('asset_limit');
    expect(deviceAssetsMobileFailureOf(400, { code: 'message_contains_contact' })).toBe('message_contains_contact');
    expect(deviceAssetsMobileFailureOf(400, { code: 'invalid_input' })).toBe('invalid_input');
    expect(deviceAssetsMobileFailureOf(413, undefined)).toBe('photo_invalid');
    expect(deviceAssetsMobileFailureOf(503, { code: 'OWNER_DATA_KEYS_UNAVAILABLE' })).toBe('keys_unavailable');
    expect(deviceAssetsMobileFailureOf(429, {})).toBe('rate_limited');
    expect(deviceAssetsMobileFailureOf(409, { code: 'something_else' })).toBe('failed');
  });
});

describe('adding a thing', () => {
  it('checks the input with the shared validator first and never sends an invalid one', async () => {
    const { client, calls } = makeClient({});
    await expect(client.addThing({ name: '  ', category: 'phone', condition: 'good' })).resolves.toEqual({ ok: false, failure: 'invalid_input' });
    await expect(client.addThing({ name: 'Phone', category: 'car' as never, condition: 'good' })).resolves.toEqual({ ok: false, failure: 'invalid_input' });
    await expect(client.addThing({ name: 'Phone', category: 'phone', condition: 'good', status: 'sold' })).resolves.toEqual({ ok: false, failure: 'invalid_input' });
    await expect(client.addThing({ name: 'Phone', category: 'phone', condition: 'good', owner: 'u1' } as never)).resolves.toEqual({ ok: false, failure: 'invalid_input' });
    expect(calls).toHaveLength(0);
  });

  it('sends the cleaned input and reads the answer with the shared view decoder', async () => {
    const { client, calls } = makeClient({ 'POST /device-assets/items': ok(assetView()) });
    await expect(client.addThing({ name: '  MacBook Air M1 ', category: 'laptop', condition: 'like_new' })).resolves.toEqual({ ok: true, value: assetView() });
    expect(calls[0].body).toEqual({ name: 'MacBook Air M1', category: 'laptop', condition: 'like_new' });
  });
});

describe('photos and the price on a draft', () => {
  it('uploads one photo as multipart with the session token, through fetch', async () => {
    const withPhoto = listingView({ photos: [{ photoId: PHOTO_ID, url: `/uploads/resale/${PHOTO_ID}.jpg` }] });
    const { client, uploads, calls } = makeClient({}, [{ status: 200, body: withPhoto }]);
    await expect(client.addPhoto(LISTING_REF, PHOTO)).resolves.toEqual({ ok: true, value: withPhoto });
    expect(calls).toHaveLength(0);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].url).toBe(`${API}/resale/listings/${LISTING_REF}/photos`);
    expect(uploads[0].init.method).toBe('POST');
    expect(uploads[0].init.headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' });
    expect((uploads[0].init.body as RecordingFormData).parts).toEqual([['file', { uri: PHOTO.uri, name: 'photo.jpg', type: 'image/jpeg' }]]);
  });

  it('refuses a photo the server would not take before sending it; maps 413 and a throw', async () => {
    const { client, uploads } = makeClient({}, []);
    for (const photo of [{ ...PHOTO, mimeType: 'image/heic' }, { ...PHOTO, fileSize: 9 * 1024 * 1024 }, { ...PHOTO, uri: '' }]) {
      await expect(client.addPhoto(LISTING_REF, photo)).resolves.toEqual({ ok: false, failure: 'photo_invalid' });
    }
    await expect(client.addPhoto('rsl_nope', PHOTO)).resolves.toEqual({ ok: false, failure: 'closed' });
    expect(uploads).toHaveLength(0);
    expect(deviceAssetsPhotoType({ uri: 'file:///a.png', mimeType: 'image/png' })).toBe('image/png');
    expect(deviceAssetsPhotoType({ uri: 'file:///a', mimeType: null })).toBe('image/jpeg');
    expect(deviceAssetsPhotoType({ uri: 'file:///a', mimeType: 'image/jpg' })).toBe('image/jpeg');
    await expect(makeClient({}, [{ status: 413 }]).client.addPhoto(LISTING_REF, PHOTO)).resolves.toEqual({ ok: false, failure: 'photo_invalid' });
    await expect(makeClient({}, [{ status: 409, body: { code: 'photo_limit', message: 'x' } }]).client.addPhoto(LISTING_REF, PHOTO)).resolves.toEqual({ ok: false, failure: 'photo_limit' });
    await expect(makeClient({}, [new Error('offline')]).client.addPhoto(LISTING_REF, PHOTO)).resolves.toEqual({ ok: false, failure: 'network' });
  });

  it('sets the asking price (and the lowest price only when given); a lowest price above the asking price is never sent', async () => {
    const route = `PATCH /resale/listings/${LISTING_REF}`;
    const priced = listingView({ asking: { amountMinor: 65000, currency: 'SGD' } });
    const a = makeClient({ [route]: ok(priced) });
    await expect(a.client.setPrice(LISTING_REF, { askingMinor: 65000 })).resolves.toEqual({ ok: true, value: priced });
    expect(a.calls[0].body).toEqual({ asking: { amountMinor: 65000, currency: 'SGD' } });
    const b = makeClient({ [route]: ok(priced) });
    await b.client.setPrice(LISTING_REF, { askingMinor: 65000, floorMinor: 48000 });
    expect(b.calls[0].body).toEqual({ asking: { amountMinor: 65000, currency: 'SGD' }, floor: { amountMinor: 48000, currency: 'SGD' } });
    const c = makeClient({ [route]: ok(priced) });
    await expect(c.client.setPrice(LISTING_REF, { askingMinor: 48000, floorMinor: 65000 })).resolves.toEqual({ ok: false, failure: 'invalid_input' });
    await expect(c.client.setPrice(LISTING_REF, { askingMinor: 50 })).resolves.toEqual({ ok: false, failure: 'invalid_input' });
    expect(c.calls).toHaveLength(0);
  });
});

describe('photograph one thing (addThingWithPhotos)', () => {
  const thing = { name: 'MacBook Air M1', category: 'laptop' as const, condition: 'like_new' as const };
  const withPhotos = (n: number) => listingView({ photos: Array.from({ length: n }, (_, i) => ({ photoId: `rs_${String(i + 1).repeat(32)}`, url: `/uploads/resale/p${i}.jpg` })) });

  it('records it, makes the draft, sends each photo, then sets the price; nothing is published', async () => {
    const priced = listingView({ ...withPhotos(2), asking: { amountMinor: 65000, currency: 'SGD' }, floor: { amountMinor: 48000, currency: 'SGD' } });
    const env = makeClient(
      {
        'POST /device-assets/items': ok(assetView()),
        'POST /resale/listings': ok(listingView()),
        [`PATCH /resale/listings/${LISTING_REF}`]: ok(priced),
      },
      [{ status: 200, body: withPhotos(1) }, { status: 200, body: withPhotos(2) }],
    );
    const outcome = await addThingWithPhotos(env.client, { thing, sell: { photos: [PHOTO, { ...PHOTO, uri: 'file:///cache/b.jpg' }], price: { askingMinor: 65000, floorMinor: 48000 } } });
    expect(outcome).toEqual({ ok: true, asset: assetView(), listing: priced, draftFailure: null, photosSent: 2, photosFailed: 0, priceFailure: null });
    expect(env.keys()).toEqual(['POST /device-assets/items', 'POST /resale/listings', `PATCH /resale/listings/${LISTING_REF}`]);
    expect(env.calls[1].body).toEqual({ assetRef: ASSET_REF });
    expect(env.uploads).toHaveLength(2);
    expect(env.keys().some((key) => /publish/.test(key))).toBe(false);
  });

  it('only records it when nothing is to be sold', async () => {
    const env = makeClient({ 'POST /device-assets/items': ok(assetView()) });
    await expect(addThingWithPhotos(env.client, { thing, sell: null })).resolves.toMatchObject({ ok: true, listing: null, draftFailure: null, photosSent: 0 });
    expect(env.keys()).toEqual(['POST /device-assets/items']);
  });

  it('selling closed on the server: the record stays, no photo or price is sent', async () => {
    const env = makeClient({ 'POST /device-assets/items': ok(assetView()), 'POST /resale/listings': err(404) }, [{ status: 200, body: withPhotos(1) }]);
    await expect(addThingWithPhotos(env.client, { thing, sell: { photos: [PHOTO], price: { askingMinor: 65000 } } })).resolves.toEqual({
      ok: true,
      asset: assetView(),
      listing: null,
      draftFailure: 'closed',
      photosSent: 0,
      photosFailed: 0,
      priceFailure: null,
    });
    expect(env.keys()).toEqual(['POST /device-assets/items', 'POST /resale/listings']);
    expect(env.uploads).toHaveLength(0);
  });

  it('a refused record stops everything', async () => {
    const env = makeClient({ 'POST /device-assets/items': err(409, 'asset_limit') }, [{ status: 200, body: withPhotos(1) }]);
    await expect(addThingWithPhotos(env.client, { thing, sell: { photos: [PHOTO], price: null } })).resolves.toEqual({ ok: false, failure: 'asset_limit' });
    expect(env.keys()).toEqual(['POST /device-assets/items']);
    expect(env.uploads).toHaveLength(0);
  });

  it('stops sending photos at the photo limit and still sets the price', async () => {
    const env = makeClient(
      { 'POST /device-assets/items': ok(assetView()), 'POST /resale/listings': ok(listingView()), [`PATCH /resale/listings/${LISTING_REF}`]: ok(withPhotos(1)) },
      [{ status: 200, body: withPhotos(1) }, { status: 409, body: { code: 'photo_limit', message: 'x' } }, { status: 200, body: withPhotos(2) }],
    );
    const outcome = await addThingWithPhotos(env.client, { thing, sell: { photos: [PHOTO, PHOTO, PHOTO], price: { askingMinor: 65000 } } });
    expect(outcome).toMatchObject({ ok: true, photosSent: 1, photosFailed: 2, priceFailure: null });
    expect(env.uploads).toHaveLength(2);
  });
});

describe('approval cards: only `decision` and `value` are ever sent', () => {
  const route = `POST /resale/disclosure-cards/${CARD_REF}/decision`;

  it('approve with the place typed in, approve without (the preset pickup point), deny', async () => {
    const approved = cardView({ status: 'approved', decidedAt: AT });
    const a = makeClient({ [route]: ok(approved) });
    const input = { decision: 'approve', value: ' Tampines MRT exit A ', always: true, remember: true } as never;
    await expect(a.client.decideCard(CARD_REF, input)).resolves.toEqual({ ok: true, value: approved });
    expect(a.calls[0].body).toEqual({ decision: 'approve', value: 'Tampines MRT exit A' });
    expect(Object.keys(a.calls[0].body as object).sort()).toEqual(['decision', 'value']);
    const b = makeClient({ [route]: ok(approved) });
    await b.client.decideCard(CARD_REF, { decision: 'approve', value: '   ' });
    expect(b.calls[0].body).toEqual({ decision: 'approve' });
    const c = makeClient({ [route]: ok(cardView({ status: 'denied', decidedAt: AT })) });
    await c.client.decideCard(CARD_REF, { decision: 'deny' });
    expect(c.calls[0].body).toEqual({ decision: 'deny' });
  });

  it('never sends a deny with a value, a link, an unknown decision or a bad card ref', async () => {
    const { client, calls } = makeClient({ [route]: ok(cardView()) });
    await expect(client.decideCard(CARD_REF, { decision: 'deny', value: 'Tampines' })).resolves.toEqual({ ok: false, failure: 'invalid_input' });
    await expect(client.decideCard(CARD_REF, { decision: 'approve', value: 'see https://evil.top/map' })).resolves.toEqual({ ok: false, failure: 'message_contains_contact' });
    await expect(client.decideCard(CARD_REF, { decision: 'always' as never })).resolves.toEqual({ ok: false, failure: 'invalid_input' });
    await expect(client.decideCard(`rsd_${'z'.repeat(32)}`, { decision: 'approve' })).resolves.toEqual({ ok: false, failure: 'closed' });
    expect(calls).toHaveLength(0);
  });

  it('reads the answer as one card, key by key: a card that carries the value is unreadable', async () => {
    await expect(makeClient({ [route]: ok({ ...cardView({ status: 'approved', decidedAt: AT }), value: 'Tampines' }) }).client.decideCard(CARD_REF, { decision: 'approve' })).resolves.toEqual({
      ok: false,
      failure: 'unreadable',
    });
    await expect(makeClient({ [route]: err(409, 'card_decided') }).client.decideCard(CARD_REF, { decision: 'approve' })).resolves.toEqual({ ok: false, failure: 'card_decided' });
    await expect(makeClient({ [route]: err(409, 'card_expired') }).client.decideCard(CARD_REF, { decision: 'deny' })).resolves.toEqual({ ok: false, failure: 'card_expired' });
  });

  it('lists the pending cards', async () => {
    const list = { schemaVersion: 1, items: [cardView()] };
    const { client, calls } = makeClient({ 'GET /resale/disclosure-cards?status=pending': ok(list) });
    await expect(client.listCards({ status: 'pending' })).resolves.toEqual({ ok: true, value: list });
    expect(calls).toHaveLength(1);
  });
});

describe("I'm looking for", () => {
  it('sends only the category, the top price and the area; never free text', async () => {
    const { client, calls } = makeClient({ 'POST /resale/wanted': ok(wantedList()) });
    await expect(client.addWanted({ category: 'laptop', maxPrice: { amountMinor: 70000, currency: 'SGD' }, area: 'east', note: 'for my kid' } as never)).resolves.toEqual({
      ok: false,
      failure: 'invalid_input',
    });
    expect(calls).toHaveLength(0);
    await expect(client.addWanted({ category: 'laptop', maxPrice: { amountMinor: 70000, currency: 'SGD' }, area: 'east' })).resolves.toEqual({ ok: true, value: wantedList() });
    expect(calls[0].body).toEqual({ category: 'laptop', maxPrice: { amountMinor: 70000, currency: 'SGD' }, area: 'east' });
  });

  it('pauses, resumes and deletes by ref; a bad ref sends nothing', async () => {
    const env = makeClient({
      [`POST /resale/wanted/${WANTED_REF}/pause`]: ok(wantedList()),
      [`POST /resale/wanted/${WANTED_REF}/resume`]: ok(wantedList()),
      [`DELETE /resale/wanted/${WANTED_REF}`]: ok({ success: true, data: { deleted: true } }),
    });
    await expect(env.client.pauseWanted(WANTED_REF)).resolves.toMatchObject({ ok: true });
    await expect(env.client.resumeWanted(WANTED_REF)).resolves.toMatchObject({ ok: true });
    await expect(env.client.removeWanted(WANTED_REF)).resolves.toEqual({ ok: true, value: true });
    expect(env.keys()).toEqual([`POST /resale/wanted/${WANTED_REF}/pause`, `POST /resale/wanted/${WANTED_REF}/resume`, `DELETE /resale/wanted/${WANTED_REF}`]);
    const bad = makeClient({});
    await expect(bad.client.pauseWanted('rsw_1')).resolves.toEqual({ ok: false, failure: 'closed' });
    await expect(bad.client.removeWanted('../x')).resolves.toEqual({ ok: false, failure: 'closed' });
    expect(bad.calls).toHaveLength(0);
    await expect(makeClient({ 'POST /resale/wanted': err(409, 'wanted_limit') }).client.addWanted({ category: 'phone', maxPrice: null, area: null })).resolves.toEqual({
      ok: false,
      failure: 'wanted_limit',
    });
  });
});

describe('small helpers', () => {
  it('reads Singapore dollars', () => {
    expect(parseDeviceAssetsSgd('650')).toBe(65000);
    expect(parseDeviceAssetsSgd(' 650.5 ')).toBe(65050);
    expect(parseDeviceAssetsSgd('S$650.50')).toBe(65050);
    for (const bad of ['', '-5', '1.234', 'abc', '12345678', '6 50']) expect(parseDeviceAssetsSgd(bad)).toBeNull();
    expect(formatDeviceAssetsMoney({ amountMinor: 65000, currency: 'SGD' })).toBe('S$650');
    expect(formatDeviceAssetsMoney({ amountMinor: 65050, currency: 'SGD' })).toBe('S$650.50');
    expect(formatDeviceAssetsMoney(null)).toBeNull();
  });

  it('shows the open listing of a thing first, else the latest one', () => {
    const sold = listingView({ listingRef: `rsl_${'1'.repeat(32)}`, status: 'sold', updatedAt: '2026-10-28T00:00:00.000Z' });
    const withdrawn = listingView({ listingRef: `rsl_${'2'.repeat(32)}`, status: 'withdrawn', updatedAt: '2026-10-29T00:00:00.000Z' });
    const draft = listingView({ status: 'draft' });
    const other = listingView({ assetRef: `das_${'9'.repeat(32)}`, status: 'published' });
    expect(deviceAssetsListingFor([sold, other, draft, withdrawn], ASSET_REF)).toBe(draft);
    expect(deviceAssetsListingFor([sold, withdrawn, other], ASSET_REF)).toBe(withdrawn);
    expect(deviceAssetsListingFor([other], ASSET_REF)).toBeNull();
  });
});

describe('screens and navigation (source guards; this jest has no React Native renderer)', () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', rel), 'utf8');
  const SCREENS = ['MyThingsScreen', 'AddThingScreen', 'ThingDetailScreen', 'DisclosureCardsScreen', 'WantedScreen'];

  it('the devices page renders its extra row only behind the switch, and nothing else changes', () => {
    const screen = read('screens/four-zone/MyDevicesScreen.tsx');
    expect(screen).toContain('const thingsEntry = myDevicesThingsEntry();');
    const gate = screen.indexOf('{thingsEntry ? (');
    const row = screen.indexOf('testID="my-devices-my-things"');
    const end = screen.indexOf(') : null}', gate);
    expect(gate).toBeGreaterThan(0);
    expect(row).toBeGreaterThan(gate);
    expect(row).toBeLessThan(end);
    expect(screen.split('my-devices-my-things').length - 1).toBe(1);
    // No other read of the switch, no request, no new query on the devices page.
    expect(screen).not.toMatch(/DEVICE_ASSETS_MOBILE_ENABLED|EXPO_PUBLIC_DEVICE_ASSETS_ENABLED|mobileDeviceAssetsClient|device-assets/);
  });

  it('the five screens are registered only inside the switch in the Me stack', () => {
    const stack = read('navigation/MeStackNavigator.tsx');
    const gate = stack.indexOf('{DEVICE_ASSETS_MOBILE_ENABLED ? (');
    const end = stack.indexOf(') : null}', gate);
    expect(gate).toBeGreaterThan(0);
    for (const name of ['MyThings', 'AddThing', 'ThingDetail', 'DisclosureCards', 'Wanted']) {
      const at = stack.indexOf(`name="${name}"`);
      expect([name, at > gate && at < end]).toEqual([name, true]);
      expect(stack.split(`name="${name}"`).length - 1).toBe(1);
    }
    expect(stack).toContain("import { DEVICE_ASSETS_MOBILE_ENABLED } from '../services/deviceAssets';");
  });

  it('the service has no React Native or Expo import; the screens only talk to the server through it', () => {
    expect(read('services/deviceAssets.ts')).not.toMatch(/from 'react-native'|from 'expo-/);
    for (const name of SCREENS) {
      const source = read(`screens/four-zone/${name}.tsx`);
      expect([name, /(^|[^A-Za-z])fetch\(|transport\.request|apiFetch|axios/m.test(source)]).toEqual([name, false]);
      expect([name, /mobileDeviceAssetsClient\(\)/.test(source)]).toEqual([name, true]);
    }
  });

  it('the phone never asks for or shows a private field, and never publishes', () => {
    const add = read('screens/four-zone/AddThingScreen.tsx');
    expect(add).toContain('thing: { name: trimmed, category, condition }');
    expect(add).not.toMatch(/private\s*:|serialNumber|imei:/);
    const detail = read('screens/four-zone/ThingDetailScreen.tsx');
    expect(detail).not.toMatch(/view\.private\b|\.serialNumber|\.imei|\.receiptRef|\.notes/);
    for (const name of SCREENS) expect([name, /publish\(|\/publish/.test(read(`screens/four-zone/${name}.tsx`))]).toEqual([name, false]);
  });

  it('the cards screen decides one card at a time with only decision and value', () => {
    const cards = read('screens/four-zone/DisclosureCardsScreen.tsx');
    expect(cards).toContain('client.decideCard(card.cardRef, value ? { decision, value } : { decision })');
    expect(cards).not.toMatch(/always\s*:|remember\s*:/);
  });
});
