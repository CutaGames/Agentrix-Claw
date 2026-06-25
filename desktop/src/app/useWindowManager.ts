// Sprint Pre-launch P-1 (2026-05-23) — App.tsx decomposition: WindowManager.
//
// Extracted from App.tsx the cluster of window-lifecycle responsibilities:
//
//   - hideMainWindow / showMainWindow helpers
//   - openCompactPanel / openProPanel / openSpotlightOrPanel / triggerVoiceFlow
//   - resizeMainWindow on (panelOpen, panelMode, login, onboarded)
//   - panelOpen-state machinery + auto-open after onboarding
//   - 15 min idle compact fallback
//   - global keyboard shortcuts (in-webview + Tauri global shortcuts)
//   - app-mode broadcast (living-agent / pro-mode / economy-panel)
//
// The hook returns the values App.tsx needs to render the correct view
// (panelOpen / panelMode / openProPanel) plus the helpers Spotlight/voice
// dispatchers consume. App.tsx becomes a near-pure view-routing component.

import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "../services/analytics";

interface UseWindowManagerArgs {
  windowLabel: string;
  loggedIn: boolean;
  onboarded: boolean;
}

interface WindowManagerApi {
  panelOpen: boolean;
  panelMode: "compact" | "pro";
  setPanelOpen: (value: boolean) => void;
  setPanelMode: (mode: "compact" | "pro") => void;
  openCompactPanel: () => void;
  openProPanel: () => void;
  openSpotlightOrPanel: () => Promise<void>;
  triggerVoiceFlow: () => Promise<void>;
  hideMainWindow: () => Promise<void>;
  showMainWindow: () => Promise<void>;
}

