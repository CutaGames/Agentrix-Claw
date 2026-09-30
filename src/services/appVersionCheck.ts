/**
 * "有新版本" on 我的 → 设置与隐私 → 关于 → 应用版本 (REQ-mobile-089, coord 10-01: 1.4.1).
 *
 * - Reads `GET /api/app/version` (public, no token). Anything unreadable (network error, non-2xx, an unknown
 *   body, no answer within 5 s) is `null`, and the row only shows the installed version.
 * - An offer needs a newer `latestVersion` than the installed one and a download address that is https on
 *   `agentrix.top` or one of its subdomains; any other address is never opened.
 * - Android only: the address is an APK. iOS updates come from the store.
 * - A good answer is kept for 10 minutes per API base; a failure is not kept.
 */
import type { HttpTransportV1 } from '../../shared/client/transport';
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';

export const APP_VERSION_PATH = '/app/version';
export const APP_VERSION_CACHE_MS = 10 * 60_000;
export const APP_VERSION_TIMEOUT_MS = 5_000;

export interface AppVersionInfoV1 {
  latestVersion: string;
  apkUrl: string;
  releaseNotes: string | null;
}

export interface AppUpdateOfferV1 {
  latestVersion: string;
  url: string;
}

const VERSION = /^\d{1,4}(\.\d{1,4}){1,3}$/;
/** https, host `agentrix.top` or `<labels>.agentrix.top`, nothing else before the path (no user, no port). */
const TRUSTED_DOWNLOAD = /^https:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*agentrix\.top(?:\/[^\s\\]*)?$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** -1, 0 or 1; missing parts count as 0 (1.4 = 1.4.0). Both must look like versions. */
export function compareAppVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

export function isTrustedDownloadUrl(url: unknown): url is string {
  return typeof url === 'string' && url.length <= 2048 && TRUSTED_DOWNLOAD.test(url);
}

export function decodeAppVersionInfo(value: unknown): AppVersionInfoV1 | null {
  const body = isRecord(value) && isRecord(value.data) ? value.data : value;
  if (!isRecord(body)) return null;
  if (typeof body.latestVersion !== 'string' || !VERSION.test(body.latestVersion)) return null;
  if (typeof body.apkUrl !== 'string') return null;
  return {
    latestVersion: body.latestVersion,
    apkUrl: body.apkUrl,
    releaseNotes: typeof body.releaseNotes === 'string' ? body.releaseNotes : null,
  };
}

/** What the row offers, or null (nothing newer, not Android, an address we do not open, unreadable). */
export function appUpdateOffer(info: AppVersionInfoV1 | null, installedVersion: string, platform: string): AppUpdateOfferV1 | null {
  if (!info || platform !== 'android' || !VERSION.test(installedVersion)) return null;
  if (compareAppVersions(info.latestVersion, installedVersion) <= 0) return null;
  if (!isTrustedDownloadUrl(info.apkUrl)) return null;
  return { latestVersion: info.latestVersion, url: info.apkUrl };
}

let cached: { baseUrl: string; at: number; value: AppVersionInfoV1 } | null = null;

export function clearAppVersionCache(): void {
  cached = null;
}

export async function readAppVersion(
  input: { baseUrl?: string; transport?: HttpTransportV1; now?: () => number; timeoutMs?: number } = {},
): Promise<AppVersionInfoV1 | null> {
  const baseUrl = (input.baseUrl ?? getApiConfig().baseUrl ?? '').replace(/\/+$/, '');
  const now = input.now ?? Date.now;
  if (cached && cached.baseUrl === baseUrl && now() - cached.at < APP_VERSION_CACHE_MS) return cached.value;
  const transport = input.transport ?? mobileV6HttpTransport;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      transport.request({ method: 'GET', path: `${baseUrl}${APP_VERSION_PATH}`, headers: { Accept: 'application/json', 'X-Agentrix-Surface': 'mobile' } }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), input.timeoutMs ?? APP_VERSION_TIMEOUT_MS);
      }),
    ]);
    if (!response || response.status < 200 || response.status >= 300) return null;
    const value = decodeAppVersionInfo(response.body);
    if (value) cached = { baseUrl, at: now(), value };
    return value;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
