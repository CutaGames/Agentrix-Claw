/**
 * Turn Router — tri-tier (local / cloud / auto) execution decision.
 *
 * Single source of truth for:
 *   - Which tier runs this turn (local sidecar vs cloud proxy)
 *   - Whether cloud fallback is allowed when local fails
 *   - Which model id to show in the header
 *
 * Consumed by mobile (AgentChatScreen.tsx) and mirrored in desktop (ChatPanel.tsx via
 * desktop/src/services/turnRouter.ts which re-exports the same contract).
 */

export type ExecutionMode = 'local-only' | 'auto' | 'cloud-only';
export type ExecutionTier = 'local' | 'cloud';

export interface TierResolutionInput {
  /** User's currently-picked model id (from ModelCatalogSheet). */
  selectedModelId?: string | null;
  /** User preference: force local, force cloud, or auto. */
  executionMode: ExecutionMode;
  /** Agent's preferred cloud model, used when tier=cloud. */
  agentPreferredModel?: string | null;
  /** Instance's last resolved remote model, used as secondary fallback. */
  instanceResolvedModel?: string | null;
  /** Hardcoded final fallback (e.g. 'claude-haiku-4-5'). */
  finalFallbackModel: string;
  /** Predicate that returns true if a model id is an on-device / local model. */
  isLocalModelId: (id?: string | null) => boolean;
  /** Whether the local runtime (sidecar / llama-rn bridge) is ready. */
  localRuntimeReady: boolean;
  /** Turn classification result from classifyTurnForAuto (only used in auto mode). */
  autoClassification?: ExecutionTier;
}

export interface TierResolutionResult {
  /** Tier that will actually execute. */
  tier: ExecutionTier;
  /** Whether silent cloud fallback is permitted when tier=local fails. */
  allowCloudFallback: boolean;
  /** Model id to send over the wire (to local sidecar or cloud proxy). */
  activeModelId: string;
  /** Reason code for analytics / UI hints. */
  reason:
    | 'user-forced-local'
    | 'user-forced-cloud'
    | 'local-model-picked'
    | 'auto-classified-local'
    | 'auto-classified-cloud'
    | 'local-runtime-not-ready'
    | 'default-cloud';
}

/**
 * Resolve which tier + model to use for a single turn.
 *
 * Rules (in priority order):
 *  1. `cloud-only` → tier=cloud, no local attempt.
 *  2. `local-only` → tier=local if runtime ready AND a local model is picked/implied; else return cloud with reason `local-runtime-not-ready` (caller should surface error rather than silently fall back — `allowCloudFallback=false`).
 *  3. `auto` → consult autoClassification first; a long / tool-heavy turn can still be promoted to cloud even if the dropdown currently points at a local model.
 */
export function resolveExecutionTier(input: TierResolutionInput): TierResolutionResult {
  const {
    selectedModelId,
    executionMode,
    agentPreferredModel,
    instanceResolvedModel,
    finalFallbackModel,
    isLocalModelId,
    localRuntimeReady,
    autoClassification,
  } = input;

  const userPickedLocal = isLocalModelId(selectedModelId);
  const cloudCandidate = pickCloudModel({
    selectedModelId,
    agentPreferredModel,
    instanceResolvedModel,
    finalFallbackModel,
    isLocalModelId,
  });

  // Cloud-only: never touch local.
  if (executionMode === 'cloud-only') {
    return {
      tier: 'cloud',
      allowCloudFallback: false,
      activeModelId: cloudCandidate,
      reason: 'user-forced-cloud',
    };
  }

  // Local-only: respect user — no silent fallback.
  if (executionMode === 'local-only') {
    if (localRuntimeReady && userPickedLocal) {
      return {
        tier: 'local',
        allowCloudFallback: false,
        activeModelId: selectedModelId as string,
        reason: 'user-forced-local',
      };
    }
    // Runtime not ready — caller will error instead of silent fallback.
    return {
      tier: 'cloud',
      allowCloudFallback: false,
      activeModelId: cloudCandidate,
      reason: 'local-runtime-not-ready',
    };
  }

  // Auto mode: classifier wins. Picking a local model means "prefer local when suitable",
  // not "force local even for long / tool-heavy turns".
  const autoTier = autoClassification ?? (userPickedLocal ? 'local' : 'cloud');
  if (autoTier === 'cloud') {
    return {
      tier: 'cloud',
      allowCloudFallback: false,
      activeModelId: cloudCandidate,
      reason: userPickedLocal ? 'auto-classified-cloud' : 'default-cloud',
    };
  }

  if (userPickedLocal && localRuntimeReady) {
    return {
      tier: 'local',
      allowCloudFallback: true,
      activeModelId: selectedModelId as string,
      reason: autoClassification === 'local' ? 'auto-classified-local' : 'local-model-picked',
    };
  }

  return {
    tier: 'cloud',
    allowCloudFallback: false,
    activeModelId: cloudCandidate,
    reason: 'local-runtime-not-ready',
  };
}

