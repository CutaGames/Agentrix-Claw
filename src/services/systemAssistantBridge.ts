/**
 * systemAssistantBridge — reverse calls (T16, mode B).
 *
 * The pet's LLM tool-call layer can request OS-level actions via this
 * bridge: dial a phone number, open Maps, run a HomeKit / Google Home
 * scene, set a timer, create a calendar event. Each call is **gated
 * by an Approval_Alert** so the user always sees + confirms before the
 * OS intent fires (R9.7-R9.9).
 *
 * Phase 1 design:
 *   - 5 platform calls; per-kind enable/disable flag in storage so users
 *     can globally turn off "Aira can call my phone" etc.
 *   - approval gating happens via companionEvents:
 *       1) request() emits 'approval-incoming' (capsule visible)
 *       2) caller listens for trust3-signing-completed OR a specific
 *          approval-resolved emit and then dispatches the actual intent.
 *     For Phase 1 simplicity we resolve the gating inline via Promise:
 *     `request()` returns a Promise that the caller awaits; the user's
 *     tap on the ApprovalAlertCapsule resolves it.
 *
 * Spec: requirements.md R9.7 / R9.8 / R9.9, design.md §Components/Core 6.
 */
import { Linking, Platform } from 'react-native';
import { addVoiceDiagnostic } from './voiceDiagnostics';
import { companionEvents } from './companionEvents.service';

export type ReverseCallKind =
  | 'callPhone'
  | 'openMaps'
  | 'smartHome'
  | 'timer'
  | 'calendar';

export interface ReverseCallPolicy {
  callPhone: boolean;
  openMaps: boolean;
  smartHome: boolean;
  timer: boolean;
  calendar: boolean;
}

export const DEFAULT_REVERSE_CALL_POLICY: ReverseCallPolicy = {
  callPhone: false, // off by default — high-friction risk
  openMaps: true,
  smartHome: false,
  timer: true,
  calendar: false,
};

const STORAGE_KEY = 'reverse_call_policy/v1';

let _storage: { getString(k: string): string | undefined; set(k: string, v: string): void } = {
  getString: () => undefined,
  set: () => undefined,
};
let _storageBound = false;

function getStorage() {
  if (_storageBound) return _storage;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mod = require('../stores/mmkvStorage') as typeof import('../stores/mmkvStorage');
    _storage = mod.mmkv as unknown as typeof _storage;
  } catch {
    /* keep no-op */
  }
  _storageBound = true;
  return _storage;
}

export function getReverseCallPolicy(): ReverseCallPolicy {
  try {
    const raw = getStorage().getString(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_REVERSE_CALL_POLICY };
    return { ...DEFAULT_REVERSE_CALL_POLICY, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_REVERSE_CALL_POLICY };
  }
}

