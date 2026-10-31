/**
 * Owner enablement for imported skill / workflow declarations.
 *
 * Import only writes inert rows. Enabling requires a live binding the owner
 * already has on Agentrix — an installed skill or a connected MCP server.
 * Archive secrets and archived MCP URLs are never used.
 */

export const IMPORTED_EXECUTABLE_ENABLE_SCHEMA_VERSION = 1 as const;
export const IMPORTED_EXECUTABLE_ENABLE_CONFIRMATION = 'enable' as const;

export const IMPORTED_EXECUTABLE_LIVE_BINDING_KINDS = [
  'agentrix_skill',
  'mcp_connection',
] as const;
export type ImportedExecutableLiveBindingKindV1 =
  (typeof IMPORTED_EXECUTABLE_LIVE_BINDING_KINDS)[number];

export const IMPORTED_EXECUTABLE_ENABLE_REASON_CODES = [
  'confirmation_required',
  'live_binding_required',
  'live_binding_rejected',
  'mcp_binding_not_supported',
  'not_imported',
  'already_enabled',
  'owner_required',
] as const;
export type ImportedExecutableEnableReasonCodeV1 =
  (typeof IMPORTED_EXECUTABLE_ENABLE_REASON_CODES)[number];

export interface ImportedExecutableLiveBindingV1 {
  kind: ImportedExecutableLiveBindingKindV1;
  ref: string;
}

export interface ImportedExecutableRowV1 {
  canonicalId: string;
  itemType: 'skill' | 'workflow';
  name: string;
  enabled: boolean;
  quarantined: boolean;
  requiresReauthorization: boolean;
  liveBindingKind: string | null;
  liveBindingRef: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function evaluateImportedExecutableEnableCommandV1(input: {
  confirmation: unknown;
  liveBinding: unknown;
}):
  | { status: 'allowed'; binding: ImportedExecutableLiveBindingV1 }
  | { status: 'refused'; reasonCode: ImportedExecutableEnableReasonCodeV1 } {
  if (input.confirmation !== IMPORTED_EXECUTABLE_ENABLE_CONFIRMATION) {
    return { status: 'refused', reasonCode: 'confirmation_required' };
  }
  if (input.liveBinding == null) {
    return { status: 'refused', reasonCode: 'live_binding_required' };
  }
  if (!isRecord(input.liveBinding)) {
    return { status: 'refused', reasonCode: 'live_binding_rejected' };
  }
  const kind = input.liveBinding.kind;
  const ref = input.liveBinding.ref;
  if (typeof ref !== 'string' || !UUID_RE.test(ref.trim())) {
    return { status: 'refused', reasonCode: 'live_binding_rejected' };
  }
  if (kind === 'agentrix_skill' || kind === 'mcp_connection') {
    return { status: 'allowed', binding: { kind, ref: ref.trim() } };
  }
  return { status: 'refused', reasonCode: 'live_binding_rejected' };
}

/** Runtime / marketplace tools may invoke this row only when it is live. */
export function isImportedExecutableInvocableV1(row: {
  isEnabled?: boolean;
  w1rImported?: boolean;
  quarantined?: boolean;
  requiresReauthorization?: boolean;
  liveBindingRef?: string | null;
}): boolean {
  if (row.isEnabled !== true) return false;
  if (row.w1rImported !== true) return true;
  return (
    row.quarantined === false &&
    row.requiresReauthorization === false &&
    typeof row.liveBindingRef === 'string' &&
    row.liveBindingRef.length > 0
  );
}

export function describeImportedExecutableRowV1(
  row: ImportedExecutableRowV1,
): { activation: 'enabled' | 'disabled'; invocable: boolean } {
  const invocable = isImportedExecutableInvocableV1({
    isEnabled: row.enabled,
    w1rImported: true,
    quarantined: row.quarantined,
    requiresReauthorization: row.requiresReauthorization,
    liveBindingRef: row.liveBindingRef,
  });
  return { activation: invocable ? 'enabled' : 'disabled', invocable };
}
