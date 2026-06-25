/**
 * PetCompanionWindow — small follow-along window hosting the live pet.
 *
 * v0.3.2 architecture (2026-05-21):
 *   - Tauri window is 200×240 logical px, transparent, always-on-top,
 *     skip-taskbar, decorations off. **Not** a fullscreen overlay.
 *   - Wander engine moves the **whole window** via
 *     `desktop_pet_window_move_to(x, y)` at ~30 Hz. The pet sprite
 *     itself sits at fixed (20, 40) inside the window.
 *   - All input (click / drag / right-click) lands natively on the
 *     small window — no `set_ignore_cursor_events` toggling, no IPC
 *     race. Outside the 200×240 box, clicks reach the desktop because
 *     the window simply doesn't cover that area.
 *   - GPU snow on transparent surfaces (tauri#4881) is mitigated by
 *     keeping the sprite continuously animated even when "idle"
 *     (4-frame breathing loop) so the WebView2 compositor never sees
 *     two consecutive identical frames. The
 *     `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` (set in main.rs) further
 *     stabilizes the GPU surface.
 *
 * Responsibilities (unchanged):
 *   - Render the active pet sprite (PetSpriteCanvas / PetCanvas fallback)
 *   - Drive autonomous wandering via services/petCompanion
 *   - Translate user input:
 *       - single click   → voice activate
 *       - double-click   → open chat-panel
 *       - long-press     → push-to-talk
 *       - right-click    → context menu
 *       - drag           → free positioning + taskbar-corner snap-hide
 */
import { useEffect, useRef, useState, useCallback, type CSSProperties } from "react";
import PetProactiveBubble from "./PetProactiveBubble";
import PetSpriteCanvas, { spriteAssetsAvailable } from "./PetSpriteCanvas";
import PetCanvas from "./PetCanvas";
import CrossToolContextBar from "./CrossToolContextBar";
import {
  PathPlayer,
  buildSegment,
  clampToBounds,
  pickWanderTargetV2,
  speedForEmotion,
  type CompanionBounds,
  type CompanionPosition,
  type CompanionState,
} from "../services/petCompanion";
import { getLastPetState, triggerPetInteraction } from "../services/petSdk";
import { getPetMode, subscribePetMode, PET_MODE_TO_SPRITE, type PetMode } from "../services/petMode";
import { invoke } from "@tauri-apps/api/core";
import { useActiveSubTasksCount } from "../services/teamActivityStore";
import { useUserMode } from "../services/userMode";

const IDLE_BETWEEN_WANDERS_MS_MIN = 3000;
const IDLE_BETWEEN_WANDERS_MS_MAX = 6000;
const LONG_PRESS_MS = 350;
const DRAG_THRESHOLD_PX = 5;
const TASKBAR_SNAP_THRESHOLD_PX = 64;
/** Sprite size in CSS px. Must fit inside the Tauri window (200×240). */
const PET_W_NUM = 160;
const PET_H_NUM = 160;
/** Tauri window inner size in CSS px. Must match `PET_WIN_W/H` in `pet_window.rs`. */
const WIN_W = 200;
const WIN_H = 240;
/** Where the pet sprite sits inside the window. */
const SPRITE_OFFSET_X = (WIN_W - PET_W_NUM) / 2; // 20
const SPRITE_OFFSET_Y = 40;

interface CtxMenuState {
  visible: boolean;
  x: number;
  y: number;
}

const HIDDEN_MENU: CtxMenuState = { visible: false, x: 0, y: 0 };

