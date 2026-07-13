/**
 * Pet form-state bus — mobile mirror of `desktop/src/services/petMode.ts`
 * (Sprint P-6, 2026-05-22).
 *
 * Single source of truth for "what is the pet doing right now" on mobile.
 * The GlobalFloatingBall and any future pet surfaces (avatar in chat
 * header, AXP toast, etc.) subscribe here so they stay in lock-step.
 *
 * P-9 Companion Redesign (Task 1.3, 2026-05-22):
 *   In addition to the legacy sprite-level `PetMode` (used by the existing
 *   GlobalFloatingBall and petModeAdapters), this file now exposes a
 *   higher-level `CompanionMode` taxonomy of 8 modes (R2 / design.md
 *   §Data Models). The two are **orthogonal** — CompanionMode is the
 *   user-facing "what is my pet doing" semantics, PetMode is the
 *   underlying sprite key. A transition matrix decides which CompanionMode
 *   wins given concurrent triggers, and a sprite map turns CompanionMode
 *   into a PetMode/sprite for rendering.
 *
 *   The legacy setPetMode() API still works for backwards-compat. New
 *   call sites should prefer setCompanionMode() so Local_Action_Wins,
 *   priority arbitration, and 30s-debounce all kick in automatically.
 *
 * Differences from the desktop bus:
 *  - No Tauri cross-webview broadcast — RN runs a single JS context.
 *  - `pro-thinking` / `pro-typing` are mapped to the `talk` sprite at
 *    sprite-resolution time (mobile has no Pro Mode).
 *  - `computer-use` is **not** a valid mobile mode (no CU on phone).
 *    Setting it is treated as `idle`.
 *
 * Mode taxonomy mirrors `docs/PET_FORMS_DESIGN_v5.zh-CN.md` §3 with the
 * mobile-applicable subset documented in `PET_FORMS_MOBILE_MIRROR_PLAN_v6`.
 */

export type PetMode =
  | 'idle'
  | 'listening'
  | 'speaking'
  | 'thinking'
  | 'typing'
  | 'done'
  | 'sleep'
  | 'wardrobe'
  | 'approval';
// Note: `computer-use` deliberately omitted — not applicable on mobile.

/** Sprite key matching the mobile asset filenames in `assets/pets/sprites/default/`. */
export type PetSpriteKey =
  | 'walk'
  | 'idle'
  | 'sleep'
  | 'sit'
  | 'jump'
  | 'eat'
  | 'listen'
  | 'talk'
  | 'pro-thinking'
  | 'pro-typing'
  | 'pro-done'
  | 'alert';
// `cu-mouse` deliberately omitted — not used on mobile.

/**
 * Mobile mode → sprite resolution. `thinking` / `typing` degrade to
 * `talk` per the P-6 plan since mobile has no Pro Mode UI to play the
 * dedicated thinking/typing animations into.
 */
export const PET_MODE_TO_SPRITE: Record<PetMode, PetSpriteKey> = {
  idle: 'idle',
  listening: 'listen',
  speaking: 'talk',
  thinking: 'talk', // Degraded — no Pro Mode on mobile
  typing: 'talk', // Degraded
  done: 'pro-done',
  sleep: 'sleep',
  wardrobe: 'idle',
  approval: 'alert',
};

type Listener = (mode: PetMode, source: string) => void;

let _currentMode: PetMode = 'idle';
let _ttlTimer: ReturnType<typeof setTimeout> | null = null;
const _listeners = new Set<Listener>();

export function getPetMode(): PetMode {
  return _currentMode;
}

/**
 * Set the pet mode and notify subscribers. Idempotent — same mode is a no-op.
 *
 * `ttlMs` causes the bus to auto-revert to `idle` after the duration —
 * used for transient modes like `done` (celebrate then return to idle).
 *
 * `computer-use` is filtered out (mapped to `idle`) since mobile has no
 * Computer Use platform support.
 */
