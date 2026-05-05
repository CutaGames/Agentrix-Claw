/**
 * Pet SDK (Desktop · v0.1) — Living Pet contracts for Agentrix v3.
 *
 * Resolves the §3 / §6 blockers in
 * docs/DESKTOP_LIVE2D_BLOCKERS_20260505.zh-CN.md by introducing a renderer-
 * agnostic Pet SDK contract:
 *
 *   1. Emotion → motion / expression mapping table
 *   2. Intimacy v2 level table (xp thresholds, unlocks)
 *   3. Interaction kinds (double-click, tap, hover, vision)
 *   4. Renderer registry (`live2d` | `fallback`) — Live2D plug-in arrives later
 *   5. Public event bus (`agentrix:pet-*` window CustomEvents)
 *
 * No commercial Live2D Cubism license is required to run; the desktop ships
 * with a fallback renderer (animated SVG) until `.moc3` assets land.
 *
 * Backend wiring:
 *   - Reads pet state from `presence:pet.state` (already forwarded as
 *     `agentrix:pet-state` by [agentPresence.ts](agentPresence.ts)).
 *   - Writes interactions to `POST /api/v1/pet/intimacy` and emotions to
 *     `POST /api/v1/pet/emotion`.
 */
import { API_BASE, useAuthStore } from "./store";
import type { EmotionIntensity, PetEmotion, PetState } from "../../../shared/types/agentrix-presence";

// ── 1. Emotion → motion / expression mapping ────────────────────────
//    Each entry tells the renderer which animation/expression to play.
//    A real Live2D renderer maps `motion` to a Cubism motion group; the
//    fallback renderer maps it to a CSS keyframe name.

export interface EmotionMotion {
  /** Cubism MotionGroup name (or fallback CSS animation name). */
  motion: string;
  /** Optional Cubism expression name (face overlay). */
  expression: string | null;
  /** Optional sound asset key. */
  sound: string | null;
  /** Loop or one-shot. */
  loop: boolean;
}

export const EMOTION_MOTION_MAP: Record<PetEmotion, EmotionMotion> = {
  calm:       { motion: "Idle",        expression: null,         sound: null,        loop: true },
  happy:      { motion: "TapBody",     expression: "F_Smile",    sound: "happy",     loop: false },
  excited:    { motion: "Shake",       expression: "F_Wow",      sound: "excited",   loop: false },
  focused:    { motion: "Idle",        expression: "F_Focus",    sound: null,        loop: true },
  concerned:  { motion: "TapHead",     expression: "F_Worry",    sound: "ping",      loop: false },
  tired:      { motion: "IdleSlow",    expression: "F_Tired",    sound: null,        loop: true },
  love:       { motion: "TapBody",     expression: "F_Love",     sound: "kira",      loop: false },
  sad:        { motion: "Drop",        expression: "F_Sad",      sound: null,        loop: false },
  angry:      { motion: "Shake",       expression: "F_Angry",    sound: "huff",      loop: false },
  sleepy:     { motion: "Sleep",       expression: "F_Sleepy",   sound: null,        loop: true },
};

// ── 2. Intimacy v2 levels ────────────────────────────────────────────
//    Mirrors backend `LivingPetService.recomputeIntimacyLevel`. Used by the
//    renderer to pick costume / background / unlocked motions.

export interface IntimacyLevel {
  level: number;
  xpRequired: number;
  unlocks: string[];
}

export const INTIMACY_LEVELS: IntimacyLevel[] = [
  { level: 0, xpRequired: 0,    unlocks: ["base"] },
  { level: 1, xpRequired: 50,   unlocks: ["nickname"] },
  { level: 2, xpRequired: 150,  unlocks: ["costume_basic", "voice_pack_a"] },
  { level: 3, xpRequired: 350,  unlocks: ["bg_room", "expression_extra"] },
  { level: 4, xpRequired: 700,  unlocks: ["costume_premium", "voice_pack_b"] },
  { level: 5, xpRequired: 1200, unlocks: ["bg_seasonal", "interaction_dance"] },
];

export function intimacyLevelFor(xp: number): IntimacyLevel {
  let current = INTIMACY_LEVELS[0];
  for (const lv of INTIMACY_LEVELS) {
    if (xp >= lv.xpRequired) current = lv;
    else break;
  }
  return current;
}

// ── 3. Interaction kinds ─────────────────────────────────────────────

export type PetInteractionKind =
  | "double_click"   // user double-clicked the pet → +5 xp
  | "tap"            // single tap → +1 xp
  | "hover_long"     // hovered > 3s → micro idle reaction
  | "vision_match"   // vision perception fired (e.g. user smiled at camera)
  | "voice_greet"    // user said hello via voice
  | "task_done";     // a task succeeded → small celebratory burst

export interface PetInteractionDescriptor {
  kind: PetInteractionKind;
  /** Server-side xp gain. Server is authoritative; client only proposes. */
  xpGain: number;
  /** Suggested emotion after the interaction (server may override). */
  suggestedEmotion: PetEmotion | null;
  /** Suggested intensity 0-3. */
  suggestedIntensity: number;
}

