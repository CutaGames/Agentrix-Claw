/**
 * Live push wiring — MTR-R04 / M0.4.
 *
 * This is the app's ONLY push implementation. `src/services/notifications.ts`
 * was retired in the same change: it had zero importers, so its
 * `setupAndroidChannels()` never ran and the app shipped with no custom
 * Android channel at all. Everything here runs on the live startup path.
 *
 * Decision logic lives in `src/services/pushDestination.ts` (pure, unit
 * tested). This module owns only the side effects: channels, permission,
 * token registration and the two expo-notifications listeners.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  PUSH_TYPE_TO_CHANNEL,
  type PushDestination,
  type PushNotificationType,
  resolvePushDestination,
} from '../services/pushDestination';

const EAS_PROJECT_ID = '96a641e0-ce03-45ff-9de7-2cd89c488236';

export interface MobileNotificationChannelSpec {
  readonly id: string;
  readonly name: string;
  readonly importance: number;
  readonly bypassDnd?: boolean;
  readonly vibrationPattern?: number[];
  /**
   * Android full-screen intent cannot be expressed through
   * `setNotificationChannelAsync`; it needs a native notification builder.
   * Flagged here so the gap is visible rather than assumed (see M3.2).
   */
  readonly requiresFullScreenIntent?: boolean;
}

/**
 * design §6. Importance values are read lazily from `AndroidImportance` so the
 * module stays importable in a node test environment.
 */
export function mobileNotificationChannelSpecs(): MobileNotificationChannelSpec[] {
  const I = Notifications.AndroidImportance;
  return [
    {
      id: 'calls',
      name: '来电',
      importance: I.MAX,
      bypassDnd: true,
      vibrationPattern: [0, 400, 250, 400],
      requiresFullScreenIntent: true,
    },
    { id: 'approvals', name: '待我处理', importance: I.MAX, vibrationPattern: [0, 250, 250, 250] },
    { id: 'twin_critical', name: '分身紧急', importance: I.MAX, vibrationPattern: [0, 250, 250, 250] },
    { id: 'agenda', name: '今日议程', importance: I.HIGH },
    { id: 'handoff', name: '设备接力', importance: I.HIGH },
    { id: 'twin_review', name: '分身每周复核', importance: I.DEFAULT },
  ];
}

export interface AndroidChannelSelfCheck {
  readonly platform: typeof Platform.OS;
  readonly expected: string[];
  readonly present: string[];
  readonly missing: string[];
  readonly ok: boolean;
}

/**
 * Create every channel design §6 requires. Idempotent — expo-notifications
 * updates an existing channel in place.
 */
export async function ensureAndroidNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  for (const spec of mobileNotificationChannelSpecs()) {
    await Notifications.setNotificationChannelAsync(spec.id, {
      name: spec.name,
      importance: spec.importance,
      ...(spec.bypassDnd === undefined ? {} : { bypassDnd: spec.bypassDnd }),
      ...(spec.vibrationPattern ? { vibrationPattern: spec.vibrationPattern } : {}),
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }
}

/**
 * MTR-R04.1 requires a readable self-check after startup. Without it "the
 * channels exist" is an assumption — which is exactly how the dead module
 * went unnoticed.
 */
export async function readAndroidNotificationChannelSelfCheck(): Promise<AndroidChannelSelfCheck> {
  const expected = mobileNotificationChannelSpecs().map((spec) => spec.id);
  if (Platform.OS !== 'android') {
    return { platform: Platform.OS, expected, present: [], missing: expected, ok: false };
  }
  let present: string[] = [];
  try {
    const channels = await Notifications.getNotificationChannelsAsync();
    present = (channels ?? []).map((channel) => channel.id);
  } catch {
    present = [];
  }
  const missing = expected.filter((id) => !present.includes(id));
  return { platform: Platform.OS, expected, present, missing, ok: missing.length === 0 };
}

export function channelIdForPushType(type: PushNotificationType): string {
  return PUSH_TYPE_TO_CHANNEL[type];
}

/**
 * MTR-R04.6 — lock-screen copy is an action hint only. No visitor question
 * text, no amount, no source name. The body is derived from the type, never
 * from the payload.
 */
const LOCK_SCREEN_BODY: Readonly<Record<PushNotificationType, string>> = Object.freeze({
  incoming_call: '有一通来电',
  approval_required: '有一项待你处理',
  twin_critical: '分身需要你立即确认',
  twin_review_required: '有一批分身回答待你确认',
  agenda_reminder: '今日议程有更新',
  handoff_ready: '有一次设备接力待接手',
});

export function lockScreenBodyFor(type: PushNotificationType): string {
  return LOCK_SCREEN_BODY[type];
}

export async function registerForPushNotifications(): Promise<string | null> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    return tokenData.data;
  } catch (e) {
    console.warn('Push token registration failed:', e);
    return null;
  }
}

/**
 * Resolve the destination of a tapped notification.
 *
 * MTR-R04.5: the payload is a routing hint only. Callers SHALL re-authenticate
 * and fresh-read at the destination; nothing here is a decision input.
 */
export function resolveNotificationResponseDestination(
  response: { notification?: { request?: { content?: { data?: unknown } } } } | null | undefined,
): PushDestination {
  return resolvePushDestination(response?.notification?.request?.content?.data);
}

export type { PushDestination };
