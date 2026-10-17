/**
 * GlassAuthInterceptor — Intercepts payment-intent signals from Agent
 * responses on the glass voice channel and delegates MPC signing to the phone.
 *
 * Flow:
 *   1. Agent response contains a payment intent (tool_call: create_payment_intent)
 *   2. This interceptor catches the intent before TTS / HUD delivery
 *   3. Phone shows a biometric/PIN confirmation modal
 *   4. On approval → phone sends shard A to MPCSignerService
 *   5. Result relayed back to the glass voice session
 *
 * This keeps the glass as a "thin client" — all sensitive key material
 * stays on the phone. The glass never sees shard A or signing secrets.
 */

// React Native compatible EventEmitter (no 'events' polyfill needed)
class EventEmitter {
  private _listeners: Record<string, Array<(...args: any[]) => void>> = {};
  on(event: string, fn: (...args: any[]) => void) { (this._listeners[event] ??= []).push(fn); return this; }
  off(event: string, fn: (...args: any[]) => void) { this._listeners[event] = (this._listeners[event] || []).filter(l => l !== fn); return this; }
  emit(event: string, ...args: any[]) { for (const fn of this._listeners[event] || []) fn(...args); return true; }
  removeAllListeners(event?: string) { if (event) delete this._listeners[event]; else this._listeners = {}; return this; }
}
import type { Socket } from 'socket.io-client';

// ── Types ──────────────────────────────────────────────

/** Payment intent detected in an agent response */
export interface DetectedPaymentIntent {
  /** Unique intent ID from the agent tool call */
  intentId: string;
  /** Recipient address or merchant */
  to: string;
  /** Amount as string (avoids floating-point) */
  amount: string;
  /** Token symbol (e.g. 'USDC', 'ETH') */
  token: string;
  /** Optional memo / description */
  memo?: string;
  /** Raw tool_call payload for audit */
  rawPayload: Record<string, unknown>;
}

/** Result of the phone-side MPC signing flow */
export interface PaymentAuthResult {
  intentId: string;
  approved: boolean;
  txHash?: string;
  errorMessage?: string;
}

export interface GlassAuthInterceptorCallbacks {
  /** Called when a payment intent is detected — show phone confirmation UI */
  onPaymentDetected?: (intent: DetectedPaymentIntent) => void;
  /** Called when the user approves/rejects on phone */
  onPaymentResult?: (result: PaymentAuthResult) => void;
  onError?: (error: Error) => void;
}

// ── Known tool-call names that trigger payment ─────────

const PAYMENT_TOOL_NAMES = new Set([
  'create_payment_intent',
  'agent_payment',
  'quick_pay',
  'transfer_token',
  'x402_pay',
]);

// ── Service ────────────────────────────────────────────

export class GlassAuthInterceptor extends EventEmitter {
  private voiceSocket: Socket | null = null;
  private callbacks: GlassAuthInterceptorCallbacks;
  private pendingIntents = new Map<string, DetectedPaymentIntent>();
  private sessionId: string;
  private socketListenerCleanup: (() => void) | null = null;
  private active = false;

  constructor(sessionId: string, callbacks: GlassAuthInterceptorCallbacks = {}) {
    super();
    this.sessionId = sessionId;
    this.callbacks = callbacks;
  }

  // ── Attach to voice socket ──────────────────────────

  /**
   * Start intercepting agent tool calls on the given voice socket.
   * Listens for `voice:agent:tool_call` events.
   */
  attach(voiceSocket: Socket): void {
    if (this.active) return;
    this.active = true;
    this.voiceSocket = voiceSocket;

    const toolCallHandler = (data: {
      sessionId: string;
      toolName: string;
      toolCallId: string;
      arguments: Record<string, unknown>;
    }) => {
      if (data.sessionId !== this.sessionId) return;
      if (!PAYMENT_TOOL_NAMES.has(data.toolName)) return;

      this.handlePaymentToolCall(data);
    };

    voiceSocket.on('voice:agent:tool_call', toolCallHandler);
    this.socketListenerCleanup = () => {
      voiceSocket.off('voice:agent:tool_call', toolCallHandler);
    };
  }

  // ── Detach ──────────────────────────────────────────

  detach(): void {
    this.active = false;
    this.socketListenerCleanup?.();
    this.socketListenerCleanup = null;
    this.voiceSocket = null;
    this.pendingIntents.clear();
  }

  // ── Submit user decision from phone ─────────────────

  /**
   * Called by the phone confirmation UI after biometric/PIN approval.
   * This sends the approval result back to the Voice Gateway so the
   * agent can proceed (or report rejection).
   */
  submitDecision(result: PaymentAuthResult): void {
    const intent = this.pendingIntents.get(result.intentId);
    if (!intent) {
      this.callbacks.onError?.(new Error(`Unknown intent: ${result.intentId}`));
      return;
    }

    this.pendingIntents.delete(result.intentId);

    // Send tool result back to the agent via Voice Gateway
    this.voiceSocket?.emit('voice:tool_result', {
      sessionId: this.sessionId,
      toolCallId: result.intentId,
      result: result.approved
        ? { success: true, txHash: result.txHash }
        : { success: false, error: result.errorMessage || 'User rejected payment' },
    });

    this.callbacks.onPaymentResult?.(result);
    this.emit('paymentResult', result);
  }

  // ── Inspect pending intents ─────────────────────────

  getPendingIntents(): DetectedPaymentIntent[] {
    return [...this.pendingIntents.values()];
  }

  get isActive(): boolean {
    return this.active;
  }

  // ── Private ─────────────────────────────────────────

  private handlePaymentToolCall(data: {
    toolName: string;
    toolCallId: string;
    arguments: Record<string, unknown>;
  }): void {
    const args = data.arguments;

    const intent: DetectedPaymentIntent = {
      intentId: data.toolCallId,
      to: String(args.to || args.recipient || args.merchant || ''),
      amount: String(args.amount || '0'),
      token: String(args.token || args.currency || 'USDC'),
      memo: args.memo ? String(args.memo) : undefined,
      rawPayload: data.arguments,
    };

    this.pendingIntents.set(intent.intentId, intent);

    // Notify phone UI to show confirmation modal
    this.callbacks.onPaymentDetected?.(intent);
    this.emit('paymentDetected', intent);

    // Send a hold signal to the Voice Gateway — pause agent response
    // until the user confirms on phone
    this.voiceSocket?.emit('voice:tool_hold', {
      sessionId: this.sessionId,
      toolCallId: data.toolCallId,
      reason: 'awaiting_user_payment_confirmation',
    });
  }
}
