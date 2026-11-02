import { PUSH_GENERIC_TEXT } from '../../shared/types/push-notification';
import { getTwinStatusWebUrl, isIntroductionRef } from './webHandoff';

/**
 * L9 package 3 C3: where a tapped referral push lands (pure, no react-native import).
 *
 * The three referral alerts (approval / replied / received) ride one phone push type,
 * `introduction_update`, with ref `int_<id>`. The push opens 事项 → 待我处理 (`mobilePush.ts`,
 * unchanged); `MattersHomeScreen` shows a fixed hint plus a "View on web" button when the route
 * ref is an `int_` ref.
 *
 * What this module guarantees:
 *   - It reads nothing from the network. The only inputs are the route `ref` (used to tell
 *     "this is a referral push", never shown, never put in the URL) and the Agent id of the
 *     signed-in session.
 *   - The web address is built from the signed-in user's own Agent id. An Agent id carried by a
 *     push payload is dropped before the route (`resolveFourZoneNavigation` keeps `tab` + `ref`
 *     only) and is not an input here.
 *   - The copy is constant: no name, contact or other text from the payload.
 */
export const INTRODUCTION_LANDING_COPY = {
  // The same title the user just tapped (one source, cannot drift from the push).
  title: {
    zh: PUSH_GENERIC_TEXT.introduction_update.zh.title,
    en: PUSH_GENERIC_TEXT.introduction_update.en.title,
  },
  body: {
    zh: '可能是有转介等你批准，你转出的客户对方回复了，或有转介人把客户转给你。手机上暂时不能处理转介，请在网页上查看。',
    en: "A referral may be waiting for your approval, a client you referred may have had a reply, or a referrer may have sent a client your way. Referrals can't be handled on the phone yet, so please view them on the web.",
  },
  openWeb: { zh: '在网页上查看', en: 'View on web' },
  noTwin: {
    zh: '手机上还没有读到你的分身，请到网页上登录后查看。',
    en: 'Your twin has not loaded on this phone yet. Sign in on the web to view it.',
  },
} as const;

export interface IntroductionLanding {
  /** The signed-in user's own web twin status page; `null` when the session has no usable Agent id. */
  webUrl: string | null;
}

/**
 * `null` when the route ref is not a referral ref (the screen shows nothing extra, as before).
 * Otherwise the landing, whose address uses `sessionAgentAccountId` only.
 */
export function resolveIntroductionLanding(input: {
  routeRef: unknown;
  sessionAgentAccountId: string | null | undefined;
  baseUrl?: string;
}): IntroductionLanding | null {
  if (!isIntroductionRef(input.routeRef)) return null;
  return { webUrl: getTwinStatusWebUrl(input.sessionAgentAccountId, input.baseUrl) };
}