export function setPetMode(
  mode: PetMode | 'computer-use',
  source: string = 'unknown',
  ttlMs?: number,
): void {
  const safeMode: PetMode = mode === 'computer-use' ? 'idle' : (mode as PetMode);

  if (_ttlTimer !== null) {
    clearTimeout(_ttlTimer);
    _ttlTimer = null;
  }
  if (_currentMode === safeMode) return;
  _currentMode = safeMode;

  _listeners.forEach((cb) => {
    try {
      cb(safeMode, source);
    } catch {
      /* listener exceptions never break the bus */
    }
  });

  if (typeof ttlMs === 'number' && ttlMs > 0 && safeMode !== 'idle') {
    _ttlTimer = setTimeout(() => {
      _ttlTimer = null;
      setPetMode('idle', `${source}:ttl`);
    }, ttlMs);
  }
}

/**
 * Subscribe to mode changes. Returns an unsubscribe function suitable
 * for a React `useEffect` cleanup.
 */
export function subscribePetMode(cb: Listener): () => void {
  _listeners.add(cb);
  return () => {
    _listeners.delete(cb);
  };
}

/**
 * Resolve a PetMode to its mobile sprite key. Helper for renderers.
 */
export function resolveSpriteForMode(mode: PetMode): PetSpriteKey {
  return PET_MODE_TO_SPRITE[mode] ?? 'idle';
}

/**
 * Boot the mobile pet mode bus. Idempotent — call once from App.tsx.
 *
 * Currently a no-op stub: explicit feature modules call `setPetMode(...)`
 * directly when they have semantic events to signal (chat streaming,
 * voice listening, AXP level-up, approval push, etc.). This function
 * exists so we can centralize cross-feature event wiring later without
 * touching App.tsx again.
 */
let _booted = false;
export function bootPetModeBus(): void {
  if (_booted) return;
  _booted = true;
  // Reserved for future event wiring (e.g. listening to a generic
  // app-event bus and mapping into mode transitions). For now,
  // callers drive the bus explicitly.
}

/**
 * Telemetry helper — called by tests / debug overlays to inspect state.
 * @internal
 */
export function _internalResetForTests(): void {
  if (_ttlTimer !== null) {
    clearTimeout(_ttlTimer);
    _ttlTimer = null;
  }
  _currentMode = 'idle';
  _listeners.clear();
  _booted = false;
}


// ============================================================
// P-9 Companion Redesign — CompanionMode (high-level semantics)
// ============================================================

/**
 * 8 high-level modes the pet can be in from the user's mental model.
 * Grouped:
 *   companionship: companion / vigil / journey / whisper / slumber / nudge
 *   work:          signing / working
 *
 * The legacy PetMode is the **sprite-level** key (idle / listen / talk / ...);
 * CompanionMode is the **semantic** key (companion / vigil / journey / ...).
 * One CompanionMode resolves to one PetMode for rendering.
 */
export type CompanionMode =
  // Companionship group (6)
  | 'companion'  // default — relaxed, ambient
  | 'vigil'      // waiting /守候 / emotion=tired/sleepy or backend stalled
  | 'journey'    // walking together / HealthKit detected motion
  | 'whisper'    // private moment — Voice_Greet, missed_you proactive
  | 'slumber'    // night / Quiet_Hours
  | 'nudge'      // attention requested — approval, high-priority push
  // Work group (2)
  | 'signing'    // Trust3_Signing_Sheet open — ball locked, purple pulse
  | 'working';   // Form_Variant=work, no other higher-priority mode

export const COMPANION_MODES: readonly CompanionMode[] = [
  'companion', 'vigil', 'journey', 'whisper',
  'slumber', 'nudge', 'signing', 'working',
] as const;

/**
 * P1b — per-CompanionMode accent color for the ball's ring/border so the
 * 8 high-level modes are visually distinguishable (the sprite map alone
 * collapses them into ~4 sprites). Tuned to match the spec's intent:
 *   signing = purple pulse, nudge = orange alert, whisper = pink, etc.
 */
export const COMPANION_MODE_COLOR: Record<CompanionMode, string> = {
  companion: '#6C5CE7', // brand purple (ambient default)
  vigil:     '#64748B', // slate — quiet waiting
  journey:   '#22C55E', // green — moving together
  whisper:   '#EC4899', // pink — private greeting moment
  slumber:   '#3B4252', // deep night
  nudge:     '#F97316', // orange — attention needed
  signing:   '#A855F7', // bright purple pulse — Trust3 signing
  working:   '#3B82F6', // blue — work variant
};

