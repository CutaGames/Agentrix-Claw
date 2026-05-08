/**
 * PetCompanionWindow — Phase 6 S1 host component for the always-on-top
 * "living pet" Tauri window (`pet-companion`).
 *
 * Responsibilities
 * ----------------
 * 1. Render the active pet (VRM / Rive / fallback) on a transparent canvas.
 * 2. Drive autonomous wandering via `services/petCompanion`.
 * 3. Translate user input into pet interactions:
 *      - single click   → voice activate
 *      - double-click   → open chat-panel
 *      - long-press     → push-to-talk
 *      - right-click    → context menu (soul / wardrobe / sleep / hide)
 *      - drag           → free positioning + taskbar-corner snap-hide
 *
 * Window geometry (size, position, taskbar dock) is delegated to the Rust
 * side via `desktop_pet_window_*` invokes. This file owns *behaviour*; the
 * Rust module owns *windowing*.
 */
import { useEffect, useRef, useState, useCallback, type CSSProperties } from "react";
import PetRenderer from "./PetRenderer";
import PetProactiveBubble from "./PetProactiveBubble";
import {
  PathPlayer,
  buildSegment,
  clampToBounds,
  pickRandomTarget,
  speedForEmotion,
  type CompanionBounds,
  type CompanionPosition,
  type CompanionState,
} from "../services/petCompanion";
import { getLastPetState, triggerPetInteraction } from "../services/petSdk";

const WANDER_FRAME_MS = 32;
const IDLE_BETWEEN_WANDERS_MS_MIN = 3000;
const IDLE_BETWEEN_WANDERS_MS_MAX = 6000;
const LONG_PRESS_MS = 350;
const DRAG_THRESHOLD_PX = 5;
const TASKBAR_SNAP_THRESHOLD_PX = 64;

interface CtxMenuState {
  visible: boolean;
  x: number;
  y: number;
}

const HIDDEN_MENU: CtxMenuState = { visible: false, x: 0, y: 0 };

