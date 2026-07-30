/**
 * mcpReverseCallDispatcher — bridges backend MCP `system.*` tool-call
 * results into the mobile `systemAssistantBridge.requestReverseCall`
 * approval-gate path (T16.3 mobile half).
 *
 * Phase 1 contract:
 *   - Backend tool returns `{ status: 'approval-pending', platform, args }`
 *     for any of the 5 reverse calls.
 *   - Caller (chat surface, voice tool-call handler) detects `system.*`
 *     tool name + status === 'approval-pending' → calls
 *     `dispatchReverseCallToolResult(toolName, args)` here.
 *   - We translate to the mobile bridge args + invoke
 *     `requestReverseCall(req)` → user sees ApprovalAlertCapsule, taps
 *     accept/reject → `Linking.openURL` runs OR rejects.
 *   - Returns a follow-up tool result the caller can feed back to the
 *     LLM so it knows whether the action actually happened.
 *
 * Spec: requirements.md R9.7-R9.9, design.md §Components/Core 6.
 */
import {
  requestReverseCall,
  type ReverseCallArgs,
  type ReverseCallResult,
} from './systemAssistantBridge';
import { addVoiceDiagnostic } from './voiceDiagnostics';

export interface McpReverseCallToolResult {
  /** Original LLM tool_call id so the caller can match the follow-up. */
  toolCallId: string;
  /** What we tell the LLM happened. */
  llmFollowUp: {
    success: boolean;
    /** Concise English summary so the LLM can reason. */
    text: string;
    /** Full structured detail. */
    data: Record<string, unknown>;
  };
}

const SUPPORTED_TOOLS = new Set([
  'system.callPhone',
  'system.openMaps',
  'system.smartHome',
  'system.timer',
  'system.calendar',
]);

export function isSystemReverseCallTool(toolName: string): boolean {
  return SUPPORTED_TOOLS.has(toolName);
}

/**
 * Translate a backend tool-call to the mobile bridge ReverseCallArgs
 * shape. Each tool's args layout is documented in
 * `shared/types/mcp-reverse-tools.ts`.
 */
function toBridgeArgs(toolName: string, args: any): ReverseCallArgs | null {
  if (!args || typeof args !== 'object') return null;
  switch (toolName) {
    case 'system.callPhone': {
      if (!args.number) return null;
      return { kind: 'callPhone', args: { number: String(args.number), reason: args.reason } };
    }
    case 'system.openMaps': {
      if (!args.address) return null;
      return { kind: 'openMaps', args: { address: String(args.address), reason: args.reason } };
    }
    case 'system.smartHome': {
      if (!args.scene) return null;
      return { kind: 'smartHome', args: { scene: String(args.scene), reason: args.reason } };
    }
    case 'system.timer': {
      if (typeof args.minutes !== 'number') return null;
      return { kind: 'timer', args: { minutes: Number(args.minutes), reason: args.reason } };
    }
    case 'system.calendar': {
      if (!args.title || !args.datetime) return null;
      return {
        kind: 'calendar',
        args: { title: String(args.title), datetime: String(args.datetime), reason: args.reason },
      };
    }
    default:
      return null;
  }
}

function summarize(toolName: string, ok: boolean, reason?: string): string {
  const label = toolName.replace('system.', '');
  if (ok) return `${label}: dispatched (user approved)`;
  if (reason === 'user-rejected') return `${label}: user-rejected`;
  if (reason === 'user-disabled') return `${label}: feature-disabled-by-user`;
  if (reason === 'platform-error') return `${label}: platform-error`;
  return `${label}: failed`;
}

/**
 * Process a `system.*` tool-call result. Returns a follow-up tool
 * result the caller passes back to the LLM next turn.
 */
export async function dispatchReverseCallToolResult(
  toolCallId: string,
  toolName: string,
  args: any,
): Promise<McpReverseCallToolResult> {
  if (!isSystemReverseCallTool(toolName)) {
    return {
      toolCallId,
      llmFollowUp: {
        success: false,
        text: `${toolName} is not a recognized reverse-call tool`,
        data: { reason: 'unknown-tool' },
      },
    };
  }
  const bridgeArgs = toBridgeArgs(toolName, args);
  if (!bridgeArgs) {
    return {
      toolCallId,
      llmFollowUp: {
        success: false,
        text: `${toolName} missing required args`,
        data: { reason: 'invalid-args', args },
      },
    };
  }
  addVoiceDiagnostic('mcp-reverse-call', 'dispatch', {
    toolName,
    kind: bridgeArgs.kind,
  });
  const result = await requestReverseCall(bridgeArgs);
  if (result.ok === true) {
    return {
      toolCallId,
      llmFollowUp: {
        success: true,
        text: summarize(toolName, true),
        data: { kind: bridgeArgs.kind, success: true },
      },
    };
  }
  // result.ok is false here — but TS narrowing struggles with the
  // discriminated union when we cast to `ReverseCallResult` above, so
  // pull `reason` via a typed local that asserts the failure shape.
  const failed = result as Extract<typeof result, { ok: false }>;
  return {
    toolCallId,
    llmFollowUp: {
      success: false,
      text: summarize(toolName, false, failed.reason),
      data: { kind: bridgeArgs.kind, success: false, reason: failed.reason },
    },
  };
}
