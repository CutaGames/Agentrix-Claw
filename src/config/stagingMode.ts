/**
 * stagingMode — the preview build's "连接 staging" switch (I-046 item 2; staging plan §9 / §9.2).
 *
 * Only a build made with `EXPO_PUBLIC_STAGING_SWITCH=1` (a preview APK, never the formal build) has
 * the switch. In any other build nothing here reads the device store, installs anything or changes
 * the API host: `STAGING_SWITCH_BUILD` is false and `STAGING_SELECTION` is inactive.
 *
 * In a switch build:
 * - The choice ("staging" or nothing) and the staging gate key live in SecureStore. The key is typed
 *   in by the tester at run time; it is never in the repository, the build or a log.
 * - The choice is read once, synchronously, when the JS bundle starts (`src/config/env.ts`), so every
 *   module that captured `API_BASE` at import sees the same host. Switching writes the choice and
 *   reloads the app (`stagingSwitch.ts`).
 * - A network guard wraps `XMLHttpRequest` (React Native's `fetch` is built on it) and `WebSocket`:
 *   - the `X-Agentrix-Staging-Key` header goes only to `https://stg.agentrix.top`, and only while
 *     staging is selected and a key is stored; callers can never set it themselves;
 *   - without a key, nothing is sent to the staging host;
 *   - while staging is selected, nothing is sent to a production Agentrix host (so a hard-coded
 *     production URL cannot mix environments);
 *   - a `/socket.io/` WebSocket to staging carries the short-lived secure_link ticket (§9.2:
 *     `st` = base64url(md5(`${e}/socket.io/ ${key}`)), `e` = expiry in Unix seconds, 24 h), never
 *     the key itself.
 */
import * as SecureStore from 'expo-secure-store';

export const STAGING_HOST = 'stg.agentrix.top';
export const STAGING_ORIGIN = `https://${STAGING_HOST}`;
export const STAGING_KEY_HEADER = 'X-Agentrix-Staging-Key';
/** SecureStore keys. */
export const STAGING_SELECTION_STORE_KEY = 'agentrix_env_selection';
export const STAGING_GATE_KEY_STORE_KEY = 'agentrix_staging_gate_key';
/** Which environment the stored sign-in token belongs to (absent = production, as before 1.4.0). */
export const TOKEN_ENV_STORE_KEY = 'clawlink_token_env';
export const STAGING_SOCKET_TICKET_TTL_SECONDS = 24 * 60 * 60;

/** The build flag: exactly `'1'`. Anything else (unset, `'0'`, `'true'`) is a build without the switch. */
export function stagingSwitchAvailable(flag: unknown): boolean {
  return flag === '1';
}

/** Inlined at build time (babel-preset-expo replaces this exact expression). */
export const STAGING_SWITCH_BUILD = stagingSwitchAvailable(process.env.EXPO_PUBLIC_STAGING_SWITCH);

const KEY_PATTERN = /^[A-Za-z0-9._~+/=-]{16,256}$/;

export function normalizeStagingKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return KEY_PATTERN.test(trimmed) ? trimmed : null;
}

export interface StagingSelection {
  active: boolean;
  /** `null` while active means "selected, but no usable key": nothing goes to staging. */
  key: string | null;
}

export const STAGING_INACTIVE: StagingSelection = Object.freeze({ active: false, key: null });

export function resolveStagingSelection(input: { switchBuild: boolean; selection: unknown; key: unknown }): StagingSelection {
  if (!input.switchBuild || input.selection !== 'staging') return STAGING_INACTIVE;
  return { active: true, key: normalizeStagingKey(input.key) };
}

function readStoreSync(key: string): string | null {
  try {
    return SecureStore.getItem(key);
  } catch {
    return null;
  }
}

/** Read once at bundle start; a build without the switch never touches the store. */
export const STAGING_SELECTION: StagingSelection = STAGING_SWITCH_BUILD
  ? resolveStagingSelection({ switchBuild: true, selection: readStoreSync(STAGING_SELECTION_STORE_KEY), key: readStoreSync(STAGING_GATE_KEY_STORE_KEY) })
  : STAGING_INACTIVE;

export type TokenEnvironment = 'production' | 'staging';
export const CURRENT_TOKEN_ENV: TokenEnvironment = STAGING_SELECTION.active ? 'staging' : 'production';