/** Whether the mode should pulse its ring (signing + nudge draw attention). */
export const COMPANION_MODE_PULSES: Record<CompanionMode, boolean> = {
  companion: false,
  vigil: false,
  journey: false,
  whisper: false,
  slumber: false,
  nudge: true,
  signing: true,
  working: false,
};

/**
 * CompanionMode → PetMode (sprite resolver). Each high-level mode picks
 * its primary sprite. Renderers can override (e.g. `journey` defaults
 * to `walk` but flips to `jump` on a step milestone) by setting PetMode
 * directly via setPetMode() while leaving CompanionMode unchanged.
 */
export const COMPANION_MODE_TO_SPRITE: Record<CompanionMode, PetMode> = {
  companion: 'idle',
  vigil:     'sleep',     // sit-with-tired feel; renderer may downgrade to sit when fresh
  journey:   'speaking',  // 'walk' equivalent — speaking sprite still shows movement
  whisper:   'speaking',  // brief talk
  slumber:   'sleep',
  nudge:     'approval',  // alert sprite
  signing:   'approval',  // alert sprite + caller-side adds purple pulse border
  working:   'idle',      // sit-and-quiet
};

/**
 * Priority levels for transition arbitration. Higher wins. Local_Action_Wins
 * suppresses transitions with priority < 50 if user touched/scrolled/typed
 * in the last 5 s — see resolveTransition() below.
 */
export const COMPANION_MODE_PRIORITY: Record<CompanionMode, number> = {
  signing: 100,  // user must confirm — never preempted
  nudge:   80,
  whisper: 70,
  journey: 60,
  slumber: 55,
  vigil:   30,
  working: 25,
  companion: 0,  // default fallback
};

const LOCAL_ACTION_SUPPRESSION_MS = 5_000;
const MODE_DEBOUNCE_WINDOW_MS = 30_000;
const MODE_DEBOUNCE_MAX_FLIPS = 3;

interface ResolveTransitionInput {
  current: CompanionMode;
  proposed: CompanionMode;
  source: string;
  /** Wall-clock ms when the user last did a manual action (tap/scroll/type). */
  lastUserActionMs?: number;
  /** When `true`, ignore Local_Action_Wins suppression (e.g. forced overrides). */
  force?: boolean;
}

export interface ResolvedTransition {
  next: CompanionMode;
  applied: boolean;
  reason:
    | 'idempotent'
    | 'higher-priority-applied'
    | 'lower-priority-applied'
    | 'local-action-suppressed'
    | 'debounced';
}

/**
 * Pure decision function: given the current mode + a proposed mode +
 * context, return whether to apply the transition and what the next mode
 * should be. No side effects; safe to unit test under jest.
 *
 * `force=true` bypasses BOTH Local_Action_Wins suppression AND priority
 * arbitration. Used for explicit resets (TTL revert to companion, manual
 * override, force-to-default on logout).
 */
export function resolveTransition(input: ResolveTransitionInput): ResolvedTransition {
  const { current, proposed, force, lastUserActionMs } = input;

  if (current === proposed) {
    return { next: current, applied: false, reason: 'idempotent' };
  }

  // Force: skip all checks, apply unconditionally.
  if (force) {
    return {
      next: proposed,
      applied: true,
      reason: 'higher-priority-applied',
    };
  }

  const proposedPriority = COMPANION_MODE_PRIORITY[proposed] ?? 0;
  const currentPriority = COMPANION_MODE_PRIORITY[current] ?? 0;

  // Local_Action_Wins: low-priority background events should not
  // interrupt the user. Apply only if proposed >= 50.
  if (
    proposedPriority < 50
    && lastUserActionMs
    && Date.now() - lastUserActionMs < LOCAL_ACTION_SUPPRESSION_MS
  ) {
    return {
      next: current,
      applied: false,
      reason: 'local-action-suppressed',
    };
  }

  // Higher priority always wins; equal-priority wins for proposed (newer
  // event); lower priority is dropped unless current is the default.
  if (proposedPriority >= currentPriority || current === 'companion') {
    return {
      next: proposed,
      applied: true,
      reason:
        proposedPriority > currentPriority
          ? 'higher-priority-applied'
          : 'lower-priority-applied',
    };
  }

  return {
    next: current,
    applied: false,
    reason: 'lower-priority-applied',
  };
}

