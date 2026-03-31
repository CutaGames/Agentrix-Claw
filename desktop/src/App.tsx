import { useState, useEffect, useCallback } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import FloatingBall from "./components/FloatingBall";
import ChatPanel from "./components/ChatPanel";
import LoginPanel from "./components/LoginPanel";
import OnboardingPanel from "./components/OnboardingPanel";
import SpotlightPanel from "./components/SpotlightPanel";
import agentrixLogo from "./assets/agentrix-logo.png";
import { useAuthStore } from "./services/store";
import { initSessionSync, destroySessionSync } from "./services/sessionSync";
import { initPresenceSocket, destroyPresenceSocket } from "./services/agentPresence";
import { startDesktopAgentSync, stopDesktopAgentSync } from "./services/desktopAgentSync";
import { startClipboardWatch, stopClipboardWatch } from "./services/clipboard";
import { initAnalytics, destroyAnalytics, trackEvent } from "./services/analytics";
import { startNetworkMonitor, stopNetworkMonitor, getNetworkStatus, onNetworkStatusChange, type NetworkStatus } from "./services/network";
import { DesktopWakeWordService } from "./services/wakeWord";
import { DESKTOP_WAKE_WORD_EVENT, readDesktopWakeWordConfig } from "./services/wakeWordConfig";
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

export default function App() {
  const windowLabel = getWindowView();
  const [panelOpen, setPanelOpen] = useState(false);
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem("agentrix_onboarded") === "1");
  const { token, isGuest, loadToken, enterGuest } = useAuthStore();
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(getNetworkStatus());
  const [wakeWordRevision, setWakeWordRevision] = useState(0);
  const desktopWakeWordConfig = readDesktopWakeWordConfig();

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

  useEffect(() => {
    const handleWakeWordConfigChange = () => setWakeWordRevision((prev) => prev + 1);
    window.addEventListener(DESKTOP_WAKE_WORD_EVENT, handleWakeWordConfigChange);
    return () => window.removeEventListener(DESKTOP_WAKE_WORD_EVENT, handleWakeWordConfigChange);
  }, []);

  const loggedIn = !!token || isGuest;

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
    if (token) {
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
          void import("@tauri-apps/api/core").then(({ invoke }) => invoke("desktop_bridge_open_chat_panel")).catch(() => {});
        },
        onTimelineEvent: (event) => {
          window.dispatchEvent(new CustomEvent("agentrix:timeline-event", { detail: event }));
        },
        onApprovalNew: (event) => {
          window.dispatchEvent(new CustomEvent("agentrix:approval-new", { detail: event }));
        },
        onConnectionChange: (connected) => {
          window.dispatchEvent(new CustomEvent("agentrix:presence-status", { detail: { connected } }));
        },
      });

      if (windowLabel !== "floating-ball") {
        startDesktopAgentSync(token);
      }
    }

    trackEvent("session_start");

    return () => {
      stopNetworkMonitor();
      unsub();
      stopClipboardWatch();
      destroyAnalytics();
      destroySessionSync();
      destroyPresenceSocket();
      stopDesktopAgentSync();
    };
  }, [loggedIn, token, windowLabel]);

  // Global keyboard shortcuts (within webview)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Shift+S → toggle panel
      if (e.ctrlKey && e.shiftKey && e.key === "S") {
        e.preventDefault();
        setPanelOpen((prev) => !prev);
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
  }, [panelOpen]);

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
            setPanelOpen(true);
            window.dispatchEvent(new CustomEvent("agentrix:voice-start"));
          } else if (event.state === "Released") {
            window.dispatchEvent(new CustomEvent("agentrix:voice-stop"));
          }
        });
        // Register Ctrl+Shift+S for panel toggle
        await register("CmdOrCtrl+Shift+S", (event) => {
          if (event.state === "Pressed") {
            setPanelOpen((prev) => !prev);
          }
        });
        // Register Ctrl/Cmd+K for Spotlight mode
        await register("CmdOrCtrl+K", (event) => {
          if (event.state === "Pressed") {
            (async () => {
              try {
                const { invoke } = await import("@tauri-apps/api/core");
                await invoke("desktop_bridge_open_spotlight");
              } catch (err) {
                console.error("open_spotlight failed:", err);
              }
            })();
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
  }, []);

  useEffect(() => {
    if (
      windowLabel === "floating-ball" ||
      !loggedIn ||
      !desktopWakeWordConfig.enabled ||
      !desktopWakeWordConfig.accessKey ||
      !DesktopWakeWordService.isAvailable()
    ) {
      return;
    }

    const wakeWord = new DesktopWakeWordService();
    let disposed = false;

    const triggerVoiceFlow = async () => {
      if (disposed) return;

      if (windowLabel === "chat-panel") {
        window.dispatchEvent(new CustomEvent("agentrix:voice-start"));
        return;
      }

      setPanelOpen(true);
      setTimeout(() => {
        if (!disposed) {
          window.dispatchEvent(new CustomEvent("agentrix:voice-start"));
        }
      }, 250);
    };

    void wakeWord.init({
      accessKey: desktopWakeWordConfig.accessKey,
      builtInKeyword: desktopWakeWordConfig.customKeywordPath ? undefined : desktopWakeWordConfig.builtInKeyword,
      customKeywordPath: desktopWakeWordConfig.customKeywordPath || undefined,
      sensitivity: desktopWakeWordConfig.sensitivity,
      onWakeWord: () => {
        void triggerVoiceFlow();
      },
    }).then(() => wakeWord.start());

    return () => {
      disposed = true;
      void wakeWord.release();
    };
  }, [
    desktopWakeWordConfig.accessKey,
    desktopWakeWordConfig.builtInKeyword,
    desktopWakeWordConfig.customKeywordPath,
    desktopWakeWordConfig.enabled,
    desktopWakeWordConfig.sensitivity,
    loggedIn,
    wakeWordRevision,
    windowLabel,
  ]);

  // Determine which view based on Tauri window label
  // DEBUG: set document.title to show which branch
  document.title = `view:${windowLabel}`;

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
          background: "#FF0000",
        }}
      >
        <FloatingBall onTap={handleBallClick} />
      </div>
    );
  }

  // Spotlight window — minimal search/chat overlay
  if (windowLabel === "spotlight") {
    return <SpotlightPanel />;
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
      <div
        style={{ width: "100%", height: "100%", background: "var(--bg-dark)" }}
      >
        {panelOpen ? (
          <ChatPanel onClose={() => setPanelOpen(false)} networkStatus={networkStatus} />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FloatingBall onTap={() => setPanelOpen(true)} />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
