/**
 * Answering in Telegram, on the phone (`shared/types/twin-telegram.ts`): next to each personal link the asker or
 * organizer forwards, a second button forwards a Telegram link instead. The friend opens it in the platform bot's
 * private chat and answers with buttons; the answer follows the same rules as the web link (marked unverified).
 * Only in builds with `EXPO_PUBLIC_TWIN_TELEGRAM=1`, and only when the server names its bot (404 while its switch is
 * off). No React Native import: the transport and token are injected (twinTelegramSession.ts binds them).
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import { decodeTwinTelegramLinkBaseV0, twinTelegramLinkFromGuestUrlV0, type TwinTelegramKindV0 } from '../../shared/types/twin-telegram';

export function isTwinTelegramMobileEnabled(value: string | undefined): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const TWIN_TELEGRAM_ENABLED = isTwinTelegramMobileEnabled(process.env.EXPO_PUBLIC_TWIN_TELEGRAM);

type Words = { en: string; zh: string };

/** The Telegram link for one personal web link, or null when either part is not usable. */
export function twinTelegramLinkOf(botName: string | null | undefined, kind: TwinTelegramKindV0, guestUrl: string | null | undefined): string | null {
  if (!botName || !guestUrl) return null;
  return twinTelegramLinkFromGuestUrlV0(botName, kind, guestUrl);
}

/** What gets forwarded along with the Telegram link. */
export function twinTelegramShareWords(kind: TwinTelegramKindV0, telegramUrl: string): Words {
  return kind === 'ask'
    ? { en: `I have a quick question for you. Open this in Telegram to answer: ${telegramUrl}`, zh: `想问你个事，在 Telegram 里点开就能回答：${telegramUrl}` }
    : { en: `I'm making plans. Open this in Telegram and pick the times that work for you: ${telegramUrl}`, zh: `我在约时间，在 Telegram 里点开选一下哪个时间你行：${telegramUrl}` };
}

export interface MobileTwinTelegramClient {
  /** The platform bot's name, or null when Telegram links are not offered (switch off, not signed in, no bot). */
  botName(): Promise<string | null>;
}

export function createMobileTwinTelegramClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
}): MobileTwinTelegramClient {
  const base = deps.baseUrl.replace(/\/+$/, '');
  return {
    async botName() {
      const token = deps.token();
      if (!token) return null;
      let response: HttpResponseV1;
      try {
        response = await deps.transport.request({
          method: 'GET',
          path: `${base}/twin-telegram/link-base`,
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        });
      } catch {
        return null;
      }
      if (response.status < 200 || response.status >= 300) return null;
      return decodeTwinTelegramLinkBaseV0(response.body)?.botName ?? null;
    },
  };
}
