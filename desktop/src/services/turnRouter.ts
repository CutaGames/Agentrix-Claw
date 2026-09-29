/**
 * Desktop tier-router — mirrors src/utils/turnRouter.ts contract.
 *
 * Desktop uses localStorage-backed persistence; the core logic is identical to
 * the mobile helper but duplicated here to avoid cross-workspace imports that
 * would require the mobile file to sit in a shared path.
 */

export type ExecutionMode = 'local-only' | 'auto' | 'cloud-only';
export type ExecutionTier = 'local' | 'cloud';

export const EXECUTION_MODE_STORAGE_KEY = 'agentrix_desktop_execution_mode';
export const DEFAULT_EXECUTION_MODE: ExecutionMode = 'auto';

export function readExecutionMode(): ExecutionMode {
  try {
    const stored = localStorage.getItem(EXECUTION_MODE_STORAGE_KEY);
    if (stored === 'local-only' || stored === 'auto' || stored === 'cloud-only') return stored;
  } catch { /* ignore */ }
  return DEFAULT_EXECUTION_MODE;
}

export function writeExecutionMode(mode: ExecutionMode): void {
  try {
    localStorage.setItem(EXECUTION_MODE_STORAGE_KEY, mode);
  } catch { /* ignore */ }
}

export interface TierResolutionInput {
  selectedModelId?: string | null;
  executionMode: ExecutionMode;
  agentPreferredModel?: string | null;
  instanceResolvedModel?: string | null;
  finalFallbackModel: string;
  isLocalModelId: (id?: string | null) => boolean;
  localRuntimeReady: boolean;
  autoClassification?: ExecutionTier;
}

export interface TierResolutionResult {
  tier: ExecutionTier;
  allowCloudFallback: boolean;
  activeModelId: string;
  reason:
    | 'user-forced-local'
    | 'user-forced-cloud'
    | 'local-model-picked'
    | 'auto-classified-local'
    | 'auto-classified-cloud'
    | 'local-runtime-not-ready'
    | 'default-cloud';
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

export function resolveExecutionTier(input: TierResolutionInput): TierResolutionResult {
  const { selectedModelId, executionMode, isLocalModelId, localRuntimeReady, autoClassification } = input;
  const userPickedLocal = isLocalModelId(selectedModelId);
  const cloudCandidate = pickCloudModel(input);

  if (executionMode === 'cloud-only') {
    return { tier: 'cloud', allowCloudFallback: false, activeModelId: cloudCandidate, reason: 'user-forced-cloud' };
  }

  if (executionMode === 'local-only') {
    if (localRuntimeReady && userPickedLocal) {
      return { tier: 'local', allowCloudFallback: false, activeModelId: selectedModelId as string, reason: 'user-forced-local' };
    }
    return { tier: 'cloud', allowCloudFallback: false, activeModelId: cloudCandidate, reason: 'local-runtime-not-ready' };
  }

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

  return { tier: 'cloud', allowCloudFallback: false, activeModelId: cloudCandidate, reason: 'local-runtime-not-ready' };
}

export interface TurnClassificationInput {
  text: string;
  attachmentCount: number;
  hasNonImageAttachment: boolean;
  approxContextTokens: number;
  explicitTierHint?: ExecutionTier | null;
}

export function classifyTurnForAuto(input: TurnClassificationInput): ExecutionTier {
  if (input.explicitTierHint) return input.explicitTierHint;
  if (input.hasNonImageAttachment) return 'cloud';
  // Images stay on-device; mmproj is the reason we ship local vision.
  if (input.approxContextTokens > 6000) return 'cloud';
  const text = input.text.trim();
  if (!text) return 'local';
  if (/(first|然后|接着|再|step\s*\d|先.*再)/i.test(text)) return 'cloud';
  if (/https?:\/\/\S+/i.test(text)) return 'cloud';
  if (/\b(search|fetch|browse|execute|run\s+the|deploy|write\s+a\s+file|database|sql)\b/i.test(text)) return 'cloud';
  if (text.length > 400) return 'cloud';
  return 'local';
}

export function parseExplicitTierHint(text: string): ExecutionTier | null {
  const trimmed = text.trimStart();
  if (/^@local\b/i.test(trimmed)) return 'local';
  if (/^@cloud\b/i.test(trimmed)) return 'cloud';
  if (/^\/tool\b/i.test(trimmed)) return 'cloud';
  return null;
}
