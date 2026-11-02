/**
 * Pet form-state bus (Sprint P-2, 2026-05-21).
 *
 * Single source of truth for "what is the pet doing right now". The
 * desktop pet (always-on overlay) and the Pro Mode title-bar avatar
 * (in-window) both subscribe to this so they stay in lock-step — when
 * the AI starts streaming, both surfaces switch to the talk/typing
 * sprite at the same time.
 *
 * Why a custom event bus instead of zustand: most consumers are deep
 * inside renderer components that already use ad-hoc CustomEvents
 * (`agentrix:voice-start`, `agentrix:approval-active`, etc.) and we
 * don't want to introduce a state library just for this. The bus is
 * tiny on purpose — extend by adding new modes + new triggers, not by
 * adding indirection.
 *
 * Mode taxonomy mirrors `docs/PET_FORMS_DESIGN_v5.zh-CN.md` §3:
 *
 *   idle          desktop wandering / standing
 *   listening     long-press or wake word — pet stops, ears perked
 *   speaking      AI streaming a reply, pet "talks"
 *   thinking      Pro Mode — AI calling a tool / generating
 *   typing        Pro Mode — AI writing code / long output
 *   done          one-shot celebration after task completes
 *   sleep         long idle / right-click "睡眠"
 *   wardrobe      衣柜 / 灵魂 panel open
 *   computer-use  CU operating mouse/keyboard, pet follows cursor
 *   approval      high-risk approval modal up — pet at modal edge
 */

import type { PetAction } from "../components/PetSpriteCanvas";

export type PetMode =
  | "idle"
  | "listening"
  | "speaking"
  | "thinking"
  | "typing"
  | "done"
  | "sleep"
  | "wardrobe"
  | "computer-use"
  | "approval";

/**
 * Dispatch event name (CustomEvent on `window`). Detail shape:
 *   { mode: PetMode, source: string, ttlMs?: number }
 *
 * `source` is a free-form telemetry tag (e.g. `voice-start`, `cu-active`)
 * that lets consumers reason about who set the mode without us having to
 * formalize a triggers enum. `ttlMs`, when present, asks the bus to
 * auto-revert to `idle` after the duration — used for transient modes
 * like `done` (celebrate then go back to wandering).
 */
export const PET_MODE_EVENT = "agentrix:pet-mode" as const;

/**
 * Map a PetMode → the sprite that should play. Modes that don't have
 * a unique sprite reuse the closest available animation. This keeps
 * the renderers branching-free and lets us swap sprites independently
 * from the bus.
 *
 * The `walk` action is intentionally NOT here — wandering is decided
 * by the wander engine inside PetCompanionWindow, not by the mode bus.
 * The bus says "what state are we in"; the wander engine, when state
 * is `idle`, decides when to switch to `walk`/`sit` per-segment.
 */
export const PET_MODE_TO_SPRITE: Record<PetMode, PetAction> = {
  idle:           "idle",
  listening:      "listen",
  speaking:       "talk",
  thinking:       "pro-thinking",
  typing:         "pro-typing",
  done:           "pro-done",
  sleep:          "sleep",
  // Wardrobe: pet sits in display posture (商人态 — "look at my wares")
  // Reuses sit.png — the seated end-on pose reads as "presenting" the
  // wardrobe contents. Once a dedicated wardrobe.png is delivered by
  // 豆包 the variant resolver will pick it up automatically.
  wardrobe:       "sit",
  "computer-use": "cu-mouse",
  approval:       "alert",
};

let _currentMode: PetMode = "idle";
let _ttlTimer: number | null = null;

export function getPetMode(): PetMode {
  return _currentMode;
}

/**
 * Set the pet mode and broadcast it. Idempotent — same mode is a no-op.
 *
 * Pass `ttlMs` on transient modes like `done` so the bus auto-reverts
 * to `idle` once the celebration animation is over (the renderer's
 * `onActionComplete` could do it but having the timer here makes the
 * transition observable to all subscribers in one place).
 *
 * Sprint P-4 (2026-05-21): also rebroadcasts cross-webview via the
 * Tauri Emitter so all 3 webviews (main, chat-panel, pet-companion)
 * stay in lock-step. The `_originBroadcast` flag prevents echo loops
 * when this function is called from the broadcast listener itself.
 */
