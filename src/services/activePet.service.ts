/**
 * activePet.service — single source of truth for "which pet are we
 * companioning right now" on mobile.
 *
 * Phase 1 (P-9 Companion Redesign T4.2):
 *   We piggy-back on the existing `authStore.activeInstance` because every
 *   shipped feature already reads activeInstance — switching it is the
 *   exact "switch the active companion" operation. We add:
 *     - useActivePet() React hook returning { id, name, sprite metadata }
 *     - Wired emitter: when authStore.setActiveInstance() flips, fire a
 *       `companionEvents.emit('active-pet-changed', ...)` so the ball,
 *       PetDetailSheet, ConversationBubble etc. all stay in lock-step.
 *
 * V7 (MTR-R09.8 / M1.4.6, decision d-35 "M0.0.8 = Shell", 2026-09-16):
 *   Under the Agent-first IA the floating ball / Companion layer is the
 *   current canonical Agent's Shell, so its identity is
 *   `SoulCoreRef.agentAccountId` — not the runtime instance id. The mapping
 *   is the pure function in `companionShellBinding.ts`; this module only
 *   feeds it from the stores. The legacy IA keeps the pre-V7 behaviour.
 *
 * Spec: requirements.md R5.1 / R5.3 / R5.5; V7 MTR-R09.8, MTR-R17.6.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useMobileAgentSelectionStore } from '../stores/mobileAgentSelectionStore';
import { companionEvents } from './companionEvents.service';
import { isAgentFirstIaEnabled } from './mobileV6FeatureFlags';
import {
  resolveCompanionShellBinding,
  type CompanionShellBinding,
} from './companionShellBinding';

/**
 * The Shell the Companion layer renders. `id` / `name` / `clan` /
 * `isPlaceholder` are the fields the redesign-era consumers read; the V7
 * fields (`agentAccountId`, `instanceId`, `shellKey`, `source`) say who the
 * Shell represents and who drives it.
 */
export type ActivePet = CompanionShellBinding;

/**
 * React hook returning the current active pet plus auto-emitting
 * `active-pet-changed` on transitions. Safe to call from any component;
 * the emit is deduped so multiple subscribers don't fan out events.
 */
export function useActivePet(): ActivePet {
  const activeInstance = useAuthStore((s) => s.activeInstance);
  const instances = useAuthStore((s) => s.user?.openClawInstances);
  const selectedAgentId = useMobileAgentSelectionStore((s) => s.selectedAgentId);
  // Read per render, never at module scope (MTR-R06.4 import-order trap).
  const agentFirst = isAgentFirstIaEnabled();
  const lastEmittedKeyRef = useRef<string | null>(null);

  const pet = useMemo<ActivePet>(
    () => resolveCompanionShellBinding({ agentFirst, selectedAgentId, instances, activeInstance }),
    [agentFirst, selectedAgentId, instances, activeInstance],
  );

  // Emit 'active-pet-changed' on transition. Run as effect so the emit
  // happens after render, not during. Keyed on `shellKey`: the instance id
  // in the legacy IA, the canonical agentAccountId under Agent-first.
  useEffect(() => {
    if (lastEmittedKeyRef.current === pet.shellKey) return;
    const previousKey = lastEmittedKeyRef.current;
    lastEmittedKeyRef.current = pet.shellKey;
    if (previousKey !== null) {
      // Skip the very first mount (no real "transition" happened).
      companionEvents.emit({
        type: 'active-pet-changed',
        from: previousKey,
        to: pet.shellKey,
      });
    }
  }, [pet.shellKey]);

  return pet;
}

/**
 * Imperative read for non-React call sites (e.g. inside event handlers,
 * native module bridges). Reads directly from the stores.
 */
export function getActivePet(): ActivePet {
  const auth = useAuthStore.getState();
  return resolveCompanionShellBinding({
    agentFirst: isAgentFirstIaEnabled(),
    selectedAgentId: useMobileAgentSelectionStore.getState().selectedAgentId,
    instances: auth.user?.openClawInstances,
    activeInstance: auth.activeInstance,
  });
}

/**
 * Switch the runtime instance behind the Shell. Wraps
 * authStore.setActiveInstance() and explicitly emits `active-pet-changed`
 * (for callers outside React render trees).
 *
 * Under Agent-first this changes who *drives* the Shell; the Shell's
 * identity still follows the canonical Agent (MTR-R17.6), so the hook above
 * only re-emits when that identity actually changes.
 *
 * Spec: R5.3.
 */
export function setActivePet(petId: string): void {
  const prev = useAuthStore.getState().activeInstance?.id ?? null;
  if (prev === petId) return;
  useAuthStore.getState().setActiveInstance(petId);
  // The hook above will fire the event next render, but we also fire
  // here for non-React consumers that may read the event before any
  // hooked component re-renders. companionEvents already dedupes via
  // listener-set semantics so a duplicate fire is harmless.
  companionEvents.emit({
    type: 'active-pet-changed',
    from: prev,
    to: petId,
  });
}
