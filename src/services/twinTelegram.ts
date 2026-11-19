/**
 * Answering in Telegram, on the phone (`shared/types/twin-telegram.ts`): next to each personal link the asker or
 * organizer forwards, a second button forwards a Telegram link instead. The friend opens it in the platform bot's
 * private chat and answers with buttons; the answer follows the same rules as the web link (marked unverified).
 * Only in builds with `EXPO_PUBLIC_TWIN_TELEGRAM=1`, and only when the server names its bot (404 while its switch is
 * off). No React Native import: the transport and token are injected (twinTelegramSession.ts binds them).
 *
 * A plan can also go to a Telegram group, in builds that add `EXPO_PUBLIC_TWIN_TELEGRAM_GROUP=1`: the initiator asks
 * for a group code, Telegram lets them pick a group to add the bot to, and the bot posts a roster there. Each person
 * taps their own name and answers in the bot's private chat; the group only hears how many answered and the outcome.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import {
  decodeTwinTelegramGroupIssuedV0,
  decodeTwinTelegramGroupStateV0,
  decodeTwinTelegramLinkBaseV0,
  twinTelegramGroupAddLinkV0,
  twinTelegramLinkFromGuestUrlV0,
  type TwinTelegramGroupStateNameV0,
  type TwinTelegramKindV0,
} from '../../shared/types/twin-telegram';

export function isTwinTelegramMobileEnabled(value: string | undefined): boolean {
  return value === '1';
}

/** The group card needs both build switches. */
export function isTwinTelegramGroupMobileEnabled(telegram: string | undefined, group: string | undefined): boolean {
  return telegram === '1' && group === '1';
}

// Read as literal member expressions so the Expo build inlines them.
export const TWIN_TELEGRAM_ENABLED = isTwinTelegramMobileEnabled(process.env.EXPO_PUBLIC_TWIN_TELEGRAM);
export const TWIN_TELEGRAM_GROUP_ENABLED = isTwinTelegramGroupMobileEnabled(process.env.EXPO_PUBLIC_TWIN_TELEGRAM, process.env.EXPO_PUBLIC_TWIN_TELEGRAM_GROUP);

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

/** Why a group action did not go through. `changed`: the plan is over or nobody answers by link any more. */
export type TwinTelegramGroupFailure = 'changed' | 'too_many' | 'unavailable';

export type TwinTelegramGroupIssueOutcome = { ok: true; url: string } | { ok: false; failure: TwinTelegramGroupFailure };
export type TwinTelegramGroupRevokeOutcome = { ok: true } | { ok: false; failure: TwinTelegramGroupFailure };

export function twinTelegramGroupFailureOf(status: number): TwinTelegramGroupFailure {
  if (status === 409 || status === 410) return 'changed';
  if (status === 429) return 'too_many';
  return 'unavailable';
}

export function twinTelegramGroupFailureWords(failure: TwinTelegramGroupFailure): Words {
  if (failure === 'changed') {
    return { en: 'This plan is over, or no one answers by link any more, so it cannot go to a group.', zh: '这次商量已经结束，或者没有走链接的人了，发不到群里。' };
  }
  if (failure === 'too_many') return { en: 'Too many tries. Wait a moment and try again.', zh: '操作太频繁了，过一会儿再试。' };
  return { en: 'That did not go through. Try again in a moment.', zh: '没有成功，过一会儿再试。' };
}

export const TWIN_TELEGRAM_GROUP_OPEN_FAILED_WORDS: Words = {
  en: 'Telegram could not be opened. Tap again for a new link.',
  zh: '打不开 Telegram。再点一次会换一个新的链接。',
};

/** What the group card on the plan page shows, or null when it shows nothing. */
export interface TwinTelegramGroupPanel {
  words: Words;
  /** The button that gets a code and opens Telegram; null once the plan cannot go to a group any more. */
  post: Words | null;
  /** Asked before `post` when a roster already stands in a group: it stops working there. */
  confirmPost: Words | null;
  canRevoke: boolean;
}

/**
 * `state` is what the server said (`null`: it does not offer groups for this plan; `undefined`: not known yet).
 * `open`: the plan can still be cancelled. `linkSeats`: how many of the people asked answer by link.
 */
