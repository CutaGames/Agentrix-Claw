/**
 * Wrist-tap bridge — connects watch wrist-tap intent to phone biometric signing.
 *
 * Wearable PRD requires "raise wrist 1s → approval signed" but L2 backend
 * gating still requires `mobile + biometric`. This bridge resolves the conflict:
 *
 *   1. Watch records wrist-tap → calls `POST /api/v1/approval/:id/wrist-trigger`
 *   2. Backend broadcasts `presence:approval:wrist-trigger` to all surfaces
 *   3. Phone listens via `realtime` channel, surfaces Face/Touch ID via this
 *      bridge's `promptAndSign()` helper.
 *   4. After biometric success, phone POSTs the canonical `/approve`
 *      (surface=mobile, method=biometric, trust_level=3).
 *
 * On phone side this module owns:
 *   - the local notification listener that fires the biometric prompt,
 *   - a debounce so quick-fire taps don't open multiple prompts,
 *   - failure→retry feedback emitted via DeviceEventEmitter for UI banners.
 */
import { DeviceEventEmitter } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { apiFetch } from '../api';

export interface WristTriggerEvent {
  approval_id: string;
  /** Surface where the trigger originated, e.g. `apple-watch-1` */
  device_id: string;
  /** Action summary so the prompt can show context */
  summary?: string;
  amount_cents?: number;
}

const DEBOUNCE_MS = 1500;
let _lastApprovalId: string | null = null;
let _lastAt = 0;
let _started = false;

/** Subscribe once at app start. Idempotent. */
export function startWristTapBridge(): () => void {
  if (_started) return () => {};
  _started = true;
  const sub = DeviceEventEmitter.addListener('presence:approval:wrist-trigger', (e: WristTriggerEvent) => {
    void handleTrigger(e);
  });
  return () => {
    sub.remove();
    _started = false;
  };
}

async function handleTrigger(e: WristTriggerEvent): Promise<void> {
  const now = Date.now();
  if (e.approval_id === _lastApprovalId && now - _lastAt < DEBOUNCE_MS) return;
  _lastApprovalId = e.approval_id;
  _lastAt = now;

  DeviceEventEmitter.emit('agentrix:wrist-prompt-shown', e);
  const ok = await promptAndSign(e);
  DeviceEventEmitter.emit('agentrix:wrist-prompt-resolved', { ...e, ok });
}

/**
 * Prompts Face/Touch ID and on success POSTs the canonical approval. Returns
 * true if the approval was signed by the backend.
 */
export async function promptAndSign(e: WristTriggerEvent): Promise<boolean> {
  try {
    const hasHw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHw || !enrolled) {
      DeviceEventEmitter.emit('agentrix:wrist-prompt-error', { ...e, reason: 'biometric_unavailable' });
      return false;
    }
    const summary = e.amount_cents
      ? `批准 $${(e.amount_cents / 100).toFixed(2)} 操作`
      : e.summary || '批准来自手表的请求';
    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: summary,
      fallbackLabel: '使用密码',
      cancelLabel: '取消',
    });
    if (!auth.success) {
      DeviceEventEmitter.emit('agentrix:wrist-prompt-error', { ...e, reason: 'biometric_failed' });
      return false;
    }
    await apiFetch(`/v1/approval/${e.approval_id}/approve`, {
      method: 'POST',
      body: JSON.stringify({
        surface: 'mobile',
        device_id: 'phone-paired',
        method: 'biometric',
        trust_level: 3,
      }),
    });
    return true;
  } catch (err: any) {
    DeviceEventEmitter.emit('agentrix:wrist-prompt-error', {
      ...e,
      reason: 'network',
      message: err?.message,
    });
    return false;
  }
}
