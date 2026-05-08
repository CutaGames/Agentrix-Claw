import { useState, useEffect, useCallback } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { SuspendProvider } from "./components/SuspendContext";
import FloatingBall from "./components/FloatingBall";
import PetEmotionOverlay from "./components/PetEmotionOverlay";
import PetProactiveBubble from "./components/PetProactiveBubble";
import ChatPanel from "./components/ChatPanel";
import LoginPanel from "./components/LoginPanel";
import PlanTimeline from "./components/PlanTimeline";
import OnboardingPanel from "./components/OnboardingPanel";
import SpotlightPanel from "./components/SpotlightPanel";
import PetCompanionWindow from "./components/PetCompanionWindow";
import agentrixLogo from "./assets/agentrix-logo.png";
import { useAuthStore } from "./services/store";
import { initSessionSync, destroySessionSync } from "./services/sessionSync";
import { initPresenceSocket, destroyPresenceSocket } from "./services/agentPresence";
import { startDesktopAgentSync, stopDesktopAgentSync } from "./services/desktopAgentSync";
import { startClipboardWatch, stopClipboardWatch } from "./services/clipboard";
import { initAnalytics, destroyAnalytics, trackEvent } from "./services/analytics";
import { addNotification } from "./services/notifications";
import { startNetworkMonitor, stopNetworkMonitor, getNetworkStatus, onNetworkStatusChange, type NetworkStatus } from "./services/network";
import { DesktopWakeWordService } from "./services/wakeWord";
import { DESKTOP_WAKE_WORD_EVENT, readDesktopWakeWordConfig } from "./services/wakeWordConfig";
import { bootPetSdk } from "./services/petSdk";
import { bootPetAssets, destroyPetAssets } from "./services/petAssets";
import { startVisionPerception, stopVisionPerception, isVisionPerceptionEnabled } from "./services/visionPerception";
import "./services/suspend"; // Register __agentrix_suspend / __agentrix_resume on window

// Determine view from Tauri window label without importing @tauri-apps/api/window
// (static import can crash if Tauri internals aren't ready)
function getWindowView(): string {
  try {
    const internals = (window as any).__TAURI_INTERNALS__;
    return internals?.metadata?.currentWindow?.label ?? "dev";
  } catch {
    return "dev";
  }
}

function toApprovalBadgeLevel(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(3, Math.round(value)));
  }

  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "L3") return 3;
  if (normalized === "L2") return 2;
  if (normalized === "L1") return 1;
  return 0;
}

