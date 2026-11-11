/**
 * L8-14 item 10 (A30): which phone installs are on which App version, counted per install, never per person.
 *
 * Contract between the phone (sends three request headers) and the backend (reads them when the switch is on). Nothing else
 * is collected: no account, no IP, no user agent, no hardware or advertising id. The install id is a random UUID v4 the phone
 * makes on first launch and keeps in its secure store (a reinstall makes a new one); the backend keeps only a keyed hash of it.
 *
 * Header names: the phone already sends `X-Agentrix-Surface: mobile`; no desktop or web request carries an app version or
 * install id, so there was no existing name to reuse.
 */
import { APP_VERSION_PATTERN } from './app-version';

export const APP_INSTALL_PRESENCE_FLAG_V1 = 'APP_INSTALL_PRESENCE_V1_ENABLED' as const;

/** Header names as the phone writes them. Node lower-cases them on the way in, see `APP_INSTALL_HEADER_KEYS_V1`. */
export const APP_INSTALL_HEADERS_V1 = {
  version: 'X-Agentrix-App-Version',
  platform: 'X-Agentrix-Platform',
  installId: 'X-Agentrix-Install-Id',
} as const;

export const APP_INSTALL_HEADER_KEYS_V1 = {
  version: 'x-agentrix-app-version',
  platform: 'x-agentrix-platform',
  installId: 'x-agentrix-install-id',
} as const;

export const APP_INSTALL_PLATFORMS_V1 = ['android', 'ios'] as const;
export type AppInstallPlatformV1 = (typeof APP_INSTALL_PLATFORMS_V1)[number];

/** A row not seen for this many days is deleted by the daily sweep. */
export const APP_INSTALL_PRESENCE_RETENTION_DAYS_V1 = 90;

/** A random (version 4, RFC 4122 variant) UUID, written in lower case. */
const INSTALL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isAppInstallIdV1(value: unknown): value is string {
  return typeof value === 'string' && INSTALL_ID_PATTERN.test(value);
}

export function isAppInstallVersionV1(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 19 && APP_VERSION_PATTERN.test(value);
}

export function isAppInstallPlatformV1(value: unknown): value is AppInstallPlatformV1 {
  return value === 'android' || value === 'ios';
}

/** A UUID v4 from 16 random bytes (the phone's CSPRNG). Throws on fewer than 16 bytes. */
export function appInstallIdFromBytesV1(bytes: ArrayLike<number>): string {
  if (!bytes || bytes.length < 16) throw new Error('app install id needs 16 random bytes');
  const b: number[] = [];
  for (let i = 0; i < 16; i += 1) b.push(bytes[i] & 0xff);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface AppInstallPresenceClaimV1 {
  installId: string;
  platform: AppInstallPlatformV1;
  appVersion: string;
}

/**
 * Read the three headers through `read(lowerCaseName)`. All three must be present, each exactly one value, in the shape above;
 * anything else (a missing header, a repeated one, a malformed value) gives `null` and the caller ignores the request's claim.
 * Never throws, never reports why.
 */
export function decodeAppInstallPresenceHeadersV1(read: (lowerCaseName: string) => unknown): AppInstallPresenceClaimV1 | null {
  try {
    const installId = read(APP_INSTALL_HEADER_KEYS_V1.installId);
    const platform = read(APP_INSTALL_HEADER_KEYS_V1.platform);
    const appVersion = read(APP_INSTALL_HEADER_KEYS_V1.version);
    if (!isAppInstallIdV1(installId) || !isAppInstallPlatformV1(platform) || !isAppInstallVersionV1(appVersion)) return null;
    return { installId, platform, appVersion };
  } catch {
    return null;
  }
}

/** True for the install-id header name in any letter case. */
export function isAppInstallIdHeaderNameV1(name: unknown): boolean {
  return typeof name === 'string' && name.toLowerCase() === APP_INSTALL_HEADER_KEYS_V1.installId;
}

const INSTALL_ID_IN_TEXT = /(x-agentrix-install-id["']?\s*[:=]\s*["']?)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Mask an install id that sits right after its header name in a string (a log line, an error message, a dumped header list). */
export function redactAppInstallIdInTextV1(text: string): string {
  return text.replace(INSTALL_ID_IN_TEXT, '$1[redacted]');
}

/**
 * Mask install ids in a Sentry event (or any plain object): the header (by name, in any letter case) wherever it sits in a
 * request, a breadcrumb or extra data, an id written after the header name in any string, and `knownInstallId` (the phone's own
 * id, when it knows it) wherever it appears as a substring. Returns a copy; the input is not changed.
 */
export function scrubAppInstallIdV1<T>(value: T, knownInstallId?: string | null): T {
  const known = knownInstallId && isAppInstallIdV1(knownInstallId) ? knownInstallId : null;
  const text = (input: string): string => {
    let out = redactAppInstallIdInTextV1(input);
    if (known && out.includes(known)) out = out.split(known).join('[install-id]');
    return out;
  };
  const walk = (item: unknown, depth: number): unknown => {
    if (typeof item === 'string') return text(item);
    if (depth > 10 || item === null || typeof item !== 'object') return item;
    if (Array.isArray(item)) return item.map((entry) => walk(entry, depth + 1));
    // Only plain objects are rebuilt; a Date, an Error or any other class instance is left as it is.
    const proto = Object.getPrototypeOf(item);
    if (proto !== Object.prototype && proto !== null) return item;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(item as Record<string, unknown>)) {
      out[key] = isAppInstallIdHeaderNameV1(key) ? '[redacted]' : walk(entry, depth + 1);
    }
    return out;
  };
  return walk(value, 0) as T;
}
