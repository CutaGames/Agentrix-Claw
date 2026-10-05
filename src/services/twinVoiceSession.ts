/**
 * The twin voice client bound to this app's session (twinVoice.ts): same transport, API base and token as the other
 * owner screens. A rendered reply is downloaded into the cache folder `twin-voice/`; the screen deletes it when the
 * answer goes away, and a download that is not audio is deleted here.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { createMobileTwinVoiceClient, type MobileTwinVoiceClientV0, type TwinVoiceDownload } from './twinVoice';

const ERROR_BODY_MAX = 4096;

function cacheFolder(): string | null {
  return FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}twin-voice/` : null;
}

export async function deleteTwinVoiceFile(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

async function downloadTwinVoice(url: string, headers: Record<string, string>): Promise<TwinVoiceDownload> {
  const folder = cacheFolder();
  if (!folder) throw new Error('twin-voice-cache-unavailable');
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true }).catch(() => undefined);
  const target = `${folder}${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}.mp3`;
  const result = await FileSystem.downloadAsync(url, target, { headers });
  const contentType = Object.entries(result.headers ?? {}).find(([name]) => name.toLowerCase() === 'content-type')?.[1] ?? result.mimeType ?? '';
  if (result.status >= 200 && result.status < 300) return { status: result.status, uri: result.uri, contentType, errorBody: null };
  let errorBody: string | null = null;
  try {
    errorBody = (await FileSystem.readAsStringAsync(result.uri)).slice(0, ERROR_BODY_MAX);
  } catch {
    errorBody = null;
  }
  await deleteTwinVoiceFile(result.uri);
  return { status: result.status, uri: null, contentType, errorBody };
}

export function mobileTwinVoiceClient(): MobileTwinVoiceClientV0 {
  return createMobileTwinVoiceClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
    download: downloadTwinVoice,
    discard: deleteTwinVoiceFile,
  });
}
