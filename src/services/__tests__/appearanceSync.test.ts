/**
 * Appearance preference sync (REQ-backend-014, shared/types/appearance-preference.ts):
 * default value, partial state, pull / push, 409 with and without `current`,
 * invalid values never written locally, failures keep the local choice.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import { DEFAULT_APPEARANCE, type Appearance } from '../../../shared/design-tokens';
import {
  APPEARANCE_SYNC_STORAGE_KEY,
  isLocalChangeNewer,
  readAppearancePreferenceBody,
  readAppearanceSyncState,
  recordLocalAppearanceChange,
  serializeAppearanceSyncState,
  syncAppearanceWithServer,
  type AppearanceSyncState,
} from '../appearanceSync';

const BASE = 'https://api.example.test/api';
const URL = `${BASE}/users/me/appearance`;

const pref = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  mode: 'light',
  accent: 'ink',
  revision: 4,
  updatedAt: '2026-09-28T10:00:00.000Z',
  source: 'owner',
  ...overrides,
});
// The shared default (light + 晴空蓝 since E83); tests follow it instead of repeating it.
const DEFAULT_PREF = { schemaVersion: 1, mode: DEFAULT_APPEARANCE.mode, accent: DEFAULT_APPEARANCE.accent, revision: 0, updatedAt: null, source: 'default' };

type Reply = { status: number; body?: unknown } | 'throw';

function harness(local: Appearance, state: AppearanceSyncState, replies: Reply[], token: string | null = 'tok') {
  const calls: HttpRequestV1[] = [];
  const applied: Appearance[] = [];
  const written: AppearanceSyncState[] = [];
  let current = local;
  let stored = state;
  const transport: HttpTransportV1 = {
    async request(request: HttpRequestV1): Promise<HttpResponseV1> {
      calls.push(request);
      const reply = replies.shift();
      if (!reply) return { status: 599, headers: {}, body: undefined };
      if (reply === 'throw') throw new Error('offline');
      return { status: reply.status, headers: {}, body: reply.body };
    },
  };
  const deps = {
    getLocal: () => current,
    applyLocal: (next: Appearance) => {
      current = next;
      applied.push(next);
    },
    readState: () => stored,
    writeState: (next: AppearanceSyncState) => {
      stored = next;
      written.push(next);
    },
    baseUrl: `${BASE}/`,
    token,
    transport,
  };
  return { deps, calls, applied, written, local: () => current, state: () => stored };
}

const clean = (revision: number): AppearanceSyncState => ({ revision, dirty: false, changedAt: null });
const dirty = (revision: number, changedAt: string | null): AppearanceSyncState => ({ revision, dirty: true, changedAt });

describe('state', () => {
  it('no stored state: the default is clean, a non-default (migrated) value is an unuploaded change without a time', () => {
    expect(readAppearanceSyncState(undefined, { ...DEFAULT_APPEARANCE })).toEqual({ revision: 0, dirty: false, changedAt: null });
    expect(readAppearanceSyncState(null, { mode: 'light', accent: 'obsidian-cyan' })).toEqual({ revision: 0, dirty: true, changedAt: null });
  });

  it('round-trips and repairs bad fields', () => {
    const s = recordLocalAppearanceChange(clean(3), new Date('2026-09-28T11:00:00Z'));
    expect(s).toEqual({ revision: 3, dirty: true, changedAt: '2026-09-28T11:00:00.000Z' });
    expect(readAppearanceSyncState(serializeAppearanceSyncState(s), { mode: 'dark', accent: 'ink' })).toEqual(s);
    expect(readAppearanceSyncState('{"revision":-2,"dirty":"yes","changedAt":"soon"}', { mode: 'dark', accent: 'ink' })).toEqual({ revision: 0, dirty: false, changedAt: null });
    expect(readAppearanceSyncState('not json', { ...DEFAULT_APPEARANCE })).toEqual({ revision: 0, dirty: false, changedAt: null });
    expect(APPEARANCE_SYNC_STORAGE_KEY).toBe('app_appearance_sync_v1');
  });

  it('newer-than compares with the server time; no local time is never newer', () => {
    expect(isLocalChangeNewer('2026-09-28T11:00:00Z', '2026-09-28T10:00:00Z')).toBe(true);
    expect(isLocalChangeNewer('2026-09-28T09:00:00Z', '2026-09-28T10:00:00Z')).toBe(false);
    expect(isLocalChangeNewer('2026-09-28T09:00:00Z', null)).toBe(true);
    expect(isLocalChangeNewer(null, null)).toBe(false);
  });

  it('reads a preference body through the contract normaliser; garbage is not "the default"', () => {
    expect(readAppearancePreferenceBody(pref())).toMatchObject({ mode: 'light', accent: 'ink', revision: 4, source: 'owner' });
    expect(readAppearancePreferenceBody({ success: true, data: pref({ revision: 2 }) })).toMatchObject({ revision: 2 });
    expect(readAppearancePreferenceBody(pref({ mode: 'neon', accent: 'gold' }))).toMatchObject({ mode: DEFAULT_APPEARANCE.mode, accent: DEFAULT_APPEARANCE.accent, revision: 4 });
    expect(readAppearancePreferenceBody(DEFAULT_PREF)).toMatchObject({ revision: 0, source: 'default' });
    expect(readAppearancePreferenceBody({ message: 'oops' })).toBeNull();
    expect(readAppearancePreferenceBody('x')).toBeNull();
  });
});

describe('sync', () => {
  it('signed out: nothing is sent', async () => {
    const h = harness({ mode: 'dark', accent: 'ink' }, dirty(0, '2026-09-28T11:00:00Z'), [], null);
    await expect(syncAppearanceWithServer(h.deps)).resolves.toEqual({ kind: 'local_only', reason: 'signed_out' });
    expect(h.calls).toHaveLength(0);
  });

  it('clean local: GET, adopt the server value, remember its revision', async () => {
    const h = harness({ mode: 'system', accent: 'obsidian-cyan' }, clean(0), [{ status: 200, body: pref() }]);
    await expect(syncAppearanceWithServer(h.deps)).resolves.toEqual({ kind: 'pulled', changed: true, revision: 4 });
    expect(h.calls[0]).toMatchObject({ method: 'GET', path: URL });
    expect(h.calls[0].headers).toMatchObject({ Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' });
    expect(h.local()).toEqual({ mode: 'light', accent: 'ink' });
    expect(h.state()).toEqual(clean(4));
  });

  it('server never stored anything: the default is kept, nothing is uploaded', async () => {
    const h = harness({ ...DEFAULT_APPEARANCE }, clean(0), [{ status: 200, body: DEFAULT_PREF }]);
    await expect(syncAppearanceWithServer(h.deps)).resolves.toEqual({ kind: 'pulled', changed: false, revision: 0 });
    expect(h.calls).toHaveLength(1);
    expect(h.applied).toHaveLength(0);
  });

  it('a server still on the old default (revision 0, 跟随系统 + 曜石青) is not a choice: the phone keeps its own default and stores nothing (E83, I-050)', async () => {
    // 1.4.0 against a backend deployed before the default changed: revision 0 means "never stored", whatever values it carries.
    const oldDefault = { schemaVersion: 1, mode: 'system', accent: 'obsidian-cyan', revision: 0, updatedAt: null, source: 'default' };
    const h = harness({ ...DEFAULT_APPEARANCE }, clean(0), [{ status: 200, body: oldDefault }]);
    await expect(syncAppearanceWithServer(h.deps)).resolves.toEqual({ kind: 'pulled', changed: false, revision: 0 });
    expect(h.applied).toHaveLength(0);
    expect(h.local()).toEqual(DEFAULT_APPEARANCE);
    // The same values stored by the owner (revision > 0) are a choice and are adopted.
    const chosen = harness({ ...DEFAULT_APPEARANCE }, clean(0), [{ status: 200, body: { ...oldDefault, revision: 3, updatedAt: '2026-09-20T00:00:00Z', source: 'owner' } }]);
    await expect(syncAppearanceWithServer(chosen.deps)).resolves.toEqual({ kind: 'pulled', changed: true, revision: 3 });
    expect(chosen.local()).toEqual({ mode: 'system', accent: 'obsidian-cyan' });
  });

  it('unknown values from the server fall back field by field and are never written as-is', async () => {
    const h = harness({ mode: 'dark', accent: 'ink' }, clean(1), [{ status: 200, body: pref({ mode: 'dark', accent: '<script>' }) }]);
    await syncAppearanceWithServer(h.deps);
    expect(h.local()).toEqual({ mode: 'dark', accent: DEFAULT_APPEARANCE.accent });
  });

  it('local change: PUT both fields with expectedRevision, adopt the saved value', async () => {
    const h = harness({ mode: 'dark', accent: 'sky-blue' }, dirty(4, '2026-09-28T11:00:00Z'), [
      { status: 200, body: pref({ mode: 'dark', accent: 'sky-blue', revision: 5 }) },
    ]);
    await expect(syncAppearanceWithServer(h.deps)).resolves.toEqual({ kind: 'pushed', revision: 5 });
    expect(h.calls[0]).toMatchObject({ method: 'PUT', path: URL, body: { mode: 'dark', accent: 'sky-blue', expectedRevision: 4 } });
    expect(Object.keys(h.calls[0].body as object).sort()).toEqual(['accent', 'expectedRevision', 'mode']);
    expect(h.state()).toEqual(clean(5));
  });

  it('409 with `current`, server newer: the server value replaces the local one, no retry', async () => {
    const h = harness({ mode: 'dark', accent: 'sky-blue' }, dirty(4, '2026-09-28T09:00:00Z'), [
      { status: 409, body: { code: 'APPEARANCE_REVISION_CONFLICT', current: pref({ revision: 6, updatedAt: '2026-09-28T10:00:00Z' }) } },
    ]);
    await expect(syncAppearanceWithServer(h.deps)).resolves.toEqual({ kind: 'conflict_adopted', revision: 6 });
    expect(h.calls).toHaveLength(1);
    expect(h.local()).toEqual({ mode: 'light', accent: 'ink' });
    expect(h.state()).toEqual(clean(6));
  });

  it('409, local newer: one retry with the new revision', async () => {
    const h = harness({ mode: 'dark', accent: 'sky-blue' }, dirty(4, '2026-09-28T11:00:00Z'), [
      { status: 409, body: { code: 'APPEARANCE_REVISION_CONFLICT', current: pref({ revision: 6, updatedAt: '2026-09-28T10:00:00Z' }) } },
      { status: 200, body: pref({ mode: 'dark', accent: 'sky-blue', revision: 7 }) },
    ]);
    await expect(syncAppearanceWithServer(h.deps)).resolves.toEqual({ kind: 'pushed', revision: 7 });
    expect((h.calls[1].body as any).expectedRevision).toBe(6);
  });

  it('409 twice: stop retrying and take the server value', async () => {
    const h = harness({ mode: 'dark', accent: 'sky-blue' }, dirty(4, '2026-09-28T11:00:00Z'), [
      { status: 409, body: { code: 'APPEARANCE_REVISION_CONFLICT', current: pref({ revision: 6, updatedAt: '2026-09-28T10:00:00Z' }) } },
      { status: 409, body: { code: 'APPEARANCE_REVISION_CONFLICT', current: pref({ revision: 8, mode: 'system', updatedAt: '2026-09-28T11:30:00Z' }) } },
    ]);
    await expect(syncAppearanceWithServer(h.deps)).resolves.toEqual({ kind: 'conflict_adopted', revision: 8 });
    expect(h.calls.map((call) => call.method)).toEqual(['PUT', 'PUT']);
    expect(h.local()).toEqual({ mode: 'system', accent: 'ink' });
  });

  it('409 without `current` (global error filter before backend 1661a9f7): read it with a GET', async () => {
    const h = harness({ mode: 'dark', accent: 'sky-blue' }, dirty(4, '2026-09-28T09:00:00Z'), [
      { status: 409, body: { success: false, code: 'APPEARANCE_REVISION_CONFLICT', message: 'Conflict Exception' } },
      { status: 200, body: pref({ revision: 6 }) },
    ]);
    await expect(syncAppearanceWithServer(h.deps)).resolves.toEqual({ kind: 'conflict_adopted', revision: 6 });
    expect(h.calls.map((call) => call.method)).toEqual(['PUT', 'GET']);
  });

  it('400: the local value is not retried; the server value replaces it', async () => {
    const h = harness({ mode: 'dark', accent: 'sky-blue' }, dirty(4, '2026-09-28T11:00:00Z'), [
      { status: 400, body: { code: 'APPEARANCE_PREFERENCE_INVALID' } },
      { status: 200, body: pref({ revision: 4 }) },
    ]);
    await expect(syncAppearanceWithServer(h.deps)).resolves.toEqual({ kind: 'rejected_adopted', revision: 4 });
    expect(h.state()).toEqual(clean(4));
  });

  it('failures keep the local choice and keep it marked as not uploaded', async () => {
    for (const reply of ['throw', { status: 500 }, { status: 401 }, { status: 403 }, { status: 200, body: { nope: true } }] as Reply[]) {
      const start = dirty(4, '2026-09-28T11:00:00Z');
      const h = harness({ mode: 'dark', accent: 'sky-blue' }, start, [reply]);
      const outcome = await syncAppearanceWithServer(h.deps);
      expect(outcome.kind).toBe('failed');
      expect(h.local()).toEqual({ mode: 'dark', accent: 'sky-blue' });
      expect(h.state()).toEqual(start);
      expect(h.applied).toHaveLength(0);
    }
  });

  it('a 409 that is not the appearance conflict is a failure, not an adoption', async () => {
    const h = harness({ mode: 'dark', accent: 'ink' }, dirty(4, null), [{ status: 409, body: { code: 'SOMETHING_ELSE' } }]);
    await expect(syncAppearanceWithServer(h.deps)).resolves.toMatchObject({ kind: 'failed', reason: 'http_409' });
    expect(h.calls).toHaveLength(1);
  });

  it('a migrated value (no change time) is uploaded only when the server has nothing stored', async () => {
    const empty = harness({ mode: 'light', accent: 'obsidian-cyan' }, dirty(0, null), [{ status: 200, body: pref({ mode: 'light', accent: 'obsidian-cyan', revision: 1 }) }]);
    await expect(syncAppearanceWithServer(empty.deps)).resolves.toEqual({ kind: 'pushed', revision: 1 });
    expect((empty.calls[0].body as any).expectedRevision).toBe(0);
    const taken = harness({ mode: 'light', accent: 'obsidian-cyan' }, dirty(0, null), [
      { status: 409, body: { code: 'APPEARANCE_REVISION_CONFLICT', current: pref({ revision: 3 }) } },
    ]);
    await expect(syncAppearanceWithServer(taken.deps)).resolves.toEqual({ kind: 'conflict_adopted', revision: 3 });
    expect(taken.calls).toHaveLength(1);
  });
});

describe('wiring (source guards)', () => {
  const read = (...parts: string[]) => fs.readFileSync(path.resolve(__dirname, '..', '..', '..', ...parts), 'utf8');

  it('the screen changes appearance only through changeAppearance and pulls on open', () => {
    const screen = read('src', 'screens', 'four-zone', 'AppearanceScreen.tsx');
    expect(screen).not.toMatch(/setAppearance\(/);
    expect(screen.match(/changeAppearance\(/g)).toHaveLength(2);
    expect(screen).toMatch(/void syncAppearanceNow\(\);/);
  });

  it('runtime syncs only in token-themed builds and App.tsx triggers it after sign-in behind the literal flag', () => {
    const runtime = read('src', 'services', 'appearanceSyncRuntime.ts');
    expect(runtime).toMatch(/if \(!isTokenThemed\(\)\) return Promise\.resolve\(null\);/);
    const app = read('App.tsx');
    expect(app).toMatch(/if \(isFourZoneBuild && isInitialized && isAuthenticated && token\) void syncAppearanceNow\(\);/);
  });
});