export function setPetMode(
  mode: PetMode,
  source: string = "unknown",
  ttlMs?: number,
  _originBroadcast = false,
): void {
  if (typeof window === "undefined") return;
  if (_ttlTimer !== null) {
    window.clearTimeout(_ttlTimer);
    _ttlTimer = null;
  }
  if (_currentMode === mode) return;
  _currentMode = mode;
  window.dispatchEvent(
    new CustomEvent(PET_MODE_EVENT, { detail: { mode, source, ttlMs } }),
  );
  // Cross-webview broadcast — only when the call did NOT originate
  // from a broadcast (to prevent echo loops).
  if (!_originBroadcast && (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
    void import("@tauri-apps/api/core").then(({ invoke }) => {
      void invoke("desktop_pet_broadcast_mode", { mode, source }).catch(() => {
        /* tauri command unavailable; pure-JS fallback already fired */
      });
      // Sprint P-7 phase 1 (2026-05-22): mirror mode to system tray
      // icon so the user gets a glanceable signal even when both the
      // pet window and main window are off-screen / hidden.
      void invoke("desktop_pet_set_tray_mode", { mode }).catch(() => {
        /* tray icon swap is best-effort; ignore failures */
      });
    });
  }
  if (typeof ttlMs === "number" && ttlMs > 0 && mode !== "idle") {
    _ttlTimer = window.setTimeout(() => {
      _ttlTimer = null;
      setPetMode("idle", `${source}:ttl`);
    }, ttlMs);
  }
}

/**
 * Subscribe to mode changes. Returns an unsubscribe function suitable
 * for a `useEffect` cleanup.
 */
export function subscribePetMode(
  cb: (mode: PetMode, source: string) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as { mode?: PetMode; source?: string } | undefined;
    if (!detail || typeof detail.mode !== "string") return;
    cb(detail.mode as PetMode, detail.source ?? "unknown");
  };
  window.addEventListener(PET_MODE_EVENT, handler as EventListener);
  return () => window.removeEventListener(PET_MODE_EVENT, handler as EventListener);
}

/**
 * Wire the existing ad-hoc events (`agentrix:voice-start`,
 * `agentrix:approval-active`, etc.) into the unified mode bus. Idempotent
 * — call once during app boot. Subsequent calls are no-ops.
 *
 * The wiring philosophy: keep individual feature modules dispatching
 * their semantic events as before; this function is a centralized
 * adapter that translates those into mode transitions. Removing this
 * adapter degrades the pet to "always idle" without breaking any
 * feature module.
 */
