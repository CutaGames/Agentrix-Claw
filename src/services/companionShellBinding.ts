/**
 * Companion Shell binding — MTR-R09.8 / M1.4.6, decision d-35 (2026-09-16,
 * M0.0.8 = "Shell").
 *
 * Under the Agent-first IA the floating ball / global Companion layer is the
 * current canonical Agent's Shell (cross-platform matrix #32: Mobile is the
 * "S · relationship Shell"). Its identity is therefore
 * `SoulCoreRef.agentAccountId` — the same key `useMobileAgentDirectory`
 * selects on — and NOT `authStore.activeInstance.id` (MTR-R17.6: the runtime
 * instance is who *drives* the Shell, never its identity).
 *
 * Under the legacy IA nothing changes: the Shell keeps following the active
 * OpenClaw instance, exactly as `activePet.service` always did.
 *
 * Pure function, no store access, so the mapping is inside the root jest
 * range (M0.0.5 option b). `activePet.service.ts` feeds it from the stores.
 */
import type { OpenClawInstance } from '../stores/authStore';
import { clanShortCode, type PetClanShortCode } from '../../shared/types/pet';
import { resolveAgentDisplayName } from '../utils/agentDisplayName';

export type CompanionShellBindingSource =
  /** Agent-first: bound to the canonical Agent (`SoulCoreRef.agentAccountId`). */
  | 'soul_core_ref'
  /** Legacy IA: bound to `authStore.activeInstance` (pre-V7 behaviour). */
  | 'active_instance'
  /** Nothing to bind to yet (signed in, no Agent / instance resolved). */
  | 'placeholder';

export interface CompanionShellBinding {
  /**
   * Runtime target for instance-scoped calls (skill install, voice channel).
   * Agent-first: the instance mapped to the canonical Agent when one exists,
   * otherwise the agentAccountId itself (stable, but no runtime behind it).
   */
  readonly id: string;
  /** The canonical Agent this Shell represents; `null` outside Agent-first or when unresolved. */
  readonly agentAccountId: string | null;
  /** The OpenClaw instance driving the Shell, if any. */
  readonly instanceId: string | null;
  /** Key the Companion layer keys transitions (`active-pet-changed`) on. */
  readonly shellKey: string;
  readonly name: string;
  readonly clan?: PetClanShortCode;
  readonly isPlaceholder: boolean;
  readonly source: CompanionShellBindingSource;
}

export interface CompanionShellBindingInput {
  /** `isAgentFirstIaEnabled()` at the call site — read per call, never at module scope. */
  readonly agentFirst: boolean;
  /** `useMobileAgentSelectionStore.selectedAgentId` (presentation selection, an agentAccountId). */
  readonly selectedAgentId?: string | null;
  /** `authStore.user.openClawInstances`. */
  readonly instances?: readonly OpenClawInstance[] | null;
  /** `authStore.activeInstance`. */
  readonly activeInstance?: OpenClawInstance | null;
}

export const COMPANION_SHELL_PLACEHOLDER_ID = '__placeholder__';
const DEFAULT_SHELL_NAME = 'Aira';

export function agentAccountIdOf(instance?: OpenClawInstance | null): string | undefined {
  return instance?.agentAccountId ?? instance?.metadata?.agentAccountId ?? undefined;
}

function clanOf(instance?: OpenClawInstance | null): PetClanShortCode | undefined {
  if (!instance) return undefined;
  return clanShortCode((instance as any).clan ?? (instance as any).soul_template_id);
}

const PLACEHOLDER: CompanionShellBinding = Object.freeze({
  id: COMPANION_SHELL_PLACEHOLDER_ID,
  agentAccountId: null,
  instanceId: null,
  shellKey: COMPANION_SHELL_PLACEHOLDER_ID,
  name: DEFAULT_SHELL_NAME,
  clan: 'A' as PetClanShortCode,
  isPlaceholder: true,
  source: 'placeholder',
});

export function resolveCompanionShellBinding(input: CompanionShellBindingInput): CompanionShellBinding {
  const activeInstance = input.activeInstance ?? null;

  if (!input.agentFirst) {
    if (!activeInstance) return PLACEHOLDER;
    return {
      id: activeInstance.id,
      agentAccountId: agentAccountIdOf(activeInstance) ?? null,
      instanceId: activeInstance.id,
      shellKey: activeInstance.id,
      name: activeInstance.name || DEFAULT_SHELL_NAME,
      clan: clanOf(activeInstance),
      isPlaceholder: false,
      source: 'active_instance',
    };
  }

  // Agent-first: the canonical Agent is the presentation selection, else the
  // Agent the active runtime instance maps to. Same precedence as
  // `buildMobileAgentDirectoryModel` (`selectedAgentId ?? activeAgentId`).
  const agentAccountId = input.selectedAgentId || agentAccountIdOf(activeInstance);
  if (!agentAccountId) return PLACEHOLDER;

  const instances = input.instances ?? [];
  const instance = instances.find((candidate) => agentAccountIdOf(candidate) === agentAccountId)
    ?? (agentAccountIdOf(activeInstance) === agentAccountId ? activeInstance : null);

  return {
    id: instance?.id ?? agentAccountId,
    agentAccountId,
    instanceId: instance?.id ?? null,
    shellKey: agentAccountId,
    name: resolveAgentDisplayName(instance, `Agent ${agentAccountId.slice(0, 8)}`),
    clan: clanOf(instance),
    isPlaceholder: false,
    source: 'soul_core_ref',
  };
}