export default function PetCompanionWindow() {
  const [bounds, setBounds] = useState<CompanionBounds | null>(null);
  const [state, setState] = useState<CompanionState>("idle");
  // Multi-Agent v1 W1 — Simple Mode badge: show count of in-flight
  // sub-tasks (R5.1). Badge only renders when Simple Mode AND count > 0.
  const teamActiveCount = useActiveSubTasksCount();
  const userMode = useUserMode();
  const showTeamBadge = userMode === "simple" && teamActiveCount > 0;
  const [menu, setMenu] = useState<CtxMenuState>(HIDDEN_MENU);
  const [docked, setDocked] = useState(false);
  // Bumped from the wander RAF tick to force re-render of the pet sprite at
  // its new CSS `left/top`. We don't store position in React state because
  // RAF-rate setState would thrash; positionRef is the source of truth and
  // renderTick just signals "read it again".
  const [renderTick, setRenderTick] = useState(0);

  // Mark this webview as the pet window so global.css can switch
  // body/#root from the dark theme to a fully transparent overlay.
  // The Rust side opens this window fullscreen + transparent +
  // ignore_cursor_events=true. Sprites are RGBA PNGs (v9), so they
  // alpha-composite cleanly with no white card needed.
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.getAttribute("data-pet-window");
    html.setAttribute("data-pet-window", "1");
    const prevBodyBg = document.body.style.background;
    const prevHtmlBg = html.style.background;
    const prevRootBg = (document.getElementById("root") as HTMLElement | null)?.style.background ?? "";
    document.body.style.background = "transparent";
    html.style.background = "transparent";
    const root = document.getElementById("root") as HTMLElement | null;
    if (root) root.style.background = "transparent";
    return () => {
      if (prev === null) html.removeAttribute("data-pet-window");
      else html.setAttribute("data-pet-window", prev);
      document.body.style.background = prevBodyBg;
      html.style.background = prevHtmlBg;
      if (root) root.style.background = prevRootBg;
    };
  }, []);

  // Check if user previously opted out of the pet window. If so, close
  // immediately (the Rust side auto-opens on startup for discoverability).
  // NOTE: Disabled for v0.2.9 — always show pet window on startup.
  // Users can hide via right-click menu → "Hide Pet".
  useEffect(() => {
    try {
      // Clear any stale hidden flag so pet always shows
      localStorage.removeItem("agentrix_pet_window_hidden");
    } catch { /* ignore */ }
  }, []);

  // ── Passthrough policy ─────────────────────────────────────────
  //
  // FIX 2026-05-21 (Sprint P-1): the old policy turned passthrough on/off
  // based on `onMouseEnter` / `onMouseLeave` of the hitbox div. That had
  // two race conditions:
  //
  //   1. The wander RAF moves the hitbox at ~30 Hz. If the cursor is
  //      stationary while the pet walks out from under it, mouseLeave
  //      never fires (the cursor didn't move) and the pet keeps absorbing
  //      clicks from the *previous* hitbox position.
  //
  //   2. While dragging, React re-renders the hitbox at the new CSS
  //      `left/top`. Between the unmount of the old DOM node and the
  //      mount of the new one, a click can land in the gap and fall
  //      through to the desktop instead of being captured by the pet.
  //
  // New policy: maintain a **single tracked rect** (the pet sprite's
  // bounding box in screen-relative logical pixels) and check the cursor
  // against it via a 60 Hz Tauri command (`desktop_pet_get_cursor_position`,
  // already present for the cursor-follow eyes). When the cursor is inside
  // the rect → passthrough OFF. When outside → passthrough ON. This is
  // monotonic and never depends on DOM event timing.
  //
  // Plus: while dragging or while the right-click menu is up, force
  // passthrough OFF unconditionally so we never lose pointer capture.
  const positionRef = useRef<CompanionPosition>({ x: 0, y: 0 });
  const playerRef = useRef(new PathPlayer());
  const lastFrameTsRef = useRef<number>(performance.now());
  const lastRenderTsRef = useRef<number>(0);
  const draggingRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<number | null>(null);
  const menuAnchorRef = useRef<{ x: number; y: number } | null>(null);

  const invokePetWindow = useCallback(
    async <T,>(cmd: string, args?: Record<string, unknown>): Promise<T | null> => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        return (await invoke(cmd, args ?? {})) as T;
      } catch (err) {
        console.warn(`[pet-companion] ${cmd} failed`, err);
        return null;
      }
    },
    [],
  );

  // Boot: load monitor bounds from Rust. The pet window is a small
  // 200×240 follow-along window now (v0.3.2), so wander coordinates
  // are **screen coordinates** of the window's top-left corner — we
  // clamp them so the entire 200×240 window stays inside the visible
  // monitor. All values in logical (CSS) px.
  useEffect(() => {
    let cancelled = false;
    invokePetWindow<CompanionBounds & { taskbar_inset_px?: number; scale_factor?: number }>(
      "desktop_pet_window_get_screen_bounds",
    ).then((b) => {
      if (cancelled || !b) return;
      const normalized: CompanionBounds = {
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        bottomInset: (b as { taskbar_inset_px?: number }).taskbar_inset_px ?? 48,
      };
      setBounds(normalized);
      // Seed pet window position near the bottom-right corner of the
      // monitor — Rust already opened it at this rough position; we
      // sync our state so the wander engine has a starting point.
      positionRef.current = clampToBounds(
        {
          x: normalized.x + normalized.width - WIN_W - 32,
          y: normalized.y + normalized.height - WIN_H - 80,
        },
        normalized,
      );
      setRenderTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [invokePetWindow]);

  // Wander loop — runs only when not docked / dragging / approval pending.
  // When an approval modal is open in the main window, we pause the wander
  // RAF loop to free the GPU for smooth approval UI rendering. WebView2
  // shares GPU context across windows; high-frequency animation here can
  // cause input lag in other windows.
  const [approvalActive, setApprovalActive] = useState(false);
  const [facing, setFacing] = useState<"left" | "right">("right");
  // Random idle animations — stretch/yawn/wiggle to make pet feel alive
  // even when standing still. Cycles through every 3-7 seconds.
  const [idleAction, setIdleAction] = useState<"none" | "stretch" | "wiggle" | "blink">("none");
  useEffect(() => {
    if (state !== "idle" || docked || approvalActive) {
      setIdleAction("none");
      return;
    }
    const tick = () => {
      const actions = ["stretch", "wiggle", "blink", "none", "none"] as const;
      const next = actions[Math.floor(Math.random() * actions.length)];
      setIdleAction(next);
      // Reset to none after the animation duration
      if (next !== "none") {
        setTimeout(() => setIdleAction("none"), 1200);
      }
    };
    const interval = window.setInterval(tick, 3000 + Math.random() * 4000);
    return () => window.clearInterval(interval);
  }, [state, docked, approvalActive]);

  // Phase B: detect whether multi-frame sprite assets are available.
  // If yes, use PetSpriteCanvas; if not, fall back to Phase A PetCanvas.
  // Note: 3D VRM was attempted but Hunyuan3D outputs static meshes without
  // animation — the result is a grey blob that doesn't match the character.
  // We stay on 2D sprites until proper rigged VRM assets are available.
  const [useSprites, setUseSprites] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void spriteAssetsAvailable().then((available) => {
      if (!cancelled) setUseSprites(available);
    });
    return () => { cancelled = true; };
  }, []);

  // Sprint P-2 (2026-05-21): subscribe to the unified PetMode bus so the
  // desktop pet's sprite reflects what the AI is doing — listening,
  // talking, working, alerting, etc. The local `state` ("idle"/"wander"/
  // "sleep"/...) still decides locomotion (the wander engine), but the
  // sprite chosen for rendering prefers the global mode whenever it
  // says something more specific than "idle". See PET_FORMS_DESIGN_v5.
  const [petMode, setPetModeLocal] = useState<PetMode>(() => getPetMode());
  useEffect(() => subscribePetMode((m) => setPetModeLocal(m)), []);

  // While the global mode is "stop and emote" (listening / talking /
  // approval / cu-mouse), pause the wander RAF loop so the pet visibly
  // stops to react. This is the same pause we already use during
  // approvalActive — we just generalize it.
  const wanderPaused =
    petMode === "listening" ||
    petMode === "speaking" ||
    petMode === "thinking" ||
    petMode === "typing" ||
    petMode === "approval" ||
    petMode === "computer-use";

  // Sprint P-3 (2026-05-21): when entering listening/speaking modes,
  // smoothly glide the pet toward the cursor's vicinity (offset down +
  // right ~80 px) so it feels like the pet is "leaning in" to interact.
  // Uses the existing PathPlayer so the easing matches normal wander
  // motion. Triggers exactly once per mode entry.
  const lastApproachModeRef = useRef<PetMode>("idle");
  useEffect(() => {
    if (!bounds) return;
    if (docked) return;
    if (lastApproachModeRef.current === petMode) return;
    lastApproachModeRef.current = petMode;
    const shouldApproach = petMode === "listening" || petMode === "speaking";
    if (!shouldApproach) return;

    let cancelled = false;
    (async () => {
      try {
        const cursor = await invoke<{ x: number; y: number }>("desktop_pet_get_cursor_position");
        if (cancelled) return;
        const dpr = window.devicePixelRatio || 1;
        const cx = cursor.x / dpr;
        const cy = cursor.y / dpr;
        const target = clampToBounds(
          { x: cx + 40, y: cy + 60 },
          bounds,
        );
        // Skip if we're already close enough (within 60 px) — avoids a
        // visible micro-jump when the pet is already near the cursor.
        const dx = target.x - positionRef.current.x;
        const dy = target.y - positionRef.current.y;
        if (Math.hypot(dx, dy) < 60) return;
        if (target.x > positionRef.current.x + 8) setFacing("right");
        else if (target.x < positionRef.current.x - 8) setFacing("left");
        playerRef.current.setSegment(buildSegment(positionRef.current, target, 220));
        // Run a one-off RAF to play out this lean-in segment regardless of
        // wanderPaused (the wander RAF is gated off in non-idle modes).
        let raf = 0;
        let last = performance.now();
        const tick = () => {
          if (cancelled) return;
          const now = performance.now();
          const dt = Math.min(64, now - last);
          last = now;
          const player = playerRef.current;
          if (!player.hasSegment()) return;
          const sample = player.tick(dt);
          if (sample && bounds) {
            positionRef.current = clampToBounds(sample.position, bounds);
            setRenderTick((t) => (t + 1) & 0x3fffffff);
            if (sample.done) return;
          }
          raf = window.requestAnimationFrame(tick);
        };
        raf = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(raf);
      } catch { /* cursor position unavailable; skip the lean-in */ }
    })();
    return () => { cancelled = true; };
  }, [petMode, bounds, docked]);

  // Sprint v0.3.2: every time the wander RAF (or drag handler) moves
  // positionRef, we sync the Tauri window position via IPC. This is
  // throttled to ~30 Hz by the wander RAF itself; we skip if the new
  // position is identical to the last one synced so we don't burn IPC
  // on stationary frames.
  //
  // Sprint v0.3.6: skip the sync entirely while the pet is docked
  // (minimized to taskbar corner). The Rust side controls position
  // and size in dock mode; replaying our pre-dock `positionRef` would
  // pop the window back out of the corner.
  const lastSyncedPosRef = useRef<CompanionPosition>({ x: -9999, y: -9999 });
  useEffect(() => {
    if (docked) return;
    const pos = positionRef.current;
    if (
      pos.x === lastSyncedPosRef.current.x &&
      pos.y === lastSyncedPosRef.current.y
    ) return;
    lastSyncedPosRef.current = { x: pos.x, y: pos.y };
    void invokePetWindow("desktop_pet_window_move_to", { x: pos.x, y: pos.y });
  }, [renderTick, docked, invokePetWindow]);

  // Sprint v0.3.2 (originally): cursor-follow loop was purely visual.
  // Hotfix #12 (2026-05-25): now ALSO drives passthrough toggle for the
  // fullscreen-overlay architecture. The pet window covers the entire
  // monitor and starts with set_ignore_cursor_events(true). When the
  // OS cursor enters the sprite's screen-space bounding box, we flip
  // passthrough OFF so the WebView2 captures the click; when it leaves,
  // we flip passthrough ON so clicks pass through to the desktop.
  // This implements the policy that the file's header docstring
  // documented but the v0.3.2 commit never wired up.
  // Polled at 10 Hz (matches existing facing-flip cadence).
  useEffect(() => {
    if (docked || approvalActive) return;
    let cancelled = false;
    let lastPassthrough: boolean | null = null;
    // Sprite hitbox in screen-space logical pixels. v0.6.4 fullscreen
    // overlay: sprite is rendered at CSS positionRef.current (screen
    // coords), sized PET_W_NUM x PET_H_NUM.
    const inHitbox = (cx: number, cy: number): boolean => {
      const sx = positionRef.current.x;
      const sy = positionRef.current.y;
      const w = docked ? 48 : PET_W_NUM;
      const h = docked ? 48 : PET_H_NUM;
      // 8 px slack so cursor can hover an edge without instant flip.
      const slack = 8;
      return cx >= sx - slack && cx <= sx + w + slack
          && cy >= sy - slack && cy <= sy + h + slack;
    };
    const tick = async () => {
      if (cancelled) return;
      try {
        const cursor = await invoke<{ x: number; y: number }>("desktop_pet_get_cursor_position");
        if (cancelled) return;
        const dpr = window.devicePixelRatio || 1;
        const cx = cursor.x / dpr;
        const cy = cursor.y / dpr;

        // ── Hotfix #12 — Passthrough toggle ──────────────────────
        // While dragging or while the right-click menu is up, force
        // passthrough OFF unconditionally so we never lose pointer
        // capture mid-interaction (matches design intent in file header).
        const forceCapture = draggingRef.current !== null || menu.visible;
        const wantPassthrough = forceCapture ? false : !inHitbox(cx, cy);
        if (wantPassthrough !== lastPassthrough) {
          lastPassthrough = wantPassthrough;
          void invokePetWindow("desktop_pet_window_set_passthrough", { enabled: wantPassthrough });
        }

        // Computer Use mode: physically shadow the cursor.
        if (petMode === "computer-use" && bounds) {
          const target = clampToBounds(
            { x: cx + 40, y: cy + 24 },
            bounds,
          );
          if (
            Math.abs(target.x - positionRef.current.x) > 1 ||
            Math.abs(target.y - positionRef.current.y) > 1
          ) {
            positionRef.current = target;
            setRenderTick((t) => (t + 1) & 0x3fffffff);
          }
          if (cx > target.x + WIN_W / 2) setFacing("right");
          else if (cx < target.x + WIN_W / 2) setFacing("left");
          return;
        }

        // Idle: just update facing based on cursor relative to pet
        // sprite center (positionRef = sprite's screen-coord origin).
        if (state === "idle") {
          const petCenterX = positionRef.current.x + PET_W_NUM / 2;
          if (cx > petCenterX + 24) setFacing("right");
          else if (cx < petCenterX - 24) setFacing("left");
        }
      } catch { /* Tauri command unavailable — bail silently */ }
    };
    const interval = window.setInterval(tick, 100);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [state, docked, approvalActive, petMode, bounds, menu.visible, invokePetWindow]);

  // Sprint P-4: auto-sleep after `IDLE_SLEEP_MS` of no user input.
  // Activity is reset on every cursor proximity sample, every drag,
  // every menu open, every Tauri event. Once the timer fires the pet
  // visibly transitions to sleep (sleep.png + 💤 bubble). The next
  // user click wakes it up via the click handler.
  const IDLE_SLEEP_MS = 10 * 60 * 1000; // 10 minutes
  const lastActivityRef = useRef<number>(performance.now());
  useEffect(() => {
    if (docked) return;
    if (state === "sleep") return;
    if (petMode !== "idle") {
      // Any AI activity counts as user activity (the user IS engaged).
      lastActivityRef.current = performance.now();
      return;
    }
    const interval = window.setInterval(() => {
      const idleMs = performance.now() - lastActivityRef.current;
      // The early-return at the top of this effect already gates on
      // `state !== "sleep"`, and React re-runs the effect when state
      // changes — so by the time this interval ticks, `state` here
      // is guaranteed to still be the non-sleep value the effect
      // was started with. We just need to push the transition once.
      if (idleMs >= IDLE_SLEEP_MS) {
        setState("sleep");
        void invokePetWindow("desktop_pet_window_set_state", { state: "sleep" });
      }
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [docked, state, petMode, invokePetWindow]);

  // Reset the idle timer on any user input — drag, right-click,
  // menu open, etc. We hook it once at the document level so every
  // interactive surface counts.
  useEffect(() => {
    const reset = () => { lastActivityRef.current = performance.now(); };
    window.addEventListener("pointerdown", reset);
    window.addEventListener("pointermove", reset, { passive: true });
    window.addEventListener("keydown", reset);
    return () => {
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("pointermove", reset);
      window.removeEventListener("keydown", reset);
    };
  }, []);

  // Phase B: occasional jump action while idle — adds personality
  const [jumpKey, setJumpKey] = useState(0);
  const [jumping, setJumping] = useState(false);
  const [eating, setEating] = useState(false);
  useEffect(() => {
    if (state !== "idle" || docked || approvalActive) return;
    const interval = window.setInterval(() => {
      // 15% chance to jump every cycle
      if (Math.random() < 0.15) {
        setJumping(true);
        setJumpKey((k) => k + 1);
        setTimeout(() => setJumping(false), 600);
      }
    }, 5000 + Math.random() * 5000);
    return () => window.clearInterval(interval);
  }, [state, docked, approvalActive]);
  useEffect(() => {
    const onApprovalChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setApprovalActive(Boolean(detail?.active));
    };
    window.addEventListener("agentrix:approval-active", onApprovalChange as EventListener);
    return () => window.removeEventListener("agentrix:approval-active", onApprovalChange as EventListener);
  }, []);

  // ─────────────────────────────────────────────────────────────────────
  // Multi-Agent v1 W4.3 — sub-task pulse (green/red/amber) on the
  // CompanionBall when sub-task events arrive via socket. Pulse auto-
  // clears after 1 s. Detected via `agentrix:socket-event` (sessionSync
  // forwards every server-side event to the DOM, see services/sessionSync).
  //
  // Spec: design.md §7.2, §7.3; tasks.md W4.3; R9.3 / R9.5
  // ─────────────────────────────────────────────────────────────────────
  const [subTaskPulse, setSubTaskPulse] = useState<"green" | "red" | "amber" | null>(null);
  /** Track unacknowledged completions for the W4.7 aggregated chat inject. */
  const unackedCompletionsRef = useRef<string[]>([]);
  useEffect(() => {
    const onSocketEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ event?: string; data?: any }>).detail;
      if (!detail?.event) return;
      if (detail.event === "presence:multi-agent.sub-task-completed") {
        const ok = detail.data?.ok !== false;
        const subTaskId = detail.data?.sub_task_id as string | undefined;
        setSubTaskPulse(ok ? "green" : "red");
        if (subTaskId) {
          unackedCompletionsRef.current = [
            ...unackedCompletionsRef.current,
            subTaskId,
          ].slice(-16);
        }
        const t = window.setTimeout(() => setSubTaskPulse(null), 1000);
        return () => window.clearTimeout(t);
      }
      if (detail.event === "presence:multi-agent.sub-task-stalled") {
        setSubTaskPulse("amber");
        const t = window.setTimeout(() => setSubTaskPulse(null), 1500);
        return () => window.clearTimeout(t);
      }
    };
    window.addEventListener("agentrix:socket-event", onSocketEvent as EventListener);
    return () =>
      window.removeEventListener("agentrix:socket-event", onSocketEvent as EventListener);
  }, []);

  // Sprint P-7+ (2026-05-26): fly-out transition. When Pro Mode opens,
  // the desktop pet sprite briefly flies toward the top-left (where the
  // ChatPanel title-bar PetAvatar lives) with scale + translate, paired
  // with PetAvatar's fly-IN transform. Together they read as "the pet
  // jumped from desktop into the workspace".
  const [flyingOut, setFlyingOut] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { mode?: string } | undefined;
      if (detail?.mode === "pro-mode") {
        setFlyingOut(true);
        const t = window.setTimeout(() => setFlyingOut(false), 520);
        return () => window.clearTimeout(t);
      }
      // Closing pro mode: pet "flies back" — implicit (just remount)
    };
    window.addEventListener("agentrix:app-mode-changed", handler);
    return () => window.removeEventListener("agentrix:app-mode-changed", handler);
  }, []);

  useEffect(() => {
    if (!bounds) return;
    if (docked) return;
    if (approvalActive) return; // pause animations when user is interacting with approval
    if (wanderPaused) return; // Sprint P-2: also pause when listening/talking/CU/etc.
    let raf = 0;
    let scheduleTimer: number | null = null;

    const scheduleNextSegment = () => {
      const delay =
        IDLE_BETWEEN_WANDERS_MS_MIN +
        Math.random() * (IDLE_BETWEEN_WANDERS_MS_MAX - IDLE_BETWEEN_WANDERS_MS_MIN);
      scheduleTimer = window.setTimeout(() => {
        if (draggingRef.current || docked) return;
        const target = pickWanderTargetV2(bounds, positionRef.current);
        // Update facing direction based on movement
        if (target.x > positionRef.current.x + 8) {
          setFacing("right");
        } else if (target.x < positionRef.current.x - 8) {
          setFacing("left");
        }
        const emotion = getLastPetState()?.emotion ?? null;
        const speed = 90 * speedForEmotion(emotion);
        playerRef.current.setSegment(buildSegment(positionRef.current, target, speed));
        setState("wander");
        void invokePetWindow("desktop_pet_window_set_state", { state: "wander" });
      }, delay);
    };

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(64, now - lastFrameTsRef.current);
      lastFrameTsRef.current = now;
      const player = playerRef.current;
      if (player.hasSegment()) {
        const sample = player.tick(dt);
        if (sample) {
          // Clamp position to bounds on every frame to prevent off-screen drift
          positionRef.current = bounds
            ? clampToBounds(sample.position, bounds)
            : sample.position;
          // Drive a React re-render so the pet sprite container's
          // CSS left/top updates. Throttled to ~30 Hz to avoid wasted
          // setState round-trips while still being smoother than the eye.
          if (now - lastRenderTsRef.current >= 33) {
            lastRenderTsRef.current = now;
            setRenderTick((t) => (t + 1) & 0x3fffffff);
          }
          if (sample.done) {
            setState("idle");
            setRenderTick((t) => (t + 1) & 0x3fffffff);
            void invokePetWindow("desktop_pet_window_set_state", { state: "idle" });
            scheduleNextSegment();
          }
        }
      }
      raf = window.requestAnimationFrame(tick);
    };

    lastFrameTsRef.current = performance.now();
    scheduleNextSegment();
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      if (scheduleTimer !== null) window.clearTimeout(scheduleTimer);
    };
  }, [bounds, docked, approvalActive, wanderPaused, invokePetWindow]);

  // ── Input handlers ────────────────────────────────────────────────
  const dispatchVoice = useCallback(() => {
    void triggerPetInteraction("voice_greet");
    // The pet-companion webview can't reach the main window via
    // dispatchEvent (different webview = different `window`). We
    // relay the event through Rust which calls .eval() on every
    // user-facing webview. App.tsx's handleVoiceActivate listener
    // then calls triggerVoiceFlow which opens Pro Mode + dispatches
    // voice-start with the right 250 ms delay.
    void invokePetWindow("desktop_pet_relay_event", { eventName: "agentrix:voice-activate" });
    // Also explicitly bring main window to front so user sees the
    // Pro Mode panel that's about to open.
    void invokePetWindow("desktop_bridge_open_chat_panel");
  }, [invokePetWindow]);

  const openChatPanel = useCallback(async () => {
    void triggerPetInteraction("double_click");
    await invokePetWindow("desktop_bridge_open_chat_panel");
  }, [invokePetWindow]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button === 2) return; // right-click handled separately
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      draggingRef.current = {
        startX: e.screenX,
        startY: e.screenY,
        originX: positionRef.current.x,
        originY: positionRef.current.y,
        moved: false,
      };
      // Cancel any in-flight wander segment.
      playerRef.current = new PathPlayer();

      // Start long-press timer (push-to-talk).
      longPressTimerRef.current = window.setTimeout(() => {
        if (draggingRef.current && !draggingRef.current.moved) {
          window.dispatchEvent(new CustomEvent("agentrix:voice-start"));
          void triggerPetInteraction("hover_long");
          setState("busy");
        }
      }, LONG_PRESS_MS);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = draggingRef.current;
      if (!drag) return;
      const dx = e.screenX - drag.startX;
      const dy = e.screenY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      const newX = Math.round(drag.originX + dx);
      const newY = Math.round(drag.originY + dy);
      positionRef.current = { x: newX, y: newY };
      // Drag uses CSS, not native window move — the window itself is a
      // fullscreen overlay so only the inner sprite element should slide.
      setRenderTick((t) => (t + 1) & 0x3fffffff);
    },
    [],
  );

  const handlePointerUp = useCallback(
    async (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = draggingRef.current;
      draggingRef.current = null;
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      // Sprint P-2 follow-up (2026-05-26): if the long-press timer
      // already fired (state === "busy"), we entered listening mode.
      // Pointer-up should end voice capture so the listening sprite
      // reverts to idle. Without this the pet stays stuck in listen
      // forever after a single long-press.
      if (state === "busy") {
        try {
          window.dispatchEvent(new CustomEvent("agentrix:voice-stop"));
        } catch { /* SSR */ }
        setState("idle");
      }
      // Sprint v0.3.6: while docked, ANY pointer-up means "restore".
      // We don't require a matching pointerDown / drag — a quick tap
      // on the 48×48 thumbnail should always work, even if some prior
      // event was lost.
      if (docked) {
        await invokePetWindow("desktop_pet_window_restore");
        setDocked(false);
        setState("idle");
        return;
      }
      if (!drag) return;

      if (drag.moved) {
        // If released near the bottom edge → snap-hide to the taskbar corner.
        if (bounds) {
          const distToBottom =
            bounds.y + bounds.height - (positionRef.current.y + 200);
          if (distToBottom < TASKBAR_SNAP_THRESHOLD_PX) {
            await invokePetWindow("desktop_pet_window_minimize_to_tray");
            setDocked(true);
            setState("sleep");
            return;
          }
          // Else clamp inside bounds.
          const clamped = clampToBounds(positionRef.current, bounds);
          if (clamped.x !== positionRef.current.x || clamped.y !== positionRef.current.y) {
            positionRef.current = clamped;
            setRenderTick((t) => (t + 1) & 0x3fffffff);
          }
        }
        return;
      }

      // Click — handle single vs. double via small debounce.
      // (Docked already handled at the top of this callback.)
      // Sprint P-4: single-click on a sleeping pet wakes it up
      // (instead of triggering voice). The sprite immediately flips
      // back to idle so the user sees the pet "stretch" awake.
      if (state === "sleep") {
        setState("idle");
        await invokePetWindow("desktop_pet_window_set_state", { state: "idle" });
        return;
      }
      clickCountRef.current += 1;
      if (clickTimerRef.current === null) {
        clickTimerRef.current = window.setTimeout(() => {
          const count = clickCountRef.current;
          clickCountRef.current = 0;
          clickTimerRef.current = null;
          if (count >= 2) {
            void openChatPanel();
          } else {
            dispatchVoice();
            void triggerPetInteraction("tap");
          }
        }, 220);
      }
      void e;
    },
    [bounds, docked, state, dispatchVoice, openChatPanel, invokePetWindow],
  );

  // Sprint v0.3.3: opening the right-click menu has to temporarily
  // grow the Tauri window so the menu div has somewhere to render —
  // the new architecture has the small pet window doubling as the
  // input + render boundary, so anything outside its 200×240 box is
  // simply invisible. We resize to ~320 wide × ~600 tall (15+ items
  // menu @ ~28 px/row + 3 separators + padding) before painting the
  // menu DOM and restore on close.
  //
  // Sprint Pre-launch P-2 hotfix (2026-05-24): bumped MENU_H from 480 →
  // 600 because user reported菜单底部(衣柜以下)被截断无法选择/滚动。
  // Rust-side `desktop_pet_window_resize_for_popup` keeps the window
  // on-screen, so a taller popup is safe.
  const MENU_W = 320;
  const MENU_H = 600;
  const handleContextMenu = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Sprint v0.3.4: second right-click while menu is open toggles
    // it shut. Without this, you'd be stuck in a cycle of opening
    // the menu at new positions if your first click was a missed pick.
    if (menu.visible) {
      setMenu(HIDDEN_MENU);
      const anchor = menuAnchorRef.current;
      if (anchor) {
        void invokePetWindow("desktop_pet_window_restore_size", {
          anchorX: anchor.x,
          anchorY: anchor.y,
        });
        menuAnchorRef.current = null;
      }
      return;
    }
    // Hotfix #12 (2026-05-25): for the fullscreen-overlay architecture
    // the right-click position is already screen-relative (the window
    // covers the whole monitor) and the menu uses position: fixed with
    // maxHeight: calc(100vh - 24px), so we don't need the resize_for_popup
    // dance that the small-window era required. Just anchor the menu
    // near the cursor with margin to keep it on-screen.
    const cursorX = e.clientX;
    const cursorY = e.clientY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuX = Math.min(Math.max(cursorX, 8), vw - MENU_W - 8);
    const menuY = Math.min(Math.max(cursorY, 8), vh - 8 - MENU_H);
    // Snapshot the current pet position so we can restore the window
    // back to it (and only it) after the menu closes (no-op in
    // fullscreen-overlay mode but harmless).
    menuAnchorRef.current = { x: positionRef.current.x, y: positionRef.current.y };
    // Best-effort resize call for legacy small-window builds; ignored
    // when the window is already fullscreen.
    try {
      await invokePetWindow("desktop_pet_window_resize_for_popup", {
        width: MENU_W,
        height: MENU_H,
      });
    } catch { /* fall through */ }
    setMenu({ visible: true, x: menuX, y: menuY });
  }, [menu.visible, invokePetWindow]);

  // Sprint v0.3.4: also close the menu via Esc, so users have a
  // keyboard escape hatch in case something goes wrong with the
  // backdrop click region.
  useEffect(() => {
    if (!menu.visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(HIDDEN_MENU);
        const anchor = menuAnchorRef.current;
        if (anchor) {
          void invokePetWindow("desktop_pet_window_restore_size", {
            anchorX: anchor.x,
            anchorY: anchor.y,
          });
          menuAnchorRef.current = null;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu.visible, invokePetWindow]);

  const closeMenu = useCallback(() => {
    setMenu(HIDDEN_MENU);
    // Sprint v0.3.3: restore the Tauri window back to its default
    // 200×240 so the pet returns to a small rectangle on screen.
    const anchor = menuAnchorRef.current;
    if (anchor) {
      void invokePetWindow("desktop_pet_window_restore_size", {
        anchorX: anchor.x,
        anchorY: anchor.y,
      });
      menuAnchorRef.current = null;
    }
  }, [invokePetWindow]);

  const onMenuPick = useCallback(
    async (id: string) => {
      closeMenu();
      // Helper: fire an event on main + chat-panel after opening the
      // panel. JS dispatchEvent only reaches our own webview, so for
      // anything that needs to drive ChatPanel logic we go through
      // the Rust relay command.
      const relay = (eventName: string) =>
        invokePetWindow("desktop_pet_relay_event", { eventName });
      switch (id) {
        case "open-pro":
          await invokePetWindow("desktop_bridge_open_chat_panel");
          void relay("agentrix:open-pro-mode");
          break;
        case "voice":
          // Sprint v0.3.6: instead of relying on timing-fragile event
          // dispatch (the 250 ms delay raced with VoiceButton mount),
          // set a localStorage flag that ChatPanel checks on mount.
          // This survives ChatPanel reloading and is dispatch-order
          // independent.
          try {
            window.localStorage.setItem("agentrix_pending_voice_start", String(Date.now()));
          } catch { /* localStorage unavailable */ }
          await invokePetWindow("desktop_bridge_open_chat_panel");
          // Also relay the event in case ChatPanel was already mounted.
          void relay("agentrix:voice-start");
          void triggerPetInteraction("hover_long");
          break;
        case "approvals":
          await invokePetWindow("desktop_bridge_open_chat_panel");
          void relay("agentrix:open-approvals");
          break;
        case "new-chat":
          await invokePetWindow("desktop_bridge_open_chat_panel");
          void relay("agentrix:new-chat");
          break;
        case "wardrobe":
          // Open the existing V4 wardrobe panel (skin marketplace).
          await invokePetWindow("desktop_bridge_open_chat_panel");
          void relay("agentrix:open-wardrobe");
          break;
        case "variant":
          // Sprint P-7: open the variant picker (clan / skin folder /
          // festival sprite override). Differs from "wardrobe" which
          // is the marketplace skin store.
          await invokePetWindow("desktop_bridge_open_chat_panel");
          void relay("agentrix:open-pet-variant");
          break;
        case "pet-growth":
          await invokePetWindow("desktop_bridge_open_chat_panel");
          void relay("agentrix:open-pet-growth");
          break;
        case "world-creator":
          // AI World Creation (v6) Tier_C creator — open the chat-panel window
          // then relay; ChatPanelAxpHost opens Creator Studio on the World tab.
          await invokePetWindow("desktop_bridge_open_chat_panel");
          void relay("agentrix:open-world-creator");
          break;
        case "agent-ops":
          // 打开聊天面板窗口后，relay agent-ops 事件；ChatPanelAxpHost 监听
          // agentrix:open-agent-ops 并渲染 <AgentOpsPanel/>。镜像 world-creator。
          await invokePetWindow("desktop_bridge_open_chat_panel");
          void relay("agentrix:open-agent-ops");
          break;
        case "open-in-ide":
          // Sprint Post-launch P-3 (2026-05-24) — IdeBridge entry from
          // the floating-ball menu. Opens the current workspace in the
          // user's preferred external IDE (Cursor / VS Code). The
          // preferred target is persisted in localStorage by
          // OpenInIdeButton; default = "cursor" if unset.
          try {
            const target = (typeof localStorage !== "undefined"
              && localStorage.getItem("agentrix_ide_target") === "vscode")
              ? "vscode"
              : "cursor";
            const { openInIde } = await import("../services/ideBridge");
            // Empty path = open the workspace root.
            await openInIde({ path: ".", editor: target });
          } catch (err) {
            console.warn("openInIde failed:", err);
          }
          break;
        case "settings":
          await invokePetWindow("desktop_bridge_open_chat_panel");
          void relay("agentrix:open-settings");
          break;
        case "soul":
          await invokePetWindow("desktop_bridge_open_chat_panel");
          void relay("agentrix:open-soul-picker");
          break;
        case "feed":
          // Phase B: feed action — trigger eat animation + +1 intimacy
          setEating(true);
          void triggerPetInteraction("double_click"); // earns 5 XP server-side
          setTimeout(() => setEating(false), 2400);
          break;
        case "sleep":
          setState("sleep");
          await invokePetWindow("desktop_pet_window_set_state", { state: "sleep" });
          break;
        case "hide":
          localStorage.setItem("agentrix_pet_window_hidden", "1");
          await invokePetWindow("desktop_pet_window_minimize_to_tray");
          setDocked(true);
          break;
        case "close":
          localStorage.setItem("agentrix_pet_window_hidden", "1");
          await invokePetWindow("desktop_pet_window_close");
          break;
      }
    },
    [closeMenu, invokePetWindow],
  );

  // (Sprint P-1.1: menu open-edge passthrough force-flip is now handled
  // alongside the cursor proximity loop above.)

  // Re-emit state when local state changes (already done inline above for
  // wander/idle; this keeps right-click sleep/hide in sync too).
  useEffect(() => {
    void invokePetWindow("desktop_pet_window_set_state", { state });
  }, [state, invokePetWindow]);

  // The outer container fills the entire pet window (which itself is a
  // fullscreen transparent overlay). It does NOT capture pointer events —
  // global.css sets `pointer-events: none` on this layer so clicks pass
  // straight through to whatever's behind. The inner hitbox div re-enables
  // pointer events around the visible pet sprite.
  void renderTick; // re-render dependency, no-op
  // v0.3.2 (2026-05-21): the Tauri window itself is small (WIN_W × WIN_H)
  // and follows the pet around the screen, so the sprite sits at a
  // FIXED offset inside this window. Wander engine moves the OS window,
  // not the CSS layer.
  const containerStyle: CSSProperties = {
    position: "fixed",
    left: 0,
    top: 0,
    width: "100vw",
    height: "100vh",
    background: "transparent",
    pointerEvents: "auto",
    overflow: "visible",
  };
  const hitboxStyle: CSSProperties = {
    position: "absolute",
    // v0.6.4: fullscreen overlay mode - sprite position = positionRef
    // (CSS-driven, not Tauri-driven). Wander engine updates positionRef,
    // we re-render with the new left/top.
    left: docked ? 8 : positionRef.current.x,
    top: docked ? 8 : positionRef.current.y,
    width: docked ? 48 : PET_W_NUM,
    height: docked ? 48 : PET_H_NUM,
    background: "transparent",
    cursor: docked ? "pointer" : "grab",
    userSelect: "none",
    overflow: "visible",
    pointerEvents: "auto",
    // P-7+ fly-out: when Pro Mode opens, the sprite briefly translates
    // toward the top-left and shrinks to scale(0.4), echoing the
    // PetAvatar's fly-IN from translate(120%,80%) scale(0.4). Both
    // animations are 480ms cubic-bezier(0.34, 1.56, 0.64, 1).
    transition: "transform 480ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 480ms ease",
    transform: flyingOut
      ? `translate(${-positionRef.current.x + 32}px, ${-positionRef.current.y + 32}px) scale(0.3) rotate(-12deg)`
      : "none",
    opacity: flyingOut ? 0 : 1,
  };

  // The pet sprite renders directly with its RGBA alpha channel.
  const petBgStyle: CSSProperties = {
    width: docked ? 32 : 150,
    height: docked ? 32 : 150,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "5px auto 0",
    background: "transparent",
  };

  return (
    <div style={containerStyle} data-pet-overlay="1">
      {/* Sprint Pre-launch P-4 (2026-05-23) — cross-tool context bar.
          Sits a few pixels above the pet sprite, only visible when the
          user has been on something else recently (the underlying watcher
          ignores Agentrix-self windows). Compact mode for the overlay. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: -34,
          transform: "translateX(-50%)",
          zIndex: 5,
          pointerEvents: "auto",
        }}
      >
        <CrossToolContextBar compact />
      </div>
      <div
        style={hitboxStyle}
        data-pet-hitbox="1"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={handleContextMenu}
        data-pet-state={state}
        data-pet-docked={docked ? "1" : "0"}
      >
      <div
        style={{
          width: "100%",
          height: "100%",
          // Walking bob animation overlay — vertical only, no scaleX to avoid
          // conflict with the inner mirror div.
          animation: jumping
            ? "agentrix-pet-jump 0.6s ease-out"
            : state === "wander"
              ? "agentrix-pet-walk 0.5s ease-in-out infinite"
              : idleAction === "stretch"
                ? "agentrix-pet-stretch 1.2s ease-in-out"
                : idleAction === "wiggle"
                  ? "agentrix-pet-wiggle 1.0s ease-in-out"
                  : idleAction === "blink"
                    ? "agentrix-pet-blink 0.4s ease-in-out"
                    : undefined,
        }}
        key={`anim-${jumpKey}`}
      >
        <div style={petBgStyle}>
        {useSprites ? (
          // Sprint P-2 sprite resolver: PetMode bus wins over local state
          // for "AI-driven" form sprites; only when mode=idle do we fall
          // back to the wander engine's local state (walk/sleep/jump/eat).
          // PET_MODE_TO_SPRITE picks the canonical sprite for each mode.
          <PetSpriteCanvas
            action={
              petMode !== "idle"
                ? PET_MODE_TO_SPRITE[petMode]
                : (
                    eating ? "eat" :
                    state === "sleep" ? "sleep" :
                    state === "wander" ? "walk" :
                    jumping ? "jump" :
                    "idle"
                  )
            }
            size={docked ? 32 : 150}
            facing={facing}
          />
        ) : (
          // Phase A fallback: single-frame PetCanvas with CSS animations
          <div
            style={{
              width: "100%",
              height: "100%",
              transform: facing === "left" ? "scaleX(-1)" : "scaleX(1)",
              transformOrigin: "50% 50%",
              transition: "transform 0.3s ease",
            }}
          >
            <PetCanvas size={docked ? 32 : 150} noHalo showLevelBadge={false} />
          </div>
        )}
        </div>
      </div>
      {/* Sleep Zzz bubble — shown when pet is sleeping */}
      {state === "sleep" && !docked && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 12,
            fontSize: 18,
            color: "var(--text-muted)",
            animation: "agentrix-pet-zzz 2s ease-in-out infinite",
            pointerEvents: "none",
            textShadow: "0 1px 2px rgba(0,0,0,0.3)",
          }}
        >
          💤
        </div>
      )}
      {/* Phase B: food emoji shown when eating */}
      {eating && !docked && (
        <div
          style={{
            position: "absolute",
            bottom: 30,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 22,
            animation: "agentrix-pet-food-bite 0.6s ease-in-out infinite",
            pointerEvents: "none",
            textShadow: "0 2px 4px rgba(0,0,0,0.4)",
          }}
        >
          🍖
        </div>
      )}
      <style>{`
        @keyframes agentrix-pet-walk {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes agentrix-pet-stretch {
          0%, 100% { transform: scaleY(1) translateY(0); }
          30% { transform: scaleY(1.08) translateY(-4px); }
          60% { transform: scaleY(0.95) translateY(2px); }
        }
        @keyframes agentrix-pet-wiggle {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-4deg); }
          75% { transform: rotate(4deg); }
        }
        @keyframes agentrix-pet-blink {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(0.92); }
        }
        @keyframes agentrix-pet-zzz {
          0% { opacity: 0.4; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-6px); }
          100% { opacity: 0.4; transform: translateY(-12px); }
        }
        @keyframes agentrix-pet-jump {
          0% { transform: translateY(0) scale(1, 1); }
          20% { transform: translateY(0) scale(1.1, 0.9); }
          50% { transform: translateY(-25px) scale(0.95, 1.05); }
          80% { transform: translateY(0) scale(1.05, 0.95); }
          100% { transform: translateY(0) scale(1, 1); }
        }
        @keyframes agentrix-pet-food-bite {
          0%, 100% { transform: translateX(-50%) scale(1); }
          50% { transform: translateX(-50%) scale(0.85) rotate(-5deg); }
        }
        @keyframes pulse-ring {
          0%   { opacity: 0.9; transform: scale(0.92); }
          50%  { opacity: 0.7; transform: scale(1.04); }
          100% { opacity: 0;   transform: scale(1.10); }
        }
      `}</style>
      {!docked && <PetProactiveBubble />}
      {/* Multi-Agent v1 W4.3 — sub-task event pulse ring.
          Green = succeeded, red = failed, amber = stalled. Auto-clears
          1-1.5 s. Positioned around the pet sprite,non-interactive. */}
      {!docked && subTaskPulse && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: positionRef.current.x - 8,
            top: positionRef.current.y - 8,
            width: PET_W_NUM + 16,
            height: PET_H_NUM + 16,
            borderRadius: 16,
            border:
              subTaskPulse === "green"
                ? "3px solid #4ade80"
                : subTaskPulse === "red"
                  ? "3px solid #f87171"
                  : "3px solid #fbbf24",
            boxShadow:
              subTaskPulse === "green"
                ? "0 0 24px rgba(74, 222, 128, 0.6)"
                : subTaskPulse === "red"
                  ? "0 0 24px rgba(248, 113, 113, 0.6)"
                  : "0 0 24px rgba(251, 191, 36, 0.6)",
            animation: "pulse-ring 1s ease-out forwards",
            pointerEvents: "none",
            zIndex: 9,
          }}
        />
      )}
      {/* Multi-Agent v1 W1 (R5.1): Simple Mode team-activity badge.
          Renders a small pulsing pill above the pet sprite when in
          Simple Mode AND there are active sub-tasks. Click to open
          TeamActivitySurface (handled by parent — App.tsx listens for
          `agentrix:open-team-activity-surface`). */}
      {!docked && showTeamBadge && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            try {
              // Multi-Agent v1 W4.7 — if there are unacknowledged sub-task
              // completions, dispatch the "open chat with summary" event
              // so ChatPanelImpl can inject an aggregated Leader message.
              // Falls back to the team-activity surface (W1) if nothing
              // is unacked yet.
              if (unackedCompletionsRef.current.length > 0) {
                window.dispatchEvent(
                  new CustomEvent("agentrix:open-chat-with-summary", {
                    detail: { taskIds: [...unackedCompletionsRef.current] },
                  }),
                );
                unackedCompletionsRef.current = [];
              } else {
                window.dispatchEvent(new CustomEvent("agentrix:open-team-activity-surface"));
              }
            } catch {
              /* SSR */
            }
          }}
          aria-label={`${teamActiveCount} sub-tasks running`}
          style={{
            position: "absolute",
            left: positionRef.current.x + PET_W_NUM - 12,
            top: positionRef.current.y - 4,
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--accent)",
            color: "var(--text-on-accent)",
            border: "2px solid var(--bg-app)",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "var(--shadow)",
            animation: "ripple 1.6s ease-out infinite",
            zIndex: 10,
            pointerEvents: "auto",
          }}
        >
          {teamActiveCount > 9 ? "9+" : teamActiveCount}
        </button>
      )}
      {/*
        Sprint v0.3.4: backdrop FIRST in JSX so the menu div is mounted
        AFTER it — natural DOM stacking puts menu above without relying
        on z-index alone. backdrop catches clicks (and right-clicks)
        outside the menu and closes it.
      */}
      {menu.visible && (
        <div
          onClick={closeMenu}
          onContextMenu={(e) => {
            e.preventDefault();
            closeMenu();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "transparent",
            pointerEvents: "auto",
            zIndex: 9998,
          }}
        />
      )}
      {menu.visible && (
        <div
          role="menu"
          data-keep-dark="1"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: menu.x,
            top: menu.y,
            // Sprint Pre-launch P-2 hotfix (2026-05-24): cap height to
            // viewport - 24 so menu always fits the (now 600px tall)
            // popup window even on smaller scaled displays. Wheel
            // scrolling kicks in if items still overflow.
            maxHeight: "calc(100vh - 24px)",
            overflowY: "auto",
            overscrollBehavior: "contain",
            width: 296,
            background: "var(--bg-elevated)",
            color: "#fff",
            borderRadius: 8,
            boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
            padding: 4,
            fontSize: 13,
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.08)",
            zIndex: 9999,
            pointerEvents: "auto",
          }}
        >
          <MenuItem label="💬 打开 Pro Mode" onClick={() => onMenuPick("open-pro")} />
          <MenuItem label="🎙️ 语音对话" onClick={() => onMenuPick("voice")} />
          <MenuItem label="🆕 新对话" onClick={() => onMenuPick("new-chat")} />
          <MenuItem label="✅ 待审批操作" onClick={() => onMenuPick("approvals")} />
          <div style={{ height: 1, background: "var(--bg-overlay-medium)", margin: "4px 0" }} />
          <MenuItem label="🍖 喂食 (+1 亲密度)" onClick={() => onMenuPick("feed")} />
          <MenuItem label="🐾 我的萌宠 (衣柜)" onClick={() => onMenuPick("wardrobe")} />
          <MenuItem label="👗 形态/装扮选择" onClick={() => onMenuPick("variant")} />
          <MenuItem label="📊 成长 / 成就 / 相册" onClick={() => onMenuPick("pet-growth")} />
          <MenuItem label="✨ 选择灵魂" onClick={() => onMenuPick("soul")} />
          <div style={{ height: 1, background: "var(--bg-overlay-medium)", margin: "4px 0" }} />
          {/* Sprint Post-launch P-3 (2026-05-24) — IdeBridge entry. Opens
              the workspace in Cursor / VS Code via openInIde. Target is
              persisted in localStorage by OpenInIdeButton. */}
          <MenuItem label="🔗 在 IDE 打开 (Cursor / VS Code)" onClick={() => onMenuPick("open-in-ide")} />
          <MenuItem label="🌐 World 创作器 (Tier_C)" onClick={() => onMenuPick("world-creator")} />
          <MenuItem label="🛠 Agent Ops" onClick={() => onMenuPick("agent-ops")} />
          <MenuItem label="⚙️ 设置" onClick={() => onMenuPick("settings")} />
          <div style={{ height: 1, background: "var(--bg-overlay-medium)", margin: "4px 0" }} />
          <MenuItem label="😴 进入睡眠" onClick={() => onMenuPick("sleep")} />
          <MenuItem label="🔽 隐藏到任务栏" onClick={() => onMenuPick("hide")} />
          <MenuItem label="❌ 关闭桌宠" onClick={() => onMenuPick("close")} danger />
        </div>
      )}
      </div>
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  // Sprint P-7 round 7 (2026-05-22): pet menu text was showing
  // "emoji visible, label invisible" on light theme even after rounds
  // 5/6 thanks to some layered CSS rule still bleeding through. We
  // now force the text fill in three independent ways to make this
  // bulletproof:
  //   1. Inline `color` (default).
  //   2. Inline `WebkitTextFillColor` — non-standard, but no rule in
  //      our codebase tries to override it, so it always wins.
  //   3. `data-keep-dark="1"` data attribute so any `:not([data-keep-dark])`
  //      cascade rule we author is opt-out by default.
  const fg = danger ? "#ff6b6b" : "#ffffff";
  return (
    <div
      role="menuitem"
      data-keep-dark="1"
      data-danger={danger ? "1" : undefined}
      className="pet-menu-item"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        cursor: "pointer",
        borderRadius: 4,
        color: fg,
        WebkitTextFillColor: fg,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--bg-overlay-light)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <span
        data-keep-dark="1"
        style={{ color: fg, WebkitTextFillColor: fg }}
      >
        {label}
      </span>
    </div>
  );
}
