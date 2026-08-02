/**
 * companionEvents — central event bus for the P-9 Companion Layer.
 *
 * One bus to rule them all: the CompanionBall, ConversationBubble,
 * PetDetailSheet, Trust3SigningSheet, WalletCapsule, ApprovalAlertCapsule,
 * VoiceGreetCapsule, AmbientPresenceBridge, and Lock_Screen_Pet all
 * subscribe here instead of directly hooking sockets / stores. Sources
 * (presence socket, authStore, mpc-wallet, pet-companion-engine,
 * agenticCommerce, etc.) emit events typed by the CompanionEvent
 * discriminated union.
 *
 * Why an in-memory event bus and not Zustand:
 *   - These events are *transient* (capsule briefly visible, sheet
 *     bounce, mode flicker). They do not belong in persistent state.
 *   - Multiple unrelated listeners often want the same event. Zustand
 *     selectors fan-in poorly for that pattern.
 *   - Each emit is automatically logged to voiceDiagnostics for the
 *     R12.1 monitoring story so we never have a "wrote it but no one
 *     received" black hole.
 *
 * Pure JS — safe to import in jest tests without RN runtime.
 *
 * Spec: requirements.md R12.1, design.md §Components/Core 1.
 */
import { addVoiceDiagnostic } from './voiceDiagnostics';
import type { PetMode } from './petMode';
import type { CompanionMode } from './petMode';

// ─── Discriminated union of every cross-domain event ────────────────────
export type CompanionEvent =
  | {
      type: 'mode-changed';
      from: CompanionMode;
      to: CompanionMode;
      source: string;
    }
  | {
      type: 'active-pet-changed';
      from: string | null;
      to: string;
    }
  | {
      type: 'wallet-delta';
      delta: number;
      currency: 'USDC' | 'AXP' | 'BTC' | string;
      balanceAfter?: number;
      source:
        | 'transfer-in' | 'transfer-out' | 'marketplace-purchase' | 'marketplace-sale'
        | 'agentic-commerce' | 'subscription-charge' | 'withdrawal' | 'deposit' | 'other';
      petId?: string | null;
      note?: string | null;
    }
  | {
      type: 'approval-incoming';
      approvalId: string;
      risk: 'L0' | 'L1' | 'L2' | 'L3';
      title?: string;
      summary?: string;
    }
  | {
      type: 'voice-greet';
      scenario: 'morning' | 'evening' | 'comeback' | 'milestone' | 'manual';
      text: string;
      ttsUrl?: string | null;
      lang?: 'zh' | 'en';
    }
  | {
      type: 'cross-device-event';
      sourceDevice: 'desktop' | 'web' | 'watch' | 'glass' | 'mobile';
      eventType: string;
      payload: unknown;
    }
  | {
      type: 'world-engine-event';
      kind: 'asset-ready' | 'battle-pending' | 'asset-bought' | 'dungeon-invite';
      assetId?: string;
      battleId?: string;
      shareCode?: string;
    }
  | {
      type: 'skill-update';
      skillId: string;
      installedVersion?: string;
      newVersion: string;
      introducesNewPermissions: boolean;
    }
  | {
      type: 'agentic-commerce';
      action: 'executed' | 'blocked' | 'over-limit';
      kind?: string;
      amount?: number;
      reason?: string;
    }
  | {
      type: 'trust3-signing-request';
      signRequestId: string;
      reason:
        | 'wallet-transfer' | 'marketplace-purchase' | 'skill-install'
        | 'remote-control' | 'approval' | 'agentic-commerce-overlimit';
      metadata: Record<string, unknown>;
      expiresAtMs: number;
    }
  | {
      type: 'trust3-signing-completed';
      signRequestId: string;
      success: boolean;
      durationMs?: number;
    }
  | {
      type: 'trust3-signing-cancelled';
      signRequestId: string;
      reason?: string;
    }
  | {
      type: 'capsule-show';
      capsuleType: 'wallet' | 'approval' | 'voice-greet';
      payload: unknown;
      ttlMs?: number;
    }
  | {
      type: 'remote-control-sent';
      targetDeviceId: string;
      command: string;
    }
  | {
      type: 'remote-control-ack';
      targetDeviceId: string;
      command: string;
      success: boolean;
      durationMs?: number;
    }
  | {
      type: 'sprite-action';
      // Lightweight one-shot animation cue; e.g. desktop fed our pet → "eat"
      action: PetMode | string;
      ttlMs?: number;
      source?: string;
    };