/** A token stored without a tag was stored by a build before 1.4.0, which only knew production. */
export function tokenEnvMatches(storedTag: unknown, current: TokenEnvironment = CURRENT_TOKEN_ENV): boolean {
  const tag = storedTag === 'staging' ? 'staging' : storedTag == null || storedTag === 'production' ? 'production' : null;
  return tag === current;
}

// ---------------------------------------------------------------------------
// Request decisions

export type StagingRequestDecision =
  | { kind: 'pass' }
  | { kind: 'attach'; key: string }
  | { kind: 'block'; reason: 'staging_not_selected' | 'staging_key_missing' | 'staging_insecure' | 'production_host_in_staging' };

/** Scheme and host, lower-cased; user info and port dropped. `null` when it is not an absolute URL. */
export function urlSchemeAndHost(url: unknown): { scheme: string; host: string; path: string } | null {
  if (typeof url !== 'string') return null;
  const match = /^([a-z][a-z0-9+.-]*):\/\/(?:[^/?#@]*@)?(\[[^\]]*\]|[^/?#:]*)(?::\d*)?([^?#]*)/i.exec(url.trim());
  if (!match) return null;
  return { scheme: match[1].toLowerCase(), host: match[2].toLowerCase(), path: match[3] || '/' };
}

function isProductionAgentrixHost(host: string): boolean {
  return host === 'agentrix.top' || (host.endsWith('.agentrix.top') && host !== STAGING_HOST);
}

export function stagingRequestDecision(url: unknown, selection: StagingSelection): StagingRequestDecision {
  const parsed = urlSchemeAndHost(url);
  // `data:` / `blob:` and other non-hierarchical URLs name no host; they never carry the header.
  if (!parsed) return { kind: 'pass' };
  if (parsed.host !== STAGING_HOST) {
    if (selection.active && isProductionAgentrixHost(parsed.host)) return { kind: 'block', reason: 'production_host_in_staging' };
    return { kind: 'pass' };
  }
  if (!selection.active) return { kind: 'block', reason: 'staging_not_selected' };
  if (parsed.scheme !== 'https' && parsed.scheme !== 'wss') return { kind: 'block', reason: 'staging_insecure' };
  if (!selection.key) return { kind: 'block', reason: 'staging_key_missing' };
  return { kind: 'attach', key: selection.key };
}

export class StagingRequestBlockedError extends Error {
  constructor(readonly reason: Extract<StagingRequestDecision, { kind: 'block' }>['reason']) {
    super(`staging guard: ${reason}`);
    this.name = 'StagingRequestBlockedError';
  }
}

// ---------------------------------------------------------------------------
// §9.2 socket ticket (md5 + base64url, self-contained: no dependency)

function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i += 1;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return out;
}

const MD5_SHIFTS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

/** RFC 1321 MD5 of the UTF-8 bytes of `text`. Only for the staging ticket, which is an access gate, not security. */
export function md5Bytes(text: string): Uint8Array {
  const bytes = utf8Bytes(text);
  const blocks = ((bytes.length + 8) >>> 6) + 1;
  const words = new Uint32Array(blocks * 16);
  for (let i = 0; i < bytes.length; i += 1) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
  words[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8);
  const bits = bytes.length * 8;
  words[blocks * 16 - 2] = bits >>> 0;
  words[blocks * 16 - 1] = Math.floor(bits / 2 ** 32) >>> 0;
  let a = 0x67452301;
  let b = 0xefcdab89 | 0;
  let c = 0x98badcfe | 0;
  let d = 0x10325476;
  for (let block = 0; block < words.length; block += 16) {
    let A = a;
    let B = b;
    let C = c;
    let D = d;
    for (let i = 0; i < 64; i += 1) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        f = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        f = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      const shift = MD5_SHIFTS[(i >> 4) * 4 + (i % 4)];
      const sum = (A + f + MD5_K[i] + words[block + g]) | 0;
      const next = (B + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
      A = D;
      D = C;
      C = B;
      B = next;
    }
    a = (a + A) | 0;
    b = (b + B) | 0;
    c = (c + C) | 0;
    d = (d + D) | 0;
  }
  const out = new Uint8Array(16);
  [a, b, c, d].forEach((word, index) => {
    for (let j = 0; j < 4; j += 1) out[index * 4 + j] = (word >>> (8 * j)) & 0xff;
  });
  return out;
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url without padding, as nginx `secure_link` expects. */
export function base64UrlBytes(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64URL[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64URL[n & 63];
  }
  return out;
}

/** §9.2: `{ st, e }` for one socket connection, valid for 24 hours. */
export function stagingSocketTicket(key: string, nowMs: number): { st: string; e: number } {
  const e = Math.floor(nowMs / 1000) + STAGING_SOCKET_TICKET_TTL_SECONDS;
  return { st: base64UrlBytes(md5Bytes(`${e}/socket.io/ ${key}`)), e };
}

/** Adds the ticket to a staging `/socket.io/` URL; any other URL is returned as it is. */
export function withStagingSocketTicket(url: string, key: string, nowMs: number): string {
  const parsed = urlSchemeAndHost(url);
  if (!parsed || parsed.host !== STAGING_HOST || !parsed.path.startsWith('/socket.io/')) return url;
  const { st, e } = stagingSocketTicket(key, nowMs);
  const [beforeHash, hash] = url.split('#', 2);
  const joined = `${beforeHash}${beforeHash.includes('?') ? '&' : '?'}st=${st}&e=${e}`;
  return hash === undefined ? joined : `${joined}#${hash}`;
}

// ---------------------------------------------------------------------------
// The guard

type XhrLike = {
  prototype: {
    open: (...args: any[]) => unknown;
    send: (...args: any[]) => unknown;
    setRequestHeader: (name: string, value: string) => unknown;
  };
};

/** Marks a patched prototype / constructor (non-writable). */
const GUARD_MARK = '__agentrixStagingGuard';
/** Per request: the URL given to `open` (a separate, writable slot on the instance). */
const URL_SLOT = '__agentrixStagingUrl';

/**
 * Wraps `XMLHttpRequest` and `WebSocket` on `target` (the global object). Idempotent. Only called
 * in a switch build (`ensureStagingNetworkGuard`); exported for the tests.
 */
export function installStagingNetworkGuard(target: Record<string, any>, selection: StagingSelection, now: () => number = () => Date.now()): void {
  const headerLower = STAGING_KEY_HEADER.toLowerCase();
  const Xhr = target.XMLHttpRequest as XhrLike | undefined;
  if (Xhr && !(Xhr.prototype as any)[GUARD_MARK]) {
    const proto = Xhr.prototype;
    const open = proto.open;
    const send = proto.send;
    const setRequestHeader = proto.setRequestHeader;
    proto.open = function patchedOpen(this: any, ...args: any[]) {
      this[URL_SLOT] = args[1];
      return open.apply(this, args);
    };
    proto.setRequestHeader = function patchedSetRequestHeader(this: any, name: string, value: string) {
      // Only the guard sets the staging header.
      if (typeof name === 'string' && name.toLowerCase() === headerLower) return undefined;
      return setRequestHeader.call(this, name, value);
    };
    proto.send = function patchedSend(this: any, ...args: any[]) {
      const decision = stagingRequestDecision(this[URL_SLOT], selection);
      if (decision.kind === 'block') throw new StagingRequestBlockedError(decision.reason);
      if (decision.kind === 'attach') setRequestHeader.call(this, STAGING_KEY_HEADER, decision.key);
      return send.apply(this, args);
    };
    Object.defineProperty(proto, GUARD_MARK, { value: true });
  }
  const Ws = target.WebSocket;
  if (typeof Ws === 'function' && !Ws[GUARD_MARK]) {
    const Guarded = function GuardedWebSocket(this: unknown, url: string, protocols?: unknown, options?: Record<string, any>) {
      const decision = stagingRequestDecision(url, selection);
      if (decision.kind === 'block') throw new StagingRequestBlockedError(decision.reason);
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries((options?.headers as Record<string, string>) ?? {})) {
        if (name.toLowerCase() !== headerLower) headers[name] = value;
      }
      const nextOptions = options ? { ...options, headers } : options;
      const nextUrl = decision.kind === 'attach' ? withStagingSocketTicket(url, decision.key, now()) : url;
      return new Ws(nextUrl, protocols, nextOptions);
    } as unknown as Record<string, any>;
    Guarded.prototype = Ws.prototype;
    for (const name of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) {
      if (name in Ws) Guarded[name] = Ws[name];
    }
    Guarded[GUARD_MARK] = true;
    target.WebSocket = Guarded;
  }
}

/** Called once from `src/config/env.ts`. No-op outside a switch build. */
export function ensureStagingNetworkGuard(): void {
  if (!STAGING_SWITCH_BUILD) return;
  installStagingNetworkGuard(globalThis as unknown as Record<string, any>, STAGING_SELECTION);
}
