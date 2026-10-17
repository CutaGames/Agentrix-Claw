/**
 * "有新版本" on 我的 → 设置与隐私 → 关于 → 应用版本 (REQ-mobile-089, coord 10-01: 1.4.1).
 *
 * - Reads `GET /api/app/version` (public, no token). Anything unreadable (network error, non-2xx, an unknown
 *   body, no answer within 5 s) is `null`, and the row only shows the installed version.
 * - An offer needs a newer `latestVersion` than the installed one and a download address that is https on
 *   `agentrix.top` or one of its subdomains; any other address is never opened.
 * - Android only: the address is an APK. iOS updates come from the store.
 * - A good answer is kept for 10 minutes per API base; a failure is not kept.
 * - The body is read with the contract's decoder (`shared/types/app-version.ts`, REQ-backend-083): the same
 *   version and download-address rules as the server.
 */
import type { HttpTransportV1 } from '../../shared/client/transport';
import {
  APP_VERSION_PATTERN,
  decodeAppVersionInfoResponseV1,
  isTrustedAppDownloadUrlV1,
  type AppVersionInfoResponseV1,
} from '../../shared/types/app-version';
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';

export const APP_VERSION_PATH = '/app/version';
export const APP_VERSION_CACHE_MS = 10 * 60_000;
export const APP_VERSION_TIMEOUT_MS = 5_000;

export interface AppUpdateOfferV1 {
  latestVersion: string;
  url: string;
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

/** What the row offers, or null (nothing newer, not Android, an address we do not open, unreadable). */
export function appUpdateOffer(info: AppVersionInfoResponseV1 | null, installedVersion: string, platform: string): AppUpdateOfferV1 | null {
  if (!info || platform !== 'android' || !APP_VERSION_PATTERN.test(installedVersion)) return null;
  if (compareAppVersions(info.latestVersion, installedVersion) <= 0) return null;
  // The decoder already turns an untrusted address into null; checked again where it is opened.
  if (!isTrustedAppDownloadUrlV1(info.apkUrl)) return null;
  return { latestVersion: info.latestVersion, url: info.apkUrl };
}

let cached: { baseUrl: string; at: number; value: AppVersionInfoResponseV1 } | null = null;

export function clearAppVersionCache(): void {
  cached = null;
}

export async function readAppVersion(
  input: { baseUrl?: string; transport?: HttpTransportV1; now?: () => number; timeoutMs?: number } = {},
): Promise<AppVersionInfoResponseV1 | null> {
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
    const value = decodeAppVersionInfoResponseV1(response.body);
    if (value) cached = { baseUrl, at: now(), value };
    return value;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