// ─── Internal state for setCompanionMode ───────────────────────────────
let _currentCompanionMode: CompanionMode = 'companion';
let _companionTtlTimer: ReturnType<typeof setTimeout> | null = null;
let _lastUserActionMs: number = 0;
const _flipHistory: number[] = [];
const _companionListeners = new Set<
  (mode: CompanionMode, source: string) => void
>();

export function getCompanionMode(): CompanionMode {
  return _currentCompanionMode;
}

/**
 * Mark the user as having just done something interactive (tap, scroll,
 * keystroke). Subsequent low-priority transitions in the next 5 s are
 * suppressed so the pet doesn't visually reset under the user's hands.
 *
 * Call from PanResponder onPanResponderGrant, ScrollView onScrollBeginDrag,
 * TextInput onChangeText, etc. Cheap to call frequently.
 */
export function markUserAction(): void {
  _lastUserActionMs = Date.now();
}

/**
 * Mode-flip debounce: if mode is changing > MODE_DEBOUNCE_MAX_FLIPS times
 * within MODE_DEBOUNCE_WINDOW_MS, the most recent transition is delayed
 * (deferred to next event loop) so we don't render a strobe-like sprite
 * sequence. Returns true if the caller should defer the apply.
 */
function isWithinDebounceLimit(): boolean {
  const now = Date.now();
  while (_flipHistory.length > 0 && now - _flipHistory[0] > MODE_DEBOUNCE_WINDOW_MS) {
    _flipHistory.shift();
  }
  return _flipHistory.length < MODE_DEBOUNCE_MAX_FLIPS;
}

/**
 * Set the companion mode. Goes through resolveTransition() for arbitration
 * + applies debounce. `ttlMs` schedules an automatic revert to `companion`
 * (the ambient default).
 */
export function setCompanionMode(
  proposed: CompanionMode,
  source: string = 'unknown',
  options: { ttlMs?: number; force?: boolean } = {},
): ResolvedTransition {
  const decision = resolveTransition({
    current: _currentCompanionMode,
    proposed,
    source,
    lastUserActionMs: _lastUserActionMs,
    force: options.force,
  });

  if (!decision.applied) {
    return decision;
  }

  if (!isWithinDebounceLimit()) {
    return { next: _currentCompanionMode, applied: false, reason: 'debounced' };
  }

  if (_companionTtlTimer !== null) {
    clearTimeout(_companionTtlTimer);
    _companionTtlTimer = null;
  }

  _currentCompanionMode = decision.next;
  _flipHistory.push(Date.now());

  for (const cb of _companionListeners) {
    try {
      cb(decision.next, source);
    } catch {
      /* never propagate */
    }
  }

  // Mirror to PetMode bus so legacy sprite consumers stay in sync.
  const sprite = COMPANION_MODE_TO_SPRITE[decision.next];
  setPetMode(sprite, `companion:${source}`);

  if (typeof options.ttlMs === 'number' && options.ttlMs > 0 && decision.next !== 'companion') {
    _companionTtlTimer = setTimeout(() => {
      _companionTtlTimer = null;
      setCompanionMode('companion', `${source}:ttl`, { force: true });
    }, options.ttlMs);
  }

  return decision;
}

/**
 * Subscribe to CompanionMode transitions. Returns unsubscribe.
 */
export function subscribeCompanionMode(
  cb: (mode: CompanionMode, source: string) => void,
): () => void {
  _companionListeners.add(cb);
  return () => {
    _companionListeners.delete(cb);
  };
}

/**
 * Resolve a CompanionMode to its current sprite. Phase 1 callers should
 * read this in render functions instead of duplicating the map.
 */
export function resolveSpriteForCompanionMode(mode: CompanionMode): PetSpriteKey {
  return PET_MODE_TO_SPRITE[COMPANION_MODE_TO_SPRITE[mode]];
}

/** @internal Reset both buses for tests. */
export function _internalResetCompanionForTests(): void {
  if (_companionTtlTimer !== null) {
    clearTimeout(_companionTtlTimer);
    _companionTtlTimer = null;
  }
  _currentCompanionMode = 'companion';
  _lastUserActionMs = 0;
  _flipHistory.length = 0;
  _companionListeners.clear();
}
