/**
 * Pet form-state bus — mobile mirror of `desktop/src/services/petMode.ts`
 * (Sprint P-6, 2026-05-22).
 *
 * Single source of truth for "what is the pet doing right now" on mobile.
 * The GlobalFloatingBall and any future pet surfaces (avatar in chat
 * header, AXP toast, etc.) subscribe here so they stay in lock-step.
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