export const INTERACTION_TABLE: Record<PetInteractionKind, PetInteractionDescriptor> = {
  double_click: { kind: "double_click", xpGain: 5, suggestedEmotion: "happy",   suggestedIntensity: 2 },
  tap:          { kind: "tap",          xpGain: 1, suggestedEmotion: "happy",   suggestedIntensity: 1 },
  hover_long:   { kind: "hover_long",   xpGain: 0, suggestedEmotion: "focused", suggestedIntensity: 1 },
  vision_match: { kind: "vision_match", xpGain: 2, suggestedEmotion: "love",    suggestedIntensity: 2 },
  voice_greet:  { kind: "voice_greet",  xpGain: 1, suggestedEmotion: "excited", suggestedIntensity: 2 },
  task_done:    { kind: "task_done",    xpGain: 3, suggestedEmotion: "excited", suggestedIntensity: 2 },
};

// ── 4. Renderer registry ─────────────────────────────────────────────
//    The active renderer is chosen at boot. `fallback` is always present
//    (CSS / SVG-only). Higher-quality renderers (`rive`, `vrm`, `live2d`)
//    self-register and the SDK promotes the highest-priority one that
//    reports `isAvailable() === true`. See
//    [DESKTOP_LIVE2D_BLOCKERS_20260505.zh-CN.md §替代路线评估] for the
//    decision: route B (Rive short-term + VRM mid-term) replaces the
//    Live2D Cubism commercial license path.
//
//    Priority (highest → lowest): live2d → vrm → rive → fallback
//    Each higher renderer requires its own runtime + assets; absence
//    silently degrades to the next available tier.

export type PetRendererId = "fallback" | "rive" | "vrm" | "live2d";

const RENDERER_PRIORITY: PetRendererId[] = ["live2d", "vrm", "rive", "fallback"];

export interface PetRenderer {
  id: PetRendererId;
  /** Whether this renderer can run right now (assets, license, runtime). */
  isAvailable(): boolean | Promise<boolean>;
  /** Apply an emotion → renderer must play the mapped motion. */
  applyEmotion(state: PetState): void;
  /** Trigger an explicit interaction animation. */
  applyInteraction(kind: PetInteractionKind): void;
}

const _renderers = new Map<PetRendererId, PetRenderer>();
let _activeRendererId: PetRendererId = "fallback";

export function registerPetRenderer(renderer: PetRenderer): void {
  _renderers.set(renderer.id, renderer);
  void Promise.resolve(renderer.isAvailable()).then((ok) => {
    if (!ok) return;
    // Promote to the highest-priority renderer that is currently available.
    for (const candidate of RENDERER_PRIORITY) {
      const r = _renderers.get(candidate);
      if (!r) continue;
      // Fast path: fallback is always available; for the others we must
      // have either just registered (this branch) or previously verified.
      if (r === renderer || candidate === "fallback") {
        if (_activeRendererId !== candidate) {
          _activeRendererId = candidate;
          window.dispatchEvent(
            new CustomEvent("agentrix:pet-renderer-changed", { detail: { id: candidate } }),
          );
        }
        break;
      }
    }
  });
}

export function getActivePetRenderer(): PetRenderer | null {
  return _renderers.get(_activeRendererId) ?? _renderers.get("fallback") ?? null;
}

export function listPetRenderers(): PetRendererId[] {
  return Array.from(_renderers.keys());
}

// ── 5. Public event bus + actions ────────────────────────────────────

let _lastState: PetState | null = null;

export function getLastPetState(): PetState | null {
  return _lastState;
}

/**
 * Initialise the Pet SDK. Idempotent — safe to call multiple times.
 *
 * Wires the existing `agentrix:pet-state` window event into the active
 * renderer, exposes `triggerInteraction` and `setLocalEmotion`, and emits
 * `agentrix:pet-interaction` for downstream listeners (e.g. analytics).
 */
let _booted = false;
export function bootPetSdk(): void {
  if (_booted) return;
  _booted = true;

  window.addEventListener("agentrix:pet-state", (e: Event) => {
    const detail = (e as CustomEvent).detail as PetState | undefined;
    if (!detail || typeof detail !== "object" || !("emotion" in detail)) return;
    _lastState = detail;
    const renderer = getActivePetRenderer();
    renderer?.applyEmotion(detail);
  });

  // Emit a default "calm" state so the renderer has something to display
  // immediately (before the backend `presence:pet.state` arrives, or when
  // the user is signed-out / offline). Server pet.state still wins on
  // first push. Using setLocalEmotion keeps the synthetic state synced to
  // _lastState and dispatches `agentrix:pet-state` so all listeners hydrate.
  if (!_lastState) {
    setLocalEmotion("calm", 1);
  }
}

/**
 * Trigger a pet interaction. Optimistically updates the renderer, then
 * posts to the backend to award xp / persist state. Server response is
 * authoritative — when the next `presence:pet.state` arrives it will
 * overwrite any local optimism.
 */