export default function PetCompanionWindow() {
  const [bounds, setBounds] = useState<CompanionBounds | null>(null);
  const [state, setState] = useState<CompanionState>("idle");
  const [menu, setMenu] = useState<CtxMenuState>(HIDDEN_MENU);
  const [docked, setDocked] = useState(false);

  const positionRef = useRef<CompanionPosition>({ x: 0, y: 0 });
  const playerRef = useRef(new PathPlayer());
  const lastFrameTsRef = useRef<number>(performance.now());
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

  // Boot: load monitor bounds from Rust.
  useEffect(() => {
    let cancelled = false;
    invokePetWindow<CompanionBounds & { taskbar_inset_px?: number }>(
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
      // Seed position to current window (approximate from spawn point).
      positionRef.current = clampToBounds(
        { x: normalized.x + normalized.width - 220, y: normalized.y + normalized.height - 320 },
        normalized,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [invokePetWindow]);

  // Wander loop — runs only when not docked / dragging.
  useEffect(() => {
    if (!bounds) return;
    if (docked) return;
    let raf = 0;
    let scheduleTimer: number | null = null;

    const scheduleNextSegment = () => {
      const delay =
        IDLE_BETWEEN_WANDERS_MS_MIN +
        Math.random() * (IDLE_BETWEEN_WANDERS_MS_MAX - IDLE_BETWEEN_WANDERS_MS_MIN);
      scheduleTimer = window.setTimeout(() => {
        if (draggingRef.current || docked) return;
        const target = pickRandomTarget(bounds, positionRef.current);
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
          positionRef.current = sample.position;
          void invokePetWindow("desktop_pet_window_move_to", {
            x: Math.round(sample.position.x),
            y: Math.round(sample.position.y),
          });
          if (sample.done) {
            setState("idle");
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
    // WANDER_FRAME_MS is referenced for documentation; the actual cadence
    // is RAF-driven (~16 ms) so we don't need it as a dep.
    void WANDER_FRAME_MS;
  }, [bounds, docked, invokePetWindow]);

  // ── Input handlers ────────────────────────────────────────────────
  const dispatchVoice = useCallback(() => {
    void triggerPetInteraction("voice_greet");
    window.dispatchEvent(new CustomEvent("agentrix:voice-activate"));
  }, []);

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
      void invokePetWindow("desktop_pet_window_move_to", { x: newX, y: newY });
    },
    [invokePetWindow],
  );

  const handlePointerUp = useCallback(
    async (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = draggingRef.current;
      draggingRef.current = null;
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
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
            await invokePetWindow("desktop_pet_window_move_to", {
              x: Math.round(clamped.x),
              y: Math.round(clamped.y),
            });
          }
        }
        return;
      }

      // Click — handle single vs. double via small debounce.
      if (docked) {
        await invokePetWindow("desktop_pet_window_restore");
        setDocked(false);
        setState("idle");
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
    [bounds, docked, dispatchVoice, openChatPanel, invokePetWindow],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setMenu({ visible: true, x: e.clientX, y: e.clientY });
  }, []);

  const closeMenu = useCallback(() => setMenu(HIDDEN_MENU), []);

  const onMenuPick = useCallback(
    async (id: string) => {
      closeMenu();
      switch (id) {
        case "soul":
          await invokePetWindow("desktop_bridge_open_chat_panel");
          window.dispatchEvent(new CustomEvent("agentrix:open-soul-picker"));
          break;
        case "wardrobe":
          await invokePetWindow("desktop_bridge_open_chat_panel");
          window.dispatchEvent(new CustomEvent("agentrix:open-wardrobe"));
          break;
        case "sleep":
          setState("sleep");
          await invokePetWindow("desktop_pet_window_set_state", { state: "sleep" });
          break;
        case "hide":
          await invokePetWindow("desktop_pet_window_minimize_to_tray");
          setDocked(true);
          break;
        case "close":
          await invokePetWindow("desktop_pet_window_close");
          break;
      }
    },
    [closeMenu, invokePetWindow],
  );

  // Re-emit state when local state changes (already done inline above for
  // wander/idle; this keeps right-click sleep/hide in sync too).
  useEffect(() => {
    void invokePetWindow("desktop_pet_window_set_state", { state });
  }, [state, invokePetWindow]);

  const containerStyle: CSSProperties = {
    width: docked ? 32 : 180,
    height: docked ? 32 : 220,
    background: "transparent",
    cursor: docked ? "pointer" : "grab",
    userSelect: "none",
    overflow: "hidden",
    position: "fixed",
    left: 0,
    top: 0,
  };

  return (
    <div
      style={containerStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={handleContextMenu}
      data-pet-state={state}
      data-pet-docked={docked ? "1" : "0"}
    >
      <PetRenderer size={docked ? 32 : 160} />
      {!docked && <PetProactiveBubble />}
      {menu.visible && (
        <div
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: menu.x,
            top: menu.y,
            background: "rgba(20,20,28,0.96)",
            color: "#fff",
            borderRadius: 8,
            boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
            padding: 4,
            fontSize: 13,
            minWidth: 140,
            backdropFilter: "blur(8px)",
            zIndex: 9999,
          }}
        >
          <MenuItem label="选择灵魂" onClick={() => onMenuPick("soul")} />
          <MenuItem label="衣柜" onClick={() => onMenuPick("wardrobe")} />
          <MenuItem label="进入睡眠" onClick={() => onMenuPick("sleep")} />
          <MenuItem label="隐藏到任务栏" onClick={() => onMenuPick("hide")} />
          <MenuItem label="关闭桌宠" onClick={() => onMenuPick("close")} danger />
        </div>
      )}
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
            zIndex: 9998,
            background: "transparent",
          }}
        />
      )}
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
  return (
    <div
      role="menuitem"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        cursor: "pointer",
        borderRadius: 4,
        color: danger ? "#ff6b6b" : "#fff",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {label}
    </div>
  );
}