export function setReverseCallPolicy(patch: Partial<ReverseCallPolicy>): ReverseCallPolicy {
  const next = { ...getReverseCallPolicy(), ...patch };
  try {
    getStorage().set(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export interface CallPhoneArgs {
  number: string;
  reason?: string;
}
export interface OpenMapsArgs {
  address: string;
  reason?: string;
}
export interface SmartHomeArgs {
  scene: string;
  reason?: string;
}
export interface TimerArgs {
  minutes: number;
  reason?: string;
}
export interface CalendarArgs {
  title: string;
  datetime: string; // ISO 8601
  reason?: string;
}

export type ReverseCallArgs =
  | { kind: 'callPhone'; args: CallPhoneArgs }
  | { kind: 'openMaps'; args: OpenMapsArgs }
  | { kind: 'smartHome'; args: SmartHomeArgs }
  | { kind: 'timer'; args: TimerArgs }
  | { kind: 'calendar'; args: CalendarArgs };

export type ReverseCallResult =
  | { ok: true; kind: ReverseCallKind }
  | { ok: false; kind: ReverseCallKind; reason: 'user-disabled' | 'user-rejected' | 'platform-error' };

/**
 * Map a reverse call into a human-readable approval prompt.
 */
function summarizeForApproval(req: ReverseCallArgs): string {
  switch (req.kind) {
    case 'callPhone':
      return `打电话给 ${req.args.number}${req.args.reason ? ` (${req.args.reason})` : ''}`;
    case 'openMaps':
      return `在地图上打开「${req.args.address}」`;
    case 'smartHome':
      return `执行场景「${req.args.scene}」`;
    case 'timer':
      return `设置 ${req.args.minutes} 分钟倒计时`;
    case 'calendar':
      return `添加日程「${req.args.title}」`;
  }
}

/**
 * Request a reverse call. Returns a Promise that resolves with the
 * outcome. Phase 1 uses a simple in-process Promise registry — when the
 * user taps the ApprovalAlertCapsule, it resolves the corresponding
 * approval id.
 */
const _pendingApprovals = new Map<
  string,
  (decision: 'approve' | 'reject') => void
>();

export function resolveReverseCallApproval(approvalId: string, decision: 'approve' | 'reject'): void {
  const fn = _pendingApprovals.get(approvalId);
  if (fn) {
    _pendingApprovals.delete(approvalId);
    fn(decision);
  }
}

export async function requestReverseCall(req: ReverseCallArgs): Promise<ReverseCallResult> {
  const policy = getReverseCallPolicy();
  if (!policy[req.kind]) {
    addVoiceDiagnostic('system-assistant-reverse', 'user-disabled', { kind: req.kind });
    return { ok: false, kind: req.kind, reason: 'user-disabled' };
  }

  const approvalId = `reverse-${req.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const summary = summarizeForApproval(req);

  // Surface ApprovalAlertCapsule via the bus.
  companionEvents.emit({
    type: 'approval-incoming',
    approvalId,
    risk: 'L2',
    title: 'Aira 想做这件事',
    summary,
  });
  addVoiceDiagnostic('system-assistant-reverse', 'requested', { kind: req.kind, summary });

  // Wait up to 60s for user resolution.
  const decision = await new Promise<'approve' | 'reject' | 'timeout'>((resolve) => {
    _pendingApprovals.set(approvalId, resolve);
    setTimeout(() => {
      if (_pendingApprovals.has(approvalId)) {
        _pendingApprovals.delete(approvalId);
        resolve('timeout');
      }
    }, 60_000);
  });

  if (decision !== 'approve') {
    addVoiceDiagnostic('system-assistant-reverse', 'user-rejected', { kind: req.kind, decision });
    return { ok: false, kind: req.kind, reason: 'user-rejected' };
  }

  try {
    await invokePlatformIntent(req);
    addVoiceDiagnostic('system-assistant-reverse', 'invoked', { kind: req.kind });
    return { ok: true, kind: req.kind };
  } catch (err) {
    addVoiceDiagnostic('system-assistant-reverse', 'platform-error', {
      kind: req.kind,
      error: (err as Error).message,
    });
    return { ok: false, kind: req.kind, reason: 'platform-error' };
  }
}

async function invokePlatformIntent(req: ReverseCallArgs): Promise<void> {
  switch (req.kind) {
    case 'callPhone': {
      const url = Platform.OS === 'ios' ? `tel:${req.args.number}` : `tel:${req.args.number}`;
      await Linking.openURL(url);
      return;
    }
    case 'openMaps': {
      const enc = encodeURIComponent(req.args.address);
      const url =
        Platform.OS === 'ios'
          ? `https://maps.apple.com/?q=${enc}`
          : `geo:0,0?q=${enc}`;
      await Linking.openURL(url);
      return;
    }
    case 'smartHome': {
      // Phase 1 best-effort: HomeKit is gated behind native code; fall
      // back to instructing the user to open the home app.
      const url = Platform.OS === 'ios' ? 'x-apple-homekit://' : 'https://home.google.com/';
      await Linking.openURL(url);
      return;
    }
    case 'timer': {
      // iOS Shortcuts deep-link to set timer (best-effort)
      const url =
        Platform.OS === 'ios'
          ? `shortcuts://run-shortcut?name=Set+Timer&input=${req.args.minutes}`
          : `https://www.google.com/search?q=set+timer+${req.args.minutes}+minutes`;
      await Linking.openURL(url);
      return;
    }
    case 'calendar': {
      const url = Platform.OS === 'ios' ? 'calshow:' : 'content://com.android.calendar/time/';
      await Linking.openURL(url);
      return;
    }
  }
}
