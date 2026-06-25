/**
 * Model IDs that exist ONLY as on-device (mobile/desktop) runtimes and cannot be
 * routed to any cloud provider. Shared across backend modules (openclaw-proxy,
 * auth, realtime-voice) so we don't drift when new local-only models ship.
 *
 * When a user-supplied model or instance active model matches one of these IDs,
 * the backend MUST either:
 *   1. Silently sanitize it to a cloud fallback (legacy behavior, flagged via
 *      `local_only_fallback_to_cloud` routingReason), OR
 *   2. Emit a `meta.localOnlyFallback` SSE event so the client can decide to
 *      cancel and run locally (preferred for mobile/desktop native chat).
 */
export const LOCAL_ONLY_MODEL_IDS: ReadonlySet<string> = new Set([
  'gemma-nano-2b',
  'gemma-4-2b',
  'gemma-4-4b',
  'qwen3.5-omni-light',
  'qwen2.5-omni-3b',
  'gemma-nano-2b-local',
]);

export function isLocalOnlyModel(modelId?: string | null): boolean {
  return !!modelId && LOCAL_ONLY_MODEL_IDS.has(modelId);
}

export function sanitizeLocalOnlyModel<T extends string | null | undefined>(
  modelId: T,
): T extends string ? string | undefined : undefined {
  if (!modelId) return undefined as any;
  return (LOCAL_ONLY_MODEL_IDS.has(modelId as string) ? undefined : modelId) as any;
}

/**
 * When a local-only model cannot execute server-side, pick a cloud "twin" that
 * best matches the local model's capability profile. This keeps the cross-device
 * (端云一致) experience: a user running `qwen2.5-omni-3b` on a phone with no
 * local runtime still gets Qwen's multimodal behavior on the server instead of
 * a Claude/GPT default which would break tone/language alignment.
 *
 * Returns `null` if no mapping exists — caller should fall back to the agent
 * account's default model.
 */
const LOCAL_TO_CLOUD_TWIN: Record<string, string> = {
  'qwen2.5-omni-3b': 'qwen-vl-max-latest',
  'qwen3.5-omni-light': 'qwen-vl-max-latest',
  // Gemma family has no Alibaba/Anthropic-free vision twin on par; leave
  // unmapped so the agent account's preferred cloud model is used.
};

export function getCloudTwinForLocalModel(modelId?: string | null): string | null {
  if (!modelId) return null;
  return LOCAL_TO_CLOUD_TWIN[modelId] ?? null;
}