export function twinTelegramGroupPanel(
  state: TwinTelegramGroupStateNameV0 | null | undefined,
  plan: { open: boolean; linkSeats: number },
): TwinTelegramGroupPanel | null {
  if (state === null || state === undefined) return null;
  const canPost = plan.open && plan.linkSeats > 0;
  if (state === 'none') {
    if (!canPost) return null;
    return {
      words: {
        en: 'Add the bot to your Telegram group and it posts a roster there. Each person taps their own name and picks times in a private chat with the bot. The group only hears how many answered and the outcome. Anyone in the group can tap any name, so answers are marked unverified.',
        zh: '把机器人拉进你们的 Telegram 群，它会在群里贴一张名单。每个人点自己的名字，到和机器人的私聊里选时间。群里只报回复了几个人和最后的结果。群里的人能点名单上任何一个名字，所以答案会标「未验证」。',
      },
      post: { en: 'Post to a Telegram group', zh: '发到 Telegram 群里' },
      confirmPost: null,
      canRevoke: false,
    };
  }
  if (state === 'waiting') {
    return {
      words: {
        en: 'No roster is posted yet. Pick a group in Telegram; the bot posts the roster once it is added.',
        zh: '名单还没有贴出来。在 Telegram 里选一个群，机器人进群后就会贴。',
      },
      post: canPost ? { en: 'Open Telegram again', zh: '再去 Telegram 选群' } : null,
      confirmPost: null,
      canRevoke: true,
    };
  }
  return {
    words: {
      en: 'The roster is posted in a Telegram group. The group hears how many answered and the outcome.',
      zh: '名单已经贴在一个 Telegram 群里。群里会报回复了几个人和最后的结果。',
    },
    post: canPost ? { en: 'Move to another group', zh: '换一个群' } : null,
    confirmPost: canPost
      ? { en: 'The roster in the current group stops working, and the bot stops posting there about this plan.', zh: '现在那个群里的名单会失效，机器人也不再在那个群里说这次商量的事。' }
      : null,
    canRevoke: true,
  };
}

export interface MobileTwinTelegramClient {
  /** The platform bot's name, or null when Telegram links are not offered (switch off, not signed in, no bot). */
  botName(): Promise<string | null>;
  /** Where this plan stands in a Telegram group, or null when groups are not offered for it (or the server is out of reach). */
  groupState(huddleId: string): Promise<TwinTelegramGroupStateNameV0 | null>;
  /**
   * A fresh group code, as the link that lets the initiator pick a group to add the bot to. The server returns the
   * code only this once, and any earlier code (and the roster posted with it) stops working.
   */
  groupIssue(huddleId: string): Promise<TwinTelegramGroupIssueOutcome>;
  /** Takes the roster down: its buttons stop working and the bot stops posting about this plan in that group. */
  groupRevoke(huddleId: string): Promise<TwinTelegramGroupRevokeOutcome>;
}

export function createMobileTwinTelegramClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
}): MobileTwinTelegramClient {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const groupPath = (huddleId: string): string => `${base}/twin-telegram/huddles/${encodeURIComponent(huddleId)}/group`;
  /** The response, or null when signed out or the request never got an answer. */
  const call = async (method: 'GET' | 'POST' | 'DELETE', path: string): Promise<HttpResponseV1 | null> => {
    const token = deps.token();
    if (!token) return null;
    try {
      return await deps.transport.request({
        method,
        path,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
      });
    } catch {
      return null;
    }
  };
  const ok = (response: HttpResponseV1): boolean => response.status >= 200 && response.status < 300;
  return {
    async botName() {
      const response = await call('GET', `${base}/twin-telegram/link-base`);
      if (response === null || !ok(response)) return null;
      return decodeTwinTelegramLinkBaseV0(response.body)?.botName ?? null;
    },
    async groupState(huddleId) {
      const response = await call('GET', groupPath(huddleId));
      if (response === null || !ok(response)) return null;
      return decodeTwinTelegramGroupStateV0(response.body)?.state ?? null;
    },
    async groupIssue(huddleId) {
      const response = await call('POST', groupPath(huddleId));
      if (response === null) return { ok: false, failure: 'unavailable' };
      if (!ok(response)) return { ok: false, failure: twinTelegramGroupFailureOf(response.status) };
      const issued = decodeTwinTelegramGroupIssuedV0(response.body);
      const url = issued ? twinTelegramGroupAddLinkV0(issued.botName, issued.token) : null;
      return url === null ? { ok: false, failure: 'unavailable' } : { ok: true, url };
    },
    async groupRevoke(huddleId) {
      const response = await call('DELETE', groupPath(huddleId));
      if (response === null) return { ok: false, failure: 'unavailable' };
      if (!ok(response)) return { ok: false, failure: twinTelegramGroupFailureOf(response.status) };
      return decodeTwinTelegramGroupStateV0(response.body)?.state === 'none' ? { ok: true } : { ok: false, failure: 'unavailable' };
    },
  };
}