export type CompanionEventType = CompanionEvent['type'];
export type CompanionEventOf<T extends CompanionEventType> = Extract<
  CompanionEvent,
  { type: T }
>;

// ─── PII redaction before logging to voiceDiagnostics ───────────────────
const PII_KEY_PATTERNS = [
  /^signature$/i,
  /^token$/i,
  /^privateKey$/i,
  /^address$/i, // wallet address — mostly fine but cautious
  /^email$/i,
  /^phone$/i,
];

function redactPII<T>(payload: T): T {
  if (!payload || typeof payload !== 'object') return payload;
  const out: any = Array.isArray(payload) ? [...payload] : { ...payload };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (PII_KEY_PATTERNS.some((re) => re.test(k))) {
      out[k] = '[redacted]';
    } else if (v && typeof v === 'object') {
      out[k] = redactPII(v);
    }
  }
  return out;
}

// ─── Bus implementation ─────────────────────────────────────────────────
type Listener<T extends CompanionEventType> = (
  evt: CompanionEventOf<T>,
) => void;
type AnyListener = (evt: CompanionEvent) => void;

class CompanionEventBus {
  private byType = new Map<CompanionEventType, Set<(evt: any) => void>>();
  private wildcard = new Set<AnyListener>();

  emit<T extends CompanionEvent>(evt: T): void {
    // Telemetry first (so failures in user listeners don't drop the log).
    try {
      addVoiceDiagnostic('companion-events', evt.type, redactPII(evt as any));
    } catch {
      /* never fail */
    }

    const subs = this.byType.get(evt.type);
    if (subs) {
      // Snapshot to allow listeners to unsubscribe during dispatch
      for (const cb of Array.from(subs)) {
        try {
          cb(evt);
        } catch (err) {
          console.warn(`[companionEvents] ${evt.type} listener threw:`, err);
        }
      }
    }
    if (this.wildcard.size > 0) {
      for (const cb of Array.from(this.wildcard)) {
        try {
          cb(evt);
        } catch (err) {
          console.warn('[companionEvents] wildcard listener threw:', err);
        }
      }
    }
  }

  /** Subscribe to a specific event type. Returns unsubscribe. */
  subscribe<T extends CompanionEventType>(type: T, cb: Listener<T>): () => void {
    let bag = this.byType.get(type);
    if (!bag) {
      bag = new Set();
      this.byType.set(type, bag);
    }
    bag.add(cb as any);
    return () => {
      this.byType.get(type)?.delete(cb as any);
    };
  }

  /** Subscribe to every event (use sparingly — useful for diagnostics overlays). */
  subscribeAll(cb: AnyListener): () => void {
    this.wildcard.add(cb);
    return () => {
      this.wildcard.delete(cb);
    };
  }

  /** @internal Remove every listener — for tests only. */
  _resetForTests(): void {
    this.byType.clear();
    this.wildcard.clear();
  }

  /** @internal Listener counts for assertion. */
  _listenerCount(type?: CompanionEventType): number {
    if (type) return this.byType.get(type)?.size ?? 0;
    let total = this.wildcard.size;
    this.byType.forEach((s) => (total += s.size));
    return total;
  }
}

export const companionEvents = new CompanionEventBus();

// Re-export the redact helper for tests / advanced use cases.
export { redactPII as _redactPII };