export default function App() {
  const windowLabel = getWindowView();
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<"compact" | "pro">("compact");

  const openCompactPanel = useCallback(() => {
    setPanelMode("compact");
    setPanelOpen(true);
  }, []);

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

  // ── Window resize helper for single-window mode ──
  const resizeMainWindow = useCallback(async (width: number, height: number) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_bridge_resize_ball_window", { width, height });
    } catch {}
  }, []);

  const [onboarded, setOnboarded] = useState(() => localStorage.getItem("agentrix_onboarded") === "1");
  const { token, isGuest, loadToken, enterGuest } = useAuthStore();
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(getNetworkStatus());
  const [wakeWordRevision, setWakeWordRevision] = useState(0);
  const desktopWakeWordConfig = readDesktopWakeWordConfig();

  // When panelOpen changes, resize the main window accordingly.
  // Only shrink to the floating ball once the user is fully ready
  // (logged in + onboarded). Before that, keep the window at compact-panel
  // size so LoginPanel / OnboardingPanel actually fit and are visible.
  useEffect(() => {
    if (windowLabel !== "main" && windowLabel !== "dev") return;
    const ready = (!!token || isGuest) && onboarded;
    if (panelOpen) {
      if (panelMode === "pro") {
        resizeMainWindow(1100, 820);
      } else {
        resizeMainWindow(480, 640);
      }
    } else if (ready) {
      resizeMainWindow(80, 80);
    } else {
      // First-run / not-yet-logged-in: keep the window big enough for the
      // LoginPanel + OnboardingPanel UI; otherwise it would be a 80×80
      // invisible square in the screen corner.
      resizeMainWindow(480, 640);
    }
  }, [panelMode, panelOpen, windowLabel, resizeMainWindow, token, isGuest, onboarded]);

  useEffect(() => {
    loadToken();
    // Periodically refresh instances to pick up model/config changes from mobile
    const refreshInterval = setInterval(() => loadToken(), 30_000);
    // Restore saved theme
    const saved = localStorage.getItem("agentrix_theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    }
    return () => clearInterval(refreshInterval);
  }, [loadToken]);

  // Crash watchdog — surface and clear any crash reports written by the Rust
  // panic_hook (services/lib.rs setup_panic_hook). Runs once on first mount
  // of the service-host window.
  useEffect(() => {
    if (windowLabel !== "main" && windowLabel !== "dev") return;
    let cancelled = false;
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const crashes = (await invoke("desktop_bridge_get_recent_crashes", { maxAgeSeconds: 24 * 3600 })) as
          | Array<{ message?: string; location?: string; stampMs?: number; type?: string }>
          | null;
        if (cancelled || !crashes || crashes.length === 0) return;
        for (const c of crashes.slice(0, 3)) {
          trackEvent("desktop_crash_detected", {
            type: String(c.type || "rust_panic").slice(0, 40),
            message: String(c.message || "unknown").slice(0, 200),
            location: String(c.location || "unknown").slice(0, 200),
            stampMs: typeof c.stampMs === "number" ? c.stampMs : Date.now(),
          });
        }
        const latest = crashes[0];
        addNotification(
          "warning",
          "Agentrix recovered from a crash",
          `${crashes.length} crash report${crashes.length > 1 ? "s" : ""} since last run. Latest: ${String(latest.message || "unknown").slice(0, 120)}`,
        );
        await invoke("desktop_bridge_clear_crash_logs");
      } catch {
        // Tauri not available (browser dev) — ignore.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [windowLabel]);

  useEffect(() => {
    const handleWakeWordConfigChange = () => setWakeWordRevision((prev) => prev + 1);
    window.addEventListener(DESKTOP_WAKE_WORD_EVENT, handleWakeWordConfigChange);
    return () => window.removeEventListener(DESKTOP_WAKE_WORD_EVENT, handleWakeWordConfigChange);
  }, []);

  const loggedIn = !!token || isGuest;
  const isServiceHostWindow = windowLabel === "main" || windowLabel === "dev";

  // Initialize services when logged in
  useEffect(() => {
    if (!loggedIn) return;

    // Network monitor
    startNetworkMonitor();
    const unsub = onNetworkStatusChange(setNetworkStatus);

    // Clipboard watch
    startClipboardWatch();

    // Analytics
    initAnalytics(token);

    // Session sync (needs real token, not guest)
    if (token && isServiceHostWindow) {
      initSessionSync(token, {
        onSessionUpdated: (snapshot) => {
          // Store remote sessions to localStorage so ChatPanel can access them
          localStorage.setItem(
            `chat_session_${snapshot.sessionId}`,
            JSON.stringify(snapshot.messages),
          );
          // Notify ChatPanel that a remote session was updated
          window.dispatchEvent(new CustomEvent("agentrix:session-synced", { detail: snapshot }));
        },
        onConnectionChange: (connected) => {
          window.dispatchEvent(new CustomEvent("agentrix:sync-status", { detail: { connected } }));
        },
      });

      // Agent Presence realtime (cross-device sync via /presence namespace)
      initPresenceSocket(token, {
        onHandoffInitiated: (event) => {
          localStorage.setItem("agentrix_pending_handoff", JSON.stringify(event));
          window.dispatchEvent(new CustomEvent("agentrix:handoff-incoming", { detail: event }));
          if (windowLabel === "main" || windowLabel === "dev") {
            addNotification(
              "sync",
              "Desktop handoff ready",
              "Another device has a task you can continue on desktop.",
              { label: "Open", event: "agentrix:open-panel-pro" },
            );
            return;
          }
          void import("@tauri-apps/api/core").then(({ invoke }) => invoke("desktop_bridge_open_chat_panel")).catch(() => {});
        },
        onTimelineEvent: (event) => {
          window.dispatchEvent(new CustomEvent("agentrix:timeline-event", { detail: event }));
        },
        onApprovalNew: (event) => {
          const eventPayload = event as unknown;
          const approval = (eventPayload && typeof eventPayload === "object" && "approval" in eventPayload)
            ? (eventPayload as { approval?: Record<string, unknown> }).approval
            : eventPayload as Record<string, unknown> | null | undefined;
          window.dispatchEvent(new CustomEvent("agentrix:approval-needed", {
            detail: {
              toolName: String(approval?.title || approval?.kind || "Approval"),
              riskLevel: toApprovalBadgeLevel(approval?.riskLevel),
              reason: String(approval?.description || approval?.title || "High-risk action waiting for review"),
            },
          }));
          window.dispatchEvent(new CustomEvent("agentrix:approval-new", { detail: event }));
        },
        onConnectionChange: (connected) => {
          window.dispatchEvent(new CustomEvent("agentrix:presence-status", { detail: { connected } }));
        },
      });

      startDesktopAgentSync(token);
    }

    trackEvent("session_start");

    // P3-1 partial — Pet SDK boot + opt-in vision perception (default OFF).
    // Live2D runtime ships later via petAssets manifest; fallback renderer
    // (PetCanvas) is always available regardless.
    bootPetSdk();
    bootPetAssets();
    if (isVisionPerceptionEnabled()) {
      startVisionPerception();
    }

    return () => {
      stopNetworkMonitor();
      unsub();
      stopClipboardWatch();
      destroyAnalytics();
      destroySessionSync();
      destroyPresenceSocket();
      stopDesktopAgentSync();
      stopVisionPerception();
      destroyPetAssets();
    };
  }, [isServiceHostWindow, loggedIn, openProPanel, token, windowLabel]);

  // P3 双形态互斥 + 15min 空闲自动回 Living (compact)。
  // Pro mode 是显式生产力形态，长时间无交互应回到悬浮状态减少打扰。
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

  // Global keyboard shortcuts (within webview)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Shift+S → toggle panel
      if (e.ctrlKey && e.shiftKey && e.key === "S") {
        e.preventDefault();
        if (panelOpen && panelMode === "pro") {
          setPanelOpen(false);
        } else {
          openProPanel();
        }
      }
      // Ctrl/Cmd+K → quick command / Spotlight fallback inside the webview
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        void openSpotlightOrPanel();
      }
      // Escape → close panel
      if (e.key === "Escape" && panelOpen) {
        setPanelOpen(false);
      }
      // Ctrl+N → new chat (handled inside ChatPanel too)
      if (e.ctrlKey && e.key === "n" && panelOpen) {
        e.preventDefault();
        // Dispatch new chat event
        window.dispatchEvent(new CustomEvent("agentrix:new-chat"));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openProPanel, openSpotlightOrPanel, panelMode, panelOpen]);

  // Register Tauri global shortcuts (runs once, chat/default only)
  useEffect(() => {
    if (windowLabel === "floating-ball") return;
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const { register, unregisterAll } = await import("@tauri-apps/plugin-global-shortcut");
        // Register Ctrl+Shift+A for voice
        await register("CmdOrCtrl+Shift+A", (event) => {
          if (event.state === "Pressed") {
            openCompactPanel();
            window.dispatchEvent(new CustomEvent("agentrix:voice-start"));
          } else if (event.state === "Released") {
            window.dispatchEvent(new CustomEvent("agentrix:voice-stop"));
          }
        });
        // Register Ctrl+Shift+S for panel toggle
        await register("CmdOrCtrl+Shift+S", (event) => {
          if (event.state === "Pressed") {
            if (panelOpen && panelMode === "pro") {
              setPanelOpen(false);
            } else {
              openProPanel();
            }
          }
        });
        // Register Ctrl/Cmd+K for Spotlight mode
        await register("CmdOrCtrl+K", (event) => {
          if (event.state === "Pressed") {
            void openSpotlightOrPanel();
          }
        });
        // P0-W2-4 Explicit dual-form mutex (PRD desktop-prd-v3 §4.2)
        // CmdOrCtrl+Space → Living Agent (compact) form
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
        // CmdOrCtrl+Shift+Space → Pro Mode form
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
        // Not in Tauri environment (dev mode in browser)
      }
    })();
    return () => cleanup?.();
  }, [openCompactPanel, openProPanel, openSpotlightOrPanel, panelMode, panelOpen]);

  useEffect(() => {
    if (
      windowLabel === "floating-ball" ||
      !loggedIn ||
      !desktopWakeWordConfig.enabled ||
      !desktopWakeWordConfig.accessKey
    ) {
      return;
    }

    let disposed = false;
    let wakeWord: DesktopWakeWordService | null = null;

    const startWakeWord = async () => {
      if (!(await DesktopWakeWordService.isAvailable()) || disposed) {
        return;
      }

      const service = new DesktopWakeWordService();
      wakeWord = service;

      await service.init({
        accessKey: desktopWakeWordConfig.accessKey,
        builtInKeyword: desktopWakeWordConfig.customKeywordPath ? undefined : desktopWakeWordConfig.builtInKeyword,
        customKeywordPath: desktopWakeWordConfig.customKeywordPath || undefined,
        sensitivity: desktopWakeWordConfig.sensitivity,
        onWakeWord: () => {
          if (!disposed) {
            void triggerVoiceFlow();
          }
        },
      });

      if (!disposed) {
        await service.start();
      }
    };

    void startWakeWord();

    return () => {
      disposed = true;
      void wakeWord?.release();
    };
  }, [
    desktopWakeWordConfig.accessKey,
    desktopWakeWordConfig.builtInKeyword,
    desktopWakeWordConfig.customKeywordPath,
    desktopWakeWordConfig.enabled,
    desktopWakeWordConfig.sensitivity,
    loggedIn,
    triggerVoiceFlow,
    wakeWordRevision,
    windowLabel,
  ]);

  // Determine which view based on Tauri window label
  // DEBUG: set document.title to show which branch
  document.title = `view:${windowLabel}`;

  // P0-#4 Desktop Claw 化 — `?plan=<id>` opens the live PlanTimeline view.
  // Works in both browser dev mode and Tauri main window. Useful for sandbox /
  // slides_generate task plans triggered from chat.
  const planIdFromUrl = (() => {
    try {
      return new URLSearchParams(window.location.search).get("plan");
    } catch {
      return null;
    }
  })();
  if (planIdFromUrl && loggedIn) {
    return (
      <ErrorBoundary>
        <PlanTimeline
          planId={planIdFromUrl}
          onClose={() => {
            try {
              window.history.replaceState({}, "", window.location.pathname);
            } catch {}
            window.location.reload();
          }}
        />
      </ErrorBoundary>
    );
  }

  // Floating ball window — minimal, just the ball
  if (windowLabel === "floating-ball") {
    const handleBallClick = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("desktop_bridge_open_chat_panel");
        await invoke("desktop_bridge_set_panel_position_near_ball");
      } catch (err) {
        console.error("open_chat_panel failed:", err);
      }
    };

    const handleOpenPro = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("desktop_bridge_open_chat_panel", { proMode: true });
      } catch (err) {
        console.error("open_chat_panel(pro) failed:", err);
      }
    };

    // Restore saved position on mount and snap after drag
    const initBallPosition = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const pos = await invoke("desktop_bridge_get_ball_position") as { x: number; y: number } | null;
        if (pos) {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          await getCurrentWindow().setPosition(new (await import("@tauri-apps/api/dpi")).PhysicalPosition(pos.x, pos.y));
        }
        // Listen for window moved events to snap to edge
        const { getCurrentWindow: getCW } = await import("@tauri-apps/api/window");
        const win = getCW();
        let dragTimer: ReturnType<typeof setTimeout> | null = null;
        await win.onMoved(() => {
          if (dragTimer) clearTimeout(dragTimer);
          dragTimer = setTimeout(async () => {
            try {
              const { invoke: inv } = await import("@tauri-apps/api/core");
              await inv("desktop_bridge_snap_ball_to_edge");
            } catch {}
          }, 300); // debounce 300ms after drag stops
        });
      } catch {}
    };
    // Fire-and-forget init
    if (typeof window !== "undefined") {
      initBallPosition();
    }

    // Multi-monitor: listen for monitor switch requests from tray/shortcuts
    const handleMonitorSwitch = async (e: Event) => {
      try {
        const idx = (e as CustomEvent).detail?.monitorIndex ?? 0;
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("desktop_bridge_move_ball_to_monitor", { monitorIndex: idx });
      } catch {}
    };
    window.addEventListener("agentrix:move-monitor", handleMonitorSwitch);
    // Cleanup not needed for floating ball (it's the whole window lifecycle)

    return (
      <div
        data-tauri-drag-region
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
        }}
      >
        <div style={{ position: "relative" }}>
          <FloatingBall
            onTap={handleBallClick}
            onOpenPro={handleOpenPro}
          />
          <PetEmotionOverlay />
          <PetProactiveBubble />
        </div>
      </div>
    );
  }

  // Spotlight window — minimal search/chat overlay
  if (windowLabel === "spotlight") {
    return <SpotlightPanel />;
  }

  // Pet Companion window (Phase 6 S1) — autonomous wandering desktop pet.
  if (windowLabel === "pet-companion") {
    return <PetCompanionWindow />;
  }

  // Chat panel window (opened by Tauri command)
  if (windowLabel === "chat-panel") {
    if (!loggedIn) {
      return <LoginPanel onSuccess={() => loadToken()} onGuest={enterGuest} />;
    }
    if (!onboarded) {
      return (
        <OnboardingPanel
          onComplete={() => {
            localStorage.setItem("agentrix_onboarded", "1");
            setOnboarded(true);
          }}
        />
      );
    }
    return (
      <ChatPanel
        onClose={async () => {
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("desktop_bridge_close_chat_panel");
          } catch {
            setPanelOpen(false);
          }
        }}
        networkStatus={networkStatus}
        restorePersistedTabs={false}
      />
    );
  }

  // Default: single-window dev mode (browser), both ball + panel inline
  if (!loggedIn) {
    return <LoginPanel onSuccess={() => loadToken()} onGuest={enterGuest} />;
  }

  if (!onboarded) {
    return (
      <OnboardingPanel
        onComplete={() => {
          localStorage.setItem("agentrix_onboarded", "1");
          setOnboarded(true);
        }}
      />
    );
  }

  return (
    <ErrorBoundary>
      <SuspendProvider>
      <div
        style={{ width: "100%", height: "100%", background: panelOpen ? "var(--bg-dark)" : "transparent" }}
      >
        {panelOpen ? (
          <ChatPanel
            onClose={() => setPanelOpen(false)}
            networkStatus={networkStatus}
            proMode={panelMode === "pro"}
            onEnterProMode={openProPanel}
            restorePersistedTabs={windowLabel !== "main"}
          />
        ) : (
          <div
            data-tauri-drag-region
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
            }}
          >
            <div style={{ position: "relative" }}>
              <FloatingBall onTap={openCompactPanel} onOpenPro={openProPanel} />
              <PetEmotionOverlay />
            </div>
          </div>
        )}
      </div>
      </SuspendProvider>
    </ErrorBoundary>
  );
}