function pickCloudModel(args: {
  selectedModelId?: string | null;
  agentPreferredModel?: string | null;
  instanceResolvedModel?: string | null;
  finalFallbackModel: string;
  isLocalModelId: (id?: string | null) => boolean;
}): string {
  const { selectedModelId, agentPreferredModel, instanceResolvedModel, finalFallbackModel, isLocalModelId } = args;
  if (agentPreferredModel && !isLocalModelId(agentPreferredModel)) return agentPreferredModel;
  if (instanceResolvedModel && !isLocalModelId(instanceResolvedModel)) return instanceResolvedModel;
  if (selectedModelId && !isLocalModelId(selectedModelId)) return selectedModelId;
  return finalFallbackModel;
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Auto-mode turn classifier
 * ────────────────────────────────────────────────────────────────────────────── */

export interface TurnClassificationInput {
  text: string;
  attachmentCount: number;
  hasNonImageAttachment: boolean;
  approxContextTokens: number;
  /** e.g. presence of @cloud / @local / /tool markers. */
  explicitTierHint?: ExecutionTier | null;
}

/** Short messages, no attachments, low context → local. Else cloud. */
export function classifyTurnForAuto(input: TurnClassificationInput): ExecutionTier {
  if (input.explicitTierHint) return input.explicitTierHint;

  // Any non-image attachment (PDF, spreadsheet, audio file) → cloud for proper parsing.
  if (input.hasNonImageAttachment) return 'cloud';

  // Images stay on-device: the local Qwen2.5-Omni / Gemma 4 vision path is the
  // whole point of shipping mmproj. Cloud fallback only happens when the local
  // runtime isn't ready, via resolveExecutionTier() — not as a default route.

  // Very long prompts → cloud context window is larger.
  if (input.approxContextTokens > 6000) return 'cloud';

  const text = input.text.trim();
  if (!text) return 'local';

  // Multi-step / instruction-heavy phrasing → cloud.
  if (/(first|然后|接着|再|step\s*\d|先.*再)/i.test(text)) return 'cloud';

  // URL fetch / web lookup → cloud.
  if (/https?:\/\/\S+/i.test(text)) return 'cloud';

  // Tool-ish requests → cloud.
  if (/\b(search|fetch|browse|execute|run\s+the|deploy|write\s+a\s+file|database|sql)\b/i.test(text)) {
    return 'cloud';
  }

  // Long single-shot prompt → cloud.
  if (text.length > 400) return 'cloud';

  return 'local';
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Explicit tier hint parsing
 * ────────────────────────────────────────────────────────────────────────────── */

/** Detect `@cloud`, `@local`, or `/tool` hints at the start of the message. */
export function parseExplicitTierHint(text: string): ExecutionTier | null {
  const trimmed = text.trimStart();
  if (/^@local\b/i.test(trimmed)) return 'local';
  if (/^@cloud\b/i.test(trimmed)) return 'cloud';
  if (/^\/tool\b/i.test(trimmed)) return 'cloud';
  return null;
}