let _wiredUp = false;
export function bootPetModeBus(): void {
  if (typeof window === "undefined") return;
  if (_wiredUp) return;
  _wiredUp = true;

  // ── Cross-webview broadcast listener (Sprint P-4) ───────────────
  // Two channels for redundancy:
  //   (a) Tauri IPC `listen()` — fastest, structured payload
  //   (b) DOM CustomEvent — set by Rust via webview.eval() as backup,
  //       handles cases where the Tauri event bus is busy / dropping
  if ((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
    void import("@tauri-apps/api/event").then(({ listen }) => {
      void listen<{ mode: string; source: string }>(
        "agentrix:pet-mode-broadcast",
        (event) => {
          const { mode, source } = event.payload || {};
          if (typeof mode !== "string") return;
          // Pass _originBroadcast=true to prevent re-broadcasting.
          setPetMode(mode as PetMode, source ?? "broadcast", undefined, true);
        },
      );
    });
  }
  // (b) DOM channel — Rust evals
  // `window.dispatchEvent(new CustomEvent("agentrix:pet-mode-broadcast", {detail:{mode}}))`
  // into every webview. We listen for it here too as a redundancy path.
  window.addEventListener("agentrix:pet-mode-broadcast", (e: Event) => {
    const detail = (e as CustomEvent).detail as { mode?: string; source?: string } | undefined;
    if (!detail || typeof detail.mode !== "string") return;
    setPetMode(detail.mode as PetMode, detail.source ?? "broadcast-dom", undefined, true);
  });

  // ── Voice ────────────────────────────────────────────────────────
  // voice-start fires when user activates voice (long-press, hotkey,
  // wake word, or pet menu). voice-stop / voice-end ends listening.
  window.addEventListener("agentrix:voice-start", () => {
    setPetMode("listening", "voice-start");
  });
  window.addEventListener("agentrix:voice-stop", () => {
    if (getPetMode() === "listening") setPetMode("idle", "voice-stop");
  });
  window.addEventListener("agentrix:voice-end", () => {
    if (getPetMode() === "listening") setPetMode("idle", "voice-end");
  });

  // ── LLM stream lifecycle ─────────────────────────────────────────
  // ChatPanelImpl dispatches these around streaming turns. While Pro
  // Mode is open we map streaming → typing (it usually is generating
  // long answers / code); in the floating-pet idle scenario we map to
  // talk (the pet "speaks" the reply). Pro Mode visibility comes from
  // the `agentrix:app-mode-changed` broadcast in App.tsx.
  let proModeOpen = false;
  window.addEventListener("agentrix:app-mode-changed", (e: Event) => {
    const detail = (e as CustomEvent).detail as { mode?: string } | undefined;
    proModeOpen = detail?.mode === "pro-mode";
  });
  window.addEventListener("agentrix:llm-stream-start", () => {
    setPetMode(proModeOpen ? "thinking" : "speaking", "llm-stream-start");
  });
  window.addEventListener("agentrix:llm-stream-typing", () => {
    if (proModeOpen) setPetMode("typing", "llm-stream-typing");
  });
  window.addEventListener("agentrix:llm-stream-end", () => {
    // Brief celebration if Pro Mode, then back to idle.
    if (proModeOpen) {
      setPetMode("done", "llm-stream-end", 1200);
    } else {
      setPetMode("idle", "llm-stream-end");
    }
  });

  // ── Computer Use ─────────────────────────────────────────────────
  window.addEventListener("agentrix:cu-active", (e: Event) => {
    const detail = (e as CustomEvent).detail as { active?: boolean } | undefined;
    if (detail?.active) {
      setPetMode("computer-use", "cu-active");
    } else if (getPetMode() === "computer-use") {
      setPetMode("idle", "cu-inactive");
    }
  });

  // ── Approval modal ───────────────────────────────────────────────
  // Existing event — fired by Rust pet_window::set_approval_active and
  // by ChatPanelImpl when an approval modal opens.
  window.addEventListener("agentrix:approval-active", (e: Event) => {
    const detail = (e as CustomEvent).detail as { active?: boolean } | undefined;
    if (detail?.active) {
      setPetMode("approval", "approval-active");
    } else if (getPetMode() === "approval") {
      setPetMode("idle", "approval-inactive");
    }
  });

  // ── Wardrobe / Soul / 衣柜 panels ─────────────────────────────────
  window.addEventListener("agentrix:open-wardrobe", () => {
    setPetMode("wardrobe", "open-wardrobe");
  });
  window.addEventListener("agentrix:open-soul-picker", () => {
    setPetMode("wardrobe", "open-soul-picker");
  });
  window.addEventListener("agentrix:close-wardrobe", () => {
    if (getPetMode() === "wardrobe") setPetMode("idle", "close-wardrobe");
  });

  // ── Sleep / Hide ─────────────────────────────────────────────────
  // PetCompanionWindow already manages its local `state` for these and
  // dispatches state-set commands to Rust; mirror them here so the
  // title-bar avatar also sleeps.
  window.addEventListener("agentrix:pet-companion-state", (e: Event) => {
    const detail = (e as CustomEvent).detail as { state?: string } | undefined;
    if (detail?.state === "sleep") {
      setPetMode("sleep", "pet-companion-sleep");
    } else if (detail?.state === "idle" && getPetMode() === "sleep") {
      setPetMode("idle", "pet-companion-wake");
    }
  });
}
