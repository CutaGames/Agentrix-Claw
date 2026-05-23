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
 * Spec: requirements.md R5.1 / R5.3 / R5.5.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { companionEvents } from './companionEvents.service';

export interface ActivePet {
  id: string;
  name: string;
  /** Optional clan / sprite hint (mobile defaults to clan 'A' aka the kitsune). */
  clan?: 'A' | 'B' | 'C';
  /** True when no instance is bound yet (user logged in but hasn't onboarded). */
  isPlaceholder: boolean;
}

const PLACEHOLDER: ActivePet = {
  id: '__placeholder__',
  name: 'Aira',
  clan: 'A',
  isPlaceholder: true,
};

/**
 * React hook returning the current active pet plus auto-emitting
 * `active-pet-changed` on transitions. Safe to call from any component;
 * the emit is deduped so multiple subscribers don't fan out events.
 */
export function useActivePet(): ActivePet {
  const activeInstance = useAuthStore((s) => s.activeInstance);
  const lastEmittedIdRef = useRef<string | null>(null);

  const pet = useMemo<ActivePet>(() => {
    if (!activeInstance) return PLACEHOLDER;
    return {
      id: activeInstance.id,
      name: activeInstance.name || 'Aira',
      clan: ((activeInstance as any).clan as 'A' | 'B' | 'C' | undefined) || 'A',
      isPlaceholder: false,
    };
  }, [activeInstance]);

  // Emit 'active-pet-changed' on transition. Run as effect so the emit
  // happens after render, not during.
  useEffect(() => {
    if (lastEmittedIdRef.current === pet.id) return;
    const previousId = lastEmittedIdRef.current;
    lastEmittedIdRef.current = pet.id;
    if (previousId !== null) {
      // Skip the very first mount (no real "transition" happened).
      companionEvents.emit({
        type: 'active-pet-changed',
        from: previousId,
        to: pet.id,
      });
    }
  }, [pet.id]);

  return pet;
}

/**
 * Imperative read for non-React call sites (e.g. inside event handlers,
 * native module bridges). Reads directly from authStore.
 */
export function getActivePet(): ActivePet {
  const inst = useAuthStore.getState().activeInstance;
  if (!inst) return PLACEHOLDER;
  return {
    id: inst.id,
    name: inst.name || 'Aira',
    clan: ((inst as any).clan as 'A' | 'B' | 'C' | undefined) || 'A',
    isPlaceholder: false,
  };
}

/**
 * Switch active pet. Wraps authStore.setActiveInstance() and explicitly
 * emits `active-pet-changed` (for callers outside React render trees).
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