export function useWindowManager({
  windowLabel,
  loggedIn,
  onboarded,
}: UseWindowManagerArgs): WindowManagerApi {
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<"compact" | "pro">("compact");

  const hideMainWindow = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().hide();
    } catch (err) {
      console.warn("[WindowManager] hideMainWindow failed", err);
    }
  }, []);

  const showMainWindow = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      await win.show();
      await win.setFocus();
    } catch (err) {
      console.warn("[WindowManager] showMainWindow failed", err);
    }
  }, []);

  const openCompactPanel = useCallback(() => {
    // Sprint P-1: compact panel collapsed into Pro Mode (the only chat
    // surface). Voice/spotlight callers still call this entry point to
    // pop a visible chat window.
    setPanelMode("pro");
    setPanelOpen(true);
    void showMainWindow();
  }, [showMainWindow]);

  const openProPanel = useCallback(() => {
    setPanelMode("pro");
    setPanelOpen(true);
  }, []);

  const openSpotlightOrPanel = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_bridge_open_spotlight");
    } catch {
      openProPanel();
    }
  }, [openProPanel]);

  const triggerVoiceFlow = useCallback(async () => {
    if (windowLabel === "chat-panel") {
      window.dispatchEvent(new CustomEvent("agentrix:voice-start"));
      return;
    }
    if (windowLabel === "floating-ball") {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("desktop_bridge_open_chat_panel");
      } catch {}
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("agentrix:voice-start"));
      }, 250);
      return;
    }
    openCompactPanel();
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("agentrix:voice-start"));
    }, 250);
  }, [openCompactPanel, windowLabel]);

  // Hook into global open-pane request from anywhere in the app.
  useEffect(() => {
    window.addEventListener("agentrix:open-panel-pro", openProPanel);
    return () => window.removeEventListener("agentrix:open-panel-pro", openProPanel);
  }, [openProPanel]);

  useEffect(() => {
    const handleVoiceActivate = () => {
      void triggerVoiceFlow();
    };
    window.addEventListener("agentrix:voice-activate", handleVoiceActivate);
    return () => window.removeEventListener("agentrix:voice-activate", handleVoiceActivate);
  }, [triggerVoiceFlow]);

  // Track whether the panel was ever opened — used to gate the auto-hide
  // effect so we don't hide on initial mount.
  const hasOpenedPanelRef = useRef(false);
  useEffect(() => {
    if (panelOpen) hasOpenedPanelRef.current = true;
  }, [panelOpen]);

  // Resize main window when relevant state changes.
  const resizeMainWindow = useCallback(async (width: number, height: number) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_bridge_resize_ball_window", { width, height });
    } catch {}
  }, []);

  useEffect(() => {
    if (windowLabel !== "main" && windowLabel !== "dev") return;
    const ready = loggedIn && onboarded;
    if (!ready) {
      // First-run / login / onboarding: keep big enough for forms.
      resizeMainWindow(480, 640);
      return;
    }
    if (panelOpen && panelMode === "pro") {
      resizeMainWindow(1100, 820);
    } else if (panelOpen) {
      resizeMainWindow(560, 720);
    } else {
      // Window dismissed via close button — auto-hide, but only if it was
      // previously open (initial render's panelOpen=false should NOT hide).
      if (hasOpenedPanelRef.current) {
        void hideMainWindow();
      }
    }
  }, [
    panelMode,
    panelOpen,
    windowLabel,
    resizeMainWindow,
    loggedIn,
    onboarded,
    hideMainWindow,
  ]);

  // Broadcast the current app mode so PetCanvas (floating ball / pro panel)
  // can swap living-agent / pro-mode / economy-panel pet variants.
  useEffect(() => {
    const mode = panelOpen && panelMode === "pro" ? "pro-mode" : "living-agent";
    window.dispatchEvent(new CustomEvent("agentrix:app-mode-changed", { detail: { mode } }));
    trackEvent("desktop_form_switch", {
      to: mode,
      open: panelOpen ? 1 : 0,
    });
  }, [panelMode, panelOpen]);

  // Sprint v0.3.7: auto-open Pro Mode on launch (already-onboarded users).
  // Without this, the main window sits empty after the floating ball was
  // retired in Sprint P-1.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!loggedIn || !onboarded) return;
    if (windowLabel !== "main" && windowLabel !== "dev") return;
    if (panelOpen) {
      autoOpenedRef.current = true;
      return;
    }
    autoOpenedRef.current = true;
    openProPanel();
    void showMainWindow();
  }, [loggedIn, onboarded, panelOpen, windowLabel, openProPanel, showMainWindow]);

  // P3 双形态互斥 + 15min 空闲自动回 Living (compact).
  useEffect(() => {
    if (windowLabel !== "main" && windowLabel !== "dev") return;
    if (!panelOpen || panelMode !== "pro") return;
    const IDLE_MS = 15 * 60 * 1000;
    let lastActive = Date.now();
    const reset = () => { lastActive = Date.now(); };
    const events: Array<keyof WindowEventMap> = ["mousemove", "keydown", "mousedown", "wheel", "touchstart"];
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    const interval = window.setInterval(() => {
      if (Date.now() - lastActive >= IDLE_MS) {
        setPanelMode("compact");
        window.dispatchEvent(new CustomEvent("agentrix:form-switched", { detail: { from: "pro", to: "compact", reason: "idle_15min" } }));
      }
    }, 30_000);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, reset));
      window.clearInterval(interval);
    };
  }, [panelMode, panelOpen, windowLabel]);

  // ── In-webview keyboard shortcuts (only when the chat-panel webview is focused) ─
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "S") {
        e.preventDefault();
        if (panelOpen && panelMode === "pro") {
          setPanelOpen(false);
          void hideMainWindow();
        } else {
          openProPanel();
          void showMainWindow();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        void openSpotlightOrPanel();
      }
      if (e.key === "Escape" && panelOpen) {
        setPanelOpen(false);
        void hideMainWindow();
      }
      if (e.ctrlKey && e.key === "n" && panelOpen) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("agentrix:new-chat"));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openProPanel, openSpotlightOrPanel, panelMode, panelOpen, hideMainWindow, showMainWindow]);

  // ── OS-level global shortcuts (Tauri plugin) ─────────────────────────
  useEffect(() => {
    if (windowLabel === "floating-ball") return;
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const { register, unregisterAll } = await import("@tauri-apps/plugin-global-shortcut");
        await register("CmdOrCtrl+Shift+A", (event) => {
          if (event.state === "Pressed") {
            openCompactPanel();
            window.dispatchEvent(new CustomEvent("agentrix:voice-start"));
          } else if (event.state === "Released") {
            window.dispatchEvent(new CustomEvent("agentrix:voice-stop"));
          }
        });
        await register("CmdOrCtrl+Shift+S", (event) => {
          if (event.state === "Pressed") {
            if (panelOpen && panelMode === "pro") {
              setPanelOpen(false);
              void hideMainWindow();
            } else {
              openProPanel();
              void showMainWindow();
            }
          }
        });
        await register("CmdOrCtrl+K", (event) => {
          if (event.state === "Pressed") {
            void openSpotlightOrPanel();
          }
        });
        await register("CmdOrCtrl+Space", (event) => {
          if (event.state === "Pressed") {
            if (panelOpen && panelMode === "compact") {
              setPanelOpen(false);
            } else {
              openCompactPanel();
              window.dispatchEvent(new CustomEvent("agentrix:form-switched", {
                detail: { form: "living", source: "shortcut" },
              }));
            }
          }
        });
        await register("CmdOrCtrl+Shift+Space", (event) => {
          if (event.state === "Pressed") {
            if (panelOpen && panelMode === "pro") {
              setPanelOpen(false);
            } else {
              openProPanel();
              window.dispatchEvent(new CustomEvent("agentrix:form-switched", {
                detail: { form: "pro", source: "shortcut" },
              }));
            }
          }
        });
        cleanup = () => {
          unregisterAll();
        };
      } catch {
        /* not in Tauri (dev browser) */
      }
    })();
    return () => cleanup?.();
  }, [openCompactPanel, openProPanel, openSpotlightOrPanel, panelMode, panelOpen, hideMainWindow, showMainWindow, windowLabel]);

  return {
    panelOpen,
    panelMode,
    setPanelOpen,
    setPanelMode,
    openCompactPanel,
    openProPanel,
    openSpotlightOrPanel,
    triggerVoiceFlow,
    hideMainWindow,
    showMainWindow,
  };
}
