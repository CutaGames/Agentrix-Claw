export interface AgentDisplayNameSource {
  id?: unknown;
  name?: unknown;
  metadata?: Record<string, unknown> | null;
}

function nonEmptyText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Resolve a stable, non-empty Agent label across current and legacy instance DTOs.
 * The UI must not trust historical persisted data or backend rows to contain a
 * usable `name`, so known metadata aliases are checked before the caller's
 * contextual fallback.
 */
export function resolveAgentDisplayName(
  instance: AgentDisplayNameSource | null | undefined,
  fallback = 'My Agent',
): string {
  const metadata = instance?.metadata;
  const candidates = [
    instance?.name,
    metadata?.displayName,
    metadata?.agentName,
    metadata?.name,
  ];

  for (const candidate of candidates) {
    const value = nonEmptyText(candidate);
    if (value) return value;
  }

  return nonEmptyText(fallback) ?? 'My Agent';
}
