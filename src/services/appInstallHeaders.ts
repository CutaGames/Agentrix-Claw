/**
 * L8-14 item 10 (A30): the three headers that let the backend count phone installs by App version
 * (shared/types/app-install-presence.ts is the contract).
 *
 * - `X-Agentrix-App-Version`: `Constants.expoConfig.version`. Not readable or not a version number: not sent. No default is invented.
 * - `X-Agentrix-Platform`: `android` or `ios`.
 * - `X-Agentrix-Install-Id`: a random UUID v4 made on first launch and kept in AsyncStorage. AsyncStorage is wiped when the
 *   app is uninstalled on both platforms, so a reinstall is a new install; the iOS keychain (expo-secure-store) would survive
 *   a reinstall and turn this into a device identifier, so it is not used. The id is not a secret and gives access to nothing.
 *   Nothing is read from the hardware, the OS or an advertising id. It is sent only together with a valid version and
 *   platform, only to our own API (`appInstallHeadersFor`), and when it cannot be stored it is not sent at all.
 * - The raw id is never logged: `scrubInstallIdFromSentryEventV1` takes it (and the header, by name) out of what Sentry gets.
 *
 * Nothing here can throw or slow a request for long: every failure leaves the headers out.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRandomBytes } from 'expo-crypto';
import Constants from 'expo-constants';
import {
  APP_INSTALL_HEADERS_V1,
  appInstallIdFromBytesV1,
  isAppInstallIdV1,
  isAppInstallPlatformV1,
  isAppInstallVersionV1,
  scrubAppInstallIdV1,
  type AppInstallPlatformV1,
} from '../../shared/types/app-install-presence';

export const APP_INSTALL_ID_STORAGE_KEY_V1 = 'agentrix.appInstallId.v1';

export interface AppInstallHeadersDepsV1 {
  version?: () => string | undefined;
  platform?: () => AppInstallPlatformV1 | undefined;
  readStored?: () => Promise<string | null>;
  writeStored?: (id: string) => Promise<void>;
  randomBytes?: (count: number) => ArrayLike<number>;
}

export interface AppInstallHeadersV1 {
  /** The headers to add to a request to our API. `{}` when nothing may be sent. Never throws. */
  get(): Promise<Record<string, string>>;
  /** The install id once it has been loaded, else `null`. Only for scrubbing it out of crash reports. */
  knownInstallId(): string | null;
}

export function readInstalledAppVersionV1(): string | undefined {
  try {
    const version = Constants.expoConfig?.version;
    return isAppInstallVersionV1(version) ? version : undefined;
  } catch {
    return undefined;
  }
}

export function readAppPlatformV1(): AppInstallPlatformV1 | undefined {
  try {
    // Lazy: this module is imported by code that runs under Node-only tests, where react-native cannot load.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const os = (require('react-native') as { Platform?: { OS?: string } }).Platform?.OS;
    return isAppInstallPlatformV1(os) ? os : undefined;
  } catch {
    return undefined;
  }
}

export function createAppInstallHeadersV1(deps: AppInstallHeadersDepsV1 = {}): AppInstallHeadersV1 {
  const version = deps.version ?? readInstalledAppVersionV1;
  const platform = deps.platform ?? readAppPlatformV1;
  const readStored = deps.readStored ?? (() => AsyncStorage.getItem(APP_INSTALL_ID_STORAGE_KEY_V1));
  const writeStored = deps.writeStored ?? ((id: string) => AsyncStorage.setItem(APP_INSTALL_ID_STORAGE_KEY_V1, id));
  const randomBytes = deps.randomBytes ?? getRandomBytes;
  let cached: string | null = null;
  let loading: Promise<string | null> | null = null;

  const load = async (): Promise<string | null> => {
    try {
      const stored = await readStored();
      if (isAppInstallIdV1(stored)) return stored;
      const fresh = appInstallIdFromBytesV1(randomBytes(16));
      await writeStored(fresh);
      return fresh;
    } catch {
      // Could not read or keep an id: send none this session (a new id every launch would count one phone many times).
      return null;
    }
  };
  const installId = (): Promise<string | null> => {
    if (cached) return Promise.resolve(cached);
    if (!loading) {
      loading = load().then((id) => {
        cached = id;
        return id;
      });
    }
    return loading;
  };

  return {
    async get() {
      const headers: Record<string, string> = {};
      try {
        const v = version();
        const p = platform();
        if (v) headers[APP_INSTALL_HEADERS_V1.version] = v;
        if (p) headers[APP_INSTALL_HEADERS_V1.platform] = p;
        if (v && p) {
          const id = await installId();
          if (id) headers[APP_INSTALL_HEADERS_V1.installId] = id;
        }
      } catch {
        // leave out whatever could not be read
      }
      return headers;
    },
    knownInstallId: () => cached,
  };
}

const appInstallHeaders = createAppInstallHeadersV1();

/** The headers for the running app. */
export const getAppInstallHeadersV1 = (): Promise<Record<string, string>> => appInstallHeaders.get();
export const knownAppInstallIdV1 = (): string | null => appInstallHeaders.knownInstallId();

/** Headers for `url` only when it is on our own API (`baseUrl`); an absolute address elsewhere gets none. */
export async function appInstallHeadersForV1(
  url: string,
  baseUrl: string | undefined,
  source: () => Promise<Record<string, string>> = getAppInstallHeadersV1,
): Promise<Record<string, string>> {
  const base = (baseUrl ?? '').replace(/\/+$/, '');
  if (!base || typeof url !== 'string' || !(url === base || url.startsWith(`${base}/`) || url.startsWith(`${base}?`))) return {};
  try {
    return await source();
  } catch {
    return {};
  }
}

/** Sentry `beforeSend` / `beforeBreadcrumb` helper: the install header and the phone's own id, out of an event. */
export function scrubInstallIdFromSentryEventV1<T>(event: T): T {
  return scrubAppInstallIdV1(event, knownAppInstallIdV1());
}
