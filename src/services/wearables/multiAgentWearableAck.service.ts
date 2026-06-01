/**
 * Multi-Agent v2.1 — Wearable acknowledgement on sub-task complete.
 *
 * Subscribes to the existing notification stream (Expo Notifications +
 * Apple Push) and emits a wearable haptic pulse + minimal text-only
 * complication update when a sub-task with deeplink
 * `agentrix://multi-agent/sub-task/...` arrives.
 *
 * Architecture:
 *   - We piggy-back on the existing Expo Notifications listener wired by
 *     `App.tsx`. When the listener fires for a sub-task push, it forwards
 *     to `handleSubTaskAck` here, which:
 *       1. Triggers a 200ms haptic pulse via expo-haptics
 *       2. Pushes a transient line to `watchAxpComplication` (paired
 *          watch shows "🦊 sub-task done" for 5s)
 *       3. If a paired BLE wearable has the
 *          `wearable_capability.acknowledge_sub_task` flag, sends an
 *          `ack_sub_task` BLE message
 *
 * Design notes:
 *   - Strictly a fan-out adapter — does NOT duplicate push or modify
 *     server state.
 *   - All side effects fail open (try/catch with logger).
 *   - Subscribed by App.tsx via `subscribeMultiAgentWearableAck()` once
 *     at startup; safe to call multiple times (idempotent).
 *
 * Spec: MULTI_AGENT_V2_1_PRODUCT_DECISIONS §8 P2 #15.
 */

import * as Haptics from 'expo-haptics';

interface NotificationPayload {
  title?: string;
  body?: string;
  data?: {
    deeplink?: string;
    subTaskId?: string;
    parentTaskId?: string;
    [k: string]: any;
  };
}

let subscribed = false;

/**
 * Detect whether a notification payload looks like a multi-agent sub-task
 * completion based on its deeplink.
 */
export function isMultiAgentSubTaskPush(p: NotificationPayload | null): boolean {
  if (!p) return false;
  const dl = p?.data?.deeplink;
  return typeof dl === 'string' && dl.startsWith('agentrix://multi-agent/sub-task/');
}

/**
 * Handle a multi-agent sub-task acknowledgement. Triggers haptic + watch
 * complication update + BLE ack (when paired). All effects best-effort.
 */
export async function handleSubTaskAck(p: NotificationPayload): Promise<void> {
  if (!isMultiAgentSubTaskPush(p)) return;

  // 1. Haptic pulse (best-effort)
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    /* ignore — device may not support */
  }

  // 2. Watch complication update — push a transient line. Service handles
  // paired-watch detection internally, so we just call and ignore failures.
  try {
    const mod = await import('./watchAxpComplication.service');
    const svc: any = (mod as any).WatchAxpComplicationService || mod;
    if (svc && typeof svc.pushTransient === 'function') {
      await svc.pushTransient({
        title: p.title || '🦊 sub-task done',
        body: (p.body || '').slice(0, 60),
        ttlSeconds: 5,
      });
    }
  } catch {
    /* ignore */
  }

  // 3. BLE ack to paired wearable (when it advertises the cap flag).
  try {
    const mod = await import('./wearableAgentCapability.service');
    const reg: any = (mod as any).WearableAgentCapabilityService || mod;
    if (
      reg &&
      typeof reg.dispatchAck === 'function' &&
      typeof reg.hasCapability === 'function' &&
      reg.hasCapability('acknowledge_sub_task')
    ) {
      await reg.dispatchAck({
        kind: 'sub_task_complete',
        subTaskId: p.data?.subTaskId,
        parentTaskId: p.data?.parentTaskId,
      });
    }
  } catch {
    /* ignore */
  }
}

/**
 * Attach a notification listener so multi-agent sub-task pushes fan out
 * to wearable ack. Idempotent — safe to call twice (subsequent calls no-op).
 *
 * This is wired from App.tsx so the listener is always registered after
 * Expo Notifications boot.
 */
export async function subscribeMultiAgentWearableAck(): Promise<void> {
  if (subscribed) return;
  try {
    const Notifications = await import('expo-notifications');
    Notifications.addNotificationReceivedListener((notification) => {
      const content = notification?.request?.content || {};
      const payload: NotificationPayload = {
        title: content.title || undefined,
        body: content.body || undefined,
        data: (content.data as any) || undefined,
      };
      handleSubTaskAck(payload).catch(() => {
        /* swallow */
      });
    });
    subscribed = true;
  } catch {
    // expo-notifications missing in this build — skip silently.
  }
}
