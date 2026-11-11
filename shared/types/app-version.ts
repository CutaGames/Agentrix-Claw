/**
 * 手机的"有新版本"（REQ-mobile-089，1.4.1）：`GET /api/app/version`，不用登录。
 *
 * 服务端从环境变量读，每次发新 APK 只改 `.env` 再重启进程，不用发后端代码：
 * - `MOBILE_LATEST_VERSION`：`数字.数字[.数字[.数字]]`（和手机端的判断一样，`APP_VERSION_PATTERN`）；
 * - `MOBILE_LATEST_BUILD`：正整数；
 * - `MOBILE_APK_URL`：只收 https 的 `agentrix.top` 和 `*.agentrix.top`（`isTrustedAppDownloadUrlV1`，手机端也照这个挡）；
 * - `MOBILE_RELEASE_NOTES`：最多 500 字；
 * - `MOBILE_RELEASED_AT`：`YYYY-MM-DD`。
 * 规则：
 * - 一个都没设时，返回原来写死的值（1.1.0），行为和改之前一样。
 * - 设了 `MOBILE_LATEST_VERSION`，下载地址就只认 `MOBILE_APK_URL`；它没设或不合格时 `apkUrl` 是 `null`，
 *   手机只显示版本号，不会把新版本号配上旧 APK 的地址。
 * - 其余不合格的值退回默认值，不报错。不提供强制更新。
 */
export const APP_VERSION_ROUTE = 'GET /api/app/version' as const;

/** 版本号：1–4 段数字，每段最多 4 位。 */
export const APP_VERSION_PATTERN = /^\d{1,4}(\.\d{1,4}){1,3}$/;
/** 下载地址：https，主机是 `agentrix.top` 或它的子域名，没有用户名和端口。 */
export const APP_TRUSTED_DOWNLOAD_PATTERN = /^https:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*agentrix\.top(?:\/[^\s\\]*)?$/i;
export const APP_RELEASE_NOTES_MAX = 500;

export interface AppVersionInfoResponseV1 {
  latestVersion: string;
  buildNumber: number;
  apkUrl: string | null;
  minVersion: string;
  forceUpdate: false;
  releaseNotes: string;
  releasedAt: string;
}

/** 一个都没配时返回的值（原来写死在 `app.controller.ts` 里的那组）。 */
export const APP_VERSION_DEFAULTS_V1: Readonly<AppVersionInfoResponseV1> = Object.freeze({
  latestVersion: '1.1.0',
  buildNumber: 70,
  apkUrl: 'https://api.agentrix.top/downloads/clawlink-agent.apk',
  minVersion: '1.0.0',
  forceUpdate: false,
  releaseNotes: 'Bug fixes, QR scan improvements, desktop AIO support',
  releasedAt: '2026-03-08',
});

export function isTrustedAppDownloadUrlV1(url: unknown): url is string {
  return typeof url === 'string' && url.length <= 2048 && APP_TRUSTED_DOWNLOAD_PATTERN.test(url);
}

/** 服务端用：从配置算出响应。`get` 读环境变量，没设返回 undefined。 */
export function resolveAppVersionInfoV1(get: (key: string) => string | undefined): AppVersionInfoResponseV1 {
  const read = (key: string) => {
    const value = get(key);
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };
  const version = read('MOBILE_LATEST_VERSION');
  const build = read('MOBILE_LATEST_BUILD');
  const url = read('MOBILE_APK_URL');
  const notes = read('MOBILE_RELEASE_NOTES');
  const releasedAt = read('MOBILE_RELEASED_AT');
  const configuredVersion = version && APP_VERSION_PATTERN.test(version) ? version : undefined;
  const d = APP_VERSION_DEFAULTS_V1;
  let apkUrl: string | null;
  if (url !== undefined) apkUrl = isTrustedAppDownloadUrlV1(url) ? url : null;
  else apkUrl = configuredVersion ? null : d.apkUrl;
  return {
    latestVersion: configuredVersion ?? d.latestVersion,
    buildNumber: build && /^[1-9][0-9]{0,8}$/.test(build) ? Number(build) : d.buildNumber,
    apkUrl,
    minVersion: d.minVersion,
    forceUpdate: false,
    releaseNotes: notes ? notes.slice(0, APP_RELEASE_NOTES_MAX) : d.releaseNotes,
    releasedAt: releasedAt && /^\d{4}-\d{2}-\d{2}$/.test(releasedAt) && Number.isFinite(Date.parse(releasedAt)) ? releasedAt : d.releasedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 客户端用：解码响应（包在 `data` 里也认）。`latestVersion` 不合格就整体返回 null；下载地址不可信时
 * `apkUrl` 解成 null（照样返回版本号），其余缺的项取默认值。
 */
export function decodeAppVersionInfoResponseV1(value: unknown): AppVersionInfoResponseV1 | null {
  const body = isRecord(value) && isRecord(value.data) ? value.data : value;
  if (!isRecord(body)) return null;
  if (typeof body.latestVersion !== 'string' || !APP_VERSION_PATTERN.test(body.latestVersion)) return null;
  const d = APP_VERSION_DEFAULTS_V1;
  return {
    latestVersion: body.latestVersion,
    buildNumber: Number.isInteger(body.buildNumber) && (body.buildNumber as number) > 0 ? (body.buildNumber as number) : d.buildNumber,
    apkUrl: isTrustedAppDownloadUrlV1(body.apkUrl) ? body.apkUrl : null,
    minVersion: typeof body.minVersion === 'string' && APP_VERSION_PATTERN.test(body.minVersion) ? body.minVersion : d.minVersion,
    forceUpdate: false,
    releaseNotes: typeof body.releaseNotes === 'string' ? body.releaseNotes.slice(0, APP_RELEASE_NOTES_MAX) : '',
    releasedAt: typeof body.releasedAt === 'string' ? body.releasedAt : '',
  };
}
