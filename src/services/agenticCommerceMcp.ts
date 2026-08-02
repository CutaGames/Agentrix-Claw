/**
 * agenticCommerceMcp — wire `agenticCommerce.evaluateAgenticAction` into
 * the mcp tool-call execution path (T19.2).
 *
 * The mobile chat surface dispatches tool-call results via the existing
 * `dispatchIntent` / `safeNavigate` helpers; for commerce-style tools
 * (purchase / install-skill / world-engine-quota / task-market-accept /
 * world-asset-purchase) we want to interpose evaluateAgenticAction
 * so:
 *   - 'auto-execute' → caller proceeds; we emit `wallet-delta` +
 *     `agentic-commerce action:executed` for capsule + push trail
 *   - 'request-approval' → caller pauses; we emit
 *     `trust3-signing-request` so user signs before LLM continues
 *   - 'block' → caller aborts; LLM gets a "blocked" tool result
 *
 * Phase 1 spec implements only the gating logic; the actual wallet
 * transfer / API call is the caller's responsibility.
 */
import { evaluateAgenticAction, type AgenticCategory, type AgenticCommerceDecision } from './agenticCommerce.service';
import { companionEvents } from './companionEvents.service';
import { createSignRequest } from './signRequest.service';
import { addVoiceDiagnostic } from './voiceDiagnostics';

export interface McpCommerceCheck {
  petId: string;
  category: AgenticCategory;
  amount: number;
  description: string;
  /** Free-text hint surfaced to the user via approval capsule. */
  summary?: { from?: string; to?: string; amount?: string; gas?: string };
}

export interface McpCommerceResult {
  decision: AgenticCommerceDecision;
  /** When 'request-approval' or 'block', this is the message the caller
   *  should pass back to the LLM so it understands. */
  llmFeedback: string;
  /** Generated signRequestId when 'request-approval' was issued. */
  signRequestId?: string;
}

/**
 * Run an mcp commerce tool-call through the agentic commerce gate.
 * Caller is expected to:
 *   - When `decision.action === 'auto-execute'` → perform the actual
 *     transfer / API call, then call `notifyAgenticExecuted` below.
 *   - When `'request-approval'` → wait for `trust3-signing-completed`
 *     event for the same `signRequestId` (Trust3SigningSheet renders
 *     above the chat) before performing the actual transfer.
 *   - When `'block'` → surface `result.llmFeedback` to the LLM via the
 *     mcp tool result channel.
 */
export async function gateMcpCommerce(req: McpCommerceCheck): Promise<McpCommerceResult> {
  const decision = await evaluateAgenticAction({
    petId: req.petId,
    category: req.category,
    amount: req.amount,
    description: req.description,
  });

  addVoiceDiagnostic('agentic-commerce-mcp', decision.action, {
    category: req.category,
    amount: req.amount,
    reason: decision.reason,
  });

  if (decision.action === 'auto-execute') {
    return {
      decision,
      llmFeedback: `auto-execute approved (within limits). Perform the action.`,
    };
  }

  if (decision.action === 'request-approval') {
    // Create sign-request and emit so Trust3SigningSheet renders.
    try {
      const signed = await createSignRequest({
        reason: 'agentic-commerce-overlimit',
        metadata: {
          petId: req.petId,
          category: req.category,
          amount: req.amount,
          description: req.description,
          summary: req.summary ?? {
            amount: `$${req.amount.toFixed(2)}`,
          },
          risk: 'L2',
          riskExplanationZh: `此次交易超出 Aira 的自主限额(${decision.reason}),需要你签名。`,
        },
        timeoutSeconds: 60,
      });
      companionEvents.emit({
        type: 'trust3-signing-request',
        signRequestId: signed.id,
        reason: 'agentic-commerce-overlimit',
        metadata: signed.metadata ?? {},
        expiresAtMs: signed.expiresAt ? Date.parse(signed.expiresAt) : Date.now() + 60_000,
      });
      return {
        decision,
        llmFeedback: `pending-user-approval (${decision.reason}). Wait for signature.`,
        signRequestId: signed.id,
      };
    } catch (err) {
      addVoiceDiagnostic('agentic-commerce-mcp', 'sign-request-failed', {
        error: (err as Error).message,
      });
      return {
        decision: { action: 'block', reason: 'feature-disabled' },
        llmFeedback: `blocked (could not create sign-request: ${(err as Error).message})`,
      };
    }
  }

  // decision.action === 'block'
  return {
    decision,
    llmFeedback: `blocked (${decision.reason}). Try a different approach or ask user.`,
  };
}

/**
 * Convenience after the caller actually performs an auto-execute
 * commerce action — emits `wallet-delta` so WalletCapsule animates and
 * `agentic-commerce action:executed` so push notification fires.
 */
export function notifyAgenticExecuted(opts: {
  petId: string;
  category: AgenticCategory;
  amount: number;
  currency?: 'USDC' | 'AXP' | 'BTC';
  description?: string;
}): void {
  const currency = opts.currency ?? 'USDC';
  companionEvents.emit({
    type: 'wallet-delta',
    delta: -Math.abs(opts.amount),
    currency,
    source: 'agentic-commerce',
    petId: opts.petId,
    note: opts.description,
  });
  companionEvents.emit({
    type: 'agentic-commerce',
    action: 'executed',
    kind: opts.category,
    amount: opts.amount,
  });
  addVoiceDiagnostic('agentic-commerce-mcp', 'executed', {
    category: opts.category,
    amount: opts.amount,
  });
}