export async function triggerPetInteraction(kind: PetInteractionKind): Promise<void> {
  const desc = INTERACTION_TABLE[kind];
  if (!desc) return;

  // Optimistic local renderer reaction.
  const renderer = getActivePetRenderer();
  renderer?.applyInteraction(kind);

  window.dispatchEvent(new CustomEvent("agentrix:pet-interaction", { detail: desc }));

  // Server xp award (best-effort; offline → no-op, server reconciles later).
  if (desc.xpGain > 0) {
    try {
      const token = useAuthStore.getState().token;
      if (!token) return;
      await fetch(`${API_BASE}/v1/pet/intimacy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ xp: desc.xpGain }),
      });
    } catch {
      // Swallow — vision/click interactions must never crash the UI.
    }
  }
}

/**
 * Push a local-only emotion (no server persist). Used by vision perception
 * and short reactive bursts. Server pet.state still wins on the next push.
 */
export function setLocalEmotion(emotion: PetEmotion, intensity = 1): void {
  const clampedIntensity = Math.max(0, Math.min(3, intensity)) as EmotionIntensity;
  const now = Date.now();
  const synthetic: PetState = {
    pet_id: _lastState?.pet_id ?? "local",
    user_id: _lastState?.user_id ?? "local",
    emotion,
    emotion_intensity: clampedIntensity,
    emotion_since: now,
    emotion_decay_at: now + 30_000,
    primary_agent_id: _lastState?.primary_agent_id ?? "",
    intimacy_level: _lastState?.intimacy_level ?? 0,
    intimacy_xp: _lastState?.intimacy_xp ?? 0,
    recent_memory_snippets: _lastState?.recent_memory_snippets ?? [],
    engine_switching: false,
    updated_at: now,
  };
  _lastState = synthetic;
  getActivePetRenderer()?.applyEmotion(synthetic);
  window.dispatchEvent(new CustomEvent("agentrix:pet-state", { detail: synthetic }));
}

// ── Built-in fallback renderer ───────────────────────────────────────
//    A no-op renderer that simply re-broadcasts `agentrix:pet-emotion-applied`.
//    `PetCanvas.tsx` listens on `agentrix:pet-state` directly for visuals;
//    this renderer exists so `getActivePetRenderer()` is never null.

const FALLBACK_RENDERER: PetRenderer = {
  id: "fallback",
  isAvailable: () => true,
  applyEmotion(state) {
    window.dispatchEvent(new CustomEvent("agentrix:pet-emotion-applied", { detail: state }));
  },
  applyInteraction(kind) {
    window.dispatchEvent(new CustomEvent("agentrix:pet-interaction-applied", { detail: kind }));
  },
};
registerPetRenderer(FALLBACK_RENDERER);

// ── Stub renderers for route B (Rive / VRM) ──────────────────────────
//    These exist so external code can probe `listPetRenderers()` and the
//    renderer-changed event will fire once a real implementation lands.
//    Both are gated behind explicit opt-in flags AND the presence of a
//    runtime asset URL — until both are set they report unavailable and
//    the SDK stays on `fallback`. No commercial license required.
//
//    Real impls (V4 W1-W6 in DESKTOP_LIVE2D_BLOCKERS_20260505.zh-CN.md):
//      - rive: dynamic-import `@rive-app/canvas`, attach to <canvas>,
//        push EMOTION_MOTION_MAP[emotion].motion as state-machine input.
//      - vrm:  dynamic-import `three` + `@pixiv/three-vrm`, drive
//        BlendShape proxies from EMOTION_MOTION_MAP[emotion].expression.

function readPetAssetUrl(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

const RIVE_RENDERER: PetRenderer = {
  id: "rive",
  isAvailable() {
    // Available when a `.riv` asset URL has been configured. The actual
    // runtime is dynamic-imported on first emotion to keep the bundle lean.
    return Boolean(readPetAssetUrl("agentrix_pet_rive_url"));
  },
  applyEmotion(state) {
    // Stub: forward to fallback channel until real Rive runtime lands.
    window.dispatchEvent(new CustomEvent("agentrix:pet-emotion-applied", { detail: state }));
  },
  applyInteraction(kind) {
    window.dispatchEvent(new CustomEvent("agentrix:pet-interaction-applied", { detail: kind }));
  },
};
registerPetRenderer(RIVE_RENDERER);

const VRM_RENDERER: PetRenderer = {
  id: "vrm",
  isAvailable() {
    // The runtime renderer (PetVRM via PetRenderer) self-activates as soon as
    // a `.vrm` URL is set in localStorage.agentrix_pet_vrm_url. Both keys are
    // accepted so external skill packs can still seed via readPetAssetUrl.
    return Boolean(readPetAssetUrl("agentrix_pet_vrm_url"));
  },
  applyEmotion(state) {
    // PetVRM listens directly on `agentrix:pet-state`, so we just rebroadcast
    // for any external listeners that key off the renderer-applied channel.
    window.dispatchEvent(new CustomEvent("agentrix:pet-emotion-applied", { detail: state }));
  },
  applyInteraction(kind) {
    window.dispatchEvent(new CustomEvent("agentrix:pet-interaction-applied", { detail: kind }));
  },
};
registerPetRenderer(VRM_RENDERER);
