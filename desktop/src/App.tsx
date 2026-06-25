import { useState, useEffect, useCallback, useRef } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { SuspendProvider } from "./components/SuspendContext";
import PetFloatingBall from "./components/PetFloatingBall";
import AxpCornerIndicator from "./components/AxpCornerIndicator";
import SubscriptionBadge from "./components/SubscriptionBadge";
import SocialPanel from "./components/SocialPanel";
import CreatorStudioHub from "./components/CreatorStudioHub";
import AgentOpsPanel from "./components/AgentOpsPanel";
import CheckinModal from "./components/CheckinModal";
import PetHeadToast from "./components/PetHeadToast";
import PetEmotionOverlay from "./components/PetEmotionOverlay";
import FirstRunTelemetryPrompt from "./components/FirstRunTelemetryPrompt";
import PetProactiveBubble from "./components/PetProactiveBubble";
import ChatPanel from "./components/ChatPanel";
import LoginPanel from "./components/LoginPanel";
import PlanTimeline from "./components/PlanTimeline";
import OnboardingPanel from "./components/OnboardingPanel";
import SpotlightPanel from "./components/SpotlightPanel";
import PetCompanionWindow from "./components/PetCompanionWindow";
import MobileScanToast from "./components/MobileScanToast";
import WorldCreatorPanel from "./components/WorldCreatorPanel";
import SplashScreen from "./components/SplashScreen";
import AmbientMemoryHUD from "./components/AmbientMemoryHUD";
import agentrixLogo from "./assets/agentrix-logo.png";
import { useAuthStore } from "./services/store";
import { addNotification } from "./services/notifications";
import { trackEvent } from "./services/analytics";
import { DesktopWakeWordService } from "./services/wakeWord";
import { DESKTOP_WAKE_WORD_EVENT, readDesktopWakeWordConfig } from "./services/wakeWordConfig";
import { useServiceBootstrapper } from "./app/useServiceBootstrapper";
import { useWindowManager } from "./app/useWindowManager";
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

  // Splash gate: short non-blocking placeholder so first paint is never an
  // empty 80×80 invisible square (US-G1-2). Splash unmounts itself after
  // 200ms via its onDone callback.
  const [splashDone, setSplashDone] = useState(false);

  const [onboarded, setOnboarded] = useState(() => localStorage.getItem("agentrix_onboarded") === "1");
  const { token, isGuest, loadToken, enterGuest } = useAuthStore();
  const [wakeWordRevision, setWakeWordRevision] = useState(0);
  const desktopWakeWordConfig = readDesktopWakeWordConfig();

  const loggedIn = !!token || isGuest;
  const isServiceHostWindow = windowLabel === "main" || windowLabel === "dev";

  // Sprint Pre-launch P-1 (2026-05-23) — App.tsx is now a thin view router.
  // Window lifecycle, keyboard shortcuts, and resize logic live inside
  // useWindowManager; service bootstrappers (with idle batching for non-
  // critical work) live inside useServiceBootstrapper.
  const {
    panelOpen,
    panelMode,
    setPanelOpen,
    openCompactPanel,
    openProPanel,
    openSpotlightOrPanel,
    triggerVoiceFlow,
    hideMainWindow,
    showMainWindow,
  } = useWindowManager({ windowLabel, loggedIn, onboarded });

  const { networkStatus } = useServiceBootstrapper({
    loggedIn,
    token,
    isServiceHostWindow,
    windowLabel,
  });

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

  // Sprint Pre-launch P-1 (2026-05-23) — onboarding telemetry + first-pet-view
  // tracking still live here because they're tightly coupled to App-level
  // mount lifecycle. Service bootstrappers and window resize/auto-open logic
  // moved to useServiceBootstrapper / useWindowManager.

  // First time the floating ball renders for the user, fire one-shot telemetry (US-G2-4).
  useEffect(() => {
    if (!loggedIn || !onboarded || panelOpen) return;
    if (windowLabel !== "main" && windowLabel !== "dev") return;
    if (localStorage.getItem("agentrix_first_pet_view_seen") === "1") return;
    trackEvent("desktop_first_pet_view");
    try { localStorage.setItem("agentrix_first_pet_view_seen", "1"); } catch {}
  }, [loggedIn, onboarded, panelOpen, windowLabel]);

  // Sprint Pre-launch P-1 (2026-05-23) — keyboard shortcuts (in-webview +
  // OS-level via Tauri plugin) are now owned by useWindowManager. The
  // wake-word handler still lives here because it's tightly coupled to
  // App-level wakeWordConfig + triggerVoiceFlow.

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

  // Splash gate (US-G1-2): only on user-facing main / dev windows. Other
  // labels (floating-ball, pet-companion, spotlight, chat-panel) have
  // their own minimal first-paint so we skip the splash there.
  const useSplash = windowLabel === "main" || windowLabel === "dev";
  if (useSplash && !splashDone) {
    return <SplashScreen onDone={() => setSplashDone(true)} />;
  }

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

  // AI World Creation Platform (v6) — Tier_C isolated experience / creator window.
  // The Rust sandbox opens `world_sandbox_open_isolated_window` as a separate
  // WebView loading `index.html#/world/plot/<plotId>` (label `world-c-<plotId>`).
  // Render the Tier_C desktop creator for that route; closing it closes the window.
  const worldPlotId = (() => {
    try {
      const m = /#\/world\/plot\/([^/?#]+)/.exec(window.location.hash || "");
      if (m?.[1]) return decodeURIComponent(m[1]);
      if (windowLabel.startsWith("world-c-")) return windowLabel.slice("world-c-".length);
    } catch {
      /* ignore */
    }
    return null;
  })();
  if (worldPlotId) {
    return (
      <ErrorBoundary>
        <WorldCreatorPanel
          visible
          plotId={worldPlotId}
          onClose={() => {
            void (async () => {
              try {
                const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
                await getCurrentWebviewWindow().close();
              } catch {
                /* browser dev — no window to close */
              }
            })();
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
        // US-G2-6: validate the saved position is still in range. If the user
        // unplugged the secondary monitor since last run, fall back to the
        // primary monitor's bottom-right.
        await invoke("desktop_bridge_validate_ball_position").catch(() => {});
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
          <PetFloatingBall
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
            if (!localStorage.getItem("agentrix_onboarded_at")) {
              localStorage.setItem("agentrix_onboarded_at", String(Date.now()));
            }
            trackEvent("desktop_onboarding_complete");
            setOnboarded(true);
          }}
        />
      );
    }
    return (
      <>
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
        <AxpCornerIndicator
          onOpenCheckin={() =>
            window.dispatchEvent(new CustomEvent("agentrix:open-checkin"))
          }
        />
        <div style={{ position: "fixed", top: 12, right: 16, zIndex: 9500 }}>
          <SubscriptionBadge />
        </div>
        <AmbientMemoryHUD />
        <ChatPanelAxpHost />
      </>
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
          // Stamp completion time so the FirstRunTelemetryPrompt (US-G2-4)
          // can wait 3 days before asking for opt-in.
          if (!localStorage.getItem("agentrix_onboarded_at")) {
            localStorage.setItem("agentrix_onboarded_at", String(Date.now()));
          }
          trackEvent("desktop_onboarding_complete");
          setOnboarded(true);
          // Sprint P-1: pop user directly into Pro Mode after onboarding.
          // The pet-companion window is the always-visible surface, but
          // first-time users still need a tour of the chat workspace.
          openProPanel();
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
        {/*
          Sprint P-1 (2026-05-21): the main window is exclusively the
          Pro Mode workspace now. The "floating ball" idle state was
          retired — the always-visible role is fully delegated to the
          pet-companion overlay (PetCompanionWindow). When this window
          is closed, we hide() it; double-clicking the desktop pet (or
          hitting Ctrl+Shift+S) shows it again.
        */}
        {panelOpen ? (
          <ChatPanel
            onClose={() => {
              setPanelOpen(false);
              // The resize-effect above sees panelOpen=false and calls
              // hideMainWindow(); we still flip state here so the next
              // show() doesn't briefly flash the previous render.
              void hideMainWindow();
            }}
            networkStatus={networkStatus}
            proMode={panelMode === "pro"}
            onEnterProMode={openProPanel}
            restorePersistedTabs={windowLabel !== "main"}
          />
        ) : (
          // Pro Mode dismissed but window is still visible (transient).
          // Render an empty transparent surface — the resize-effect will
          // call hideMainWindow() momentarily.
          //
          // Sprint v0.3.7: belt-and-braces hide. The resize-effect is
          // the canonical place to hide the window, but if it loses a
          // race with React render order the window stays visible as a
          // blank rectangle (observed in v0.3.6). Render a useEffect
          // child that fires hideMainWindow on mount.
          <DismissedSurface onMount={hideMainWindow} />
        )}
        <FirstRunTelemetryPrompt />
      </div>
      </SuspendProvider>
    </ErrorBoundary>
  );
}

/**
 * DismissedSurface — empty transparent placeholder rendered when the
 * main window is open (visible) but Pro Mode is dismissed. Calls
 * hideMainWindow on mount so we don't leave the user staring at a
 * blank Tauri window. The dismissal happens in two places (resize
 * effect + this component); whichever fires first wins, the second
 * is a no-op.
 */
function DismissedSurface({ onMount }: { onMount: () => Promise<void> | void }) {
  useEffect(() => {
    void onMount();
  }, [onMount]);
  return (
    <div
      data-tauri-drag-region
      style={{
        width: "100%",
        height: "100%",
        background: "transparent",
      }}
    />
  );
}

/**
 * ChatPanelAxpHost — mounts <PetHeadToast /> and the global CheckinModal
 * inside the chat-panel window. The chat-panel window doesn't host the
 * PetFloatingBall (that lives in main/dev window), so it needs its own
 * toast renderer + check-in listener.
 */
function ChatPanelAxpHost() {
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [socialTab, setSocialTab] = useState<"coraising" | "greeting" | "mimic">("mimic");
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioTab, setStudioTab] = useState<"pet" | "poster" | "video" | "skin" | "mimic" | "world">("pet");
  const [agentOpsOpen, setAgentOpsOpen] = useState(false);
  const [agentOpsTab, setAgentOpsTab] = useState<
    "tasks" | "duediligence" | "monitors" | "security" | "deliverables" | "metrics" | "packages" | "team"
  >("tasks");
  // AI World Creation (v6) — Tier_C creator opened via `agentrix:open-world-creator`
  // (e.g. when a Mobile-dispatched Creation_Task lands on this desktop).
  const [worldCreator, setWorldCreator] = useState<{ plotId: string; taskId?: string } | null>(null);

  useEffect(() => {
    const openCheckin = () => setCheckinOpen(true);
    const openSocial = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tab?: "coraising" | "greeting" | "mimic" } | undefined;
      if (detail?.tab) setSocialTab(detail.tab);
      setSocialOpen(true);
    };
    const openStudio = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tab?: typeof studioTab } | undefined;
      if (detail?.tab) setStudioTab(detail.tab);
      setStudioOpen(true);
    };
    const openAgentOps = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tab?: typeof agentOpsTab } | undefined;
      if (detail?.tab) setAgentOpsTab(detail.tab);
      setAgentOpsOpen(true);
    };
    const openWorldCreator = (e: Event) => {
      const detail = (e as CustomEvent).detail as { plotId?: string; taskId?: string } | undefined;
      if (detail?.plotId) {
        // Mobile-dispatched Tier_C task → open the creator directly on its Plot.
        setWorldCreator({ plotId: detail.plotId, taskId: detail.taskId });
      } else {
        // Menu entry (no Plot yet) → open Creator Studio on the World tab,
        // whose launcher takes a Plot ID before opening the creator.
        setStudioTab("world");
        setStudioOpen(true);
      }
    };
    window.addEventListener("agentrix:open-checkin", openCheckin);
    window.addEventListener("agentrix:open-world-creator", openWorldCreator);
    window.addEventListener("agentrix:open-social", openSocial);
    window.addEventListener("agentrix:open-creator-studio", openStudio);
    window.addEventListener("agentrix:open-agent-ops", openAgentOps);
    return () => {
      window.removeEventListener("agentrix:open-checkin", openCheckin);
      window.removeEventListener("agentrix:open-social", openSocial);
      window.removeEventListener("agentrix:open-creator-studio", openStudio);
      window.removeEventListener("agentrix:open-agent-ops", openAgentOps);
      window.removeEventListener("agentrix:open-world-creator", openWorldCreator);
    };
  }, []);

  return (
    <>
      <PetHeadToast />
      <CheckinModal visible={checkinOpen} onClose={() => setCheckinOpen(false)} />
      <SocialPanel visible={socialOpen} initialTab={socialTab} onClose={() => setSocialOpen(false)} />
      <CreatorStudioHub key={studioTab} visible={studioOpen} initialTab={studioTab} onClose={() => setStudioOpen(false)} />
      <AgentOpsPanel visible={agentOpsOpen} initialTab={agentOpsTab} onClose={() => setAgentOpsOpen(false)} />
      {worldCreator && (
        <WorldCreatorPanel
          visible
          plotId={worldCreator.plotId}
          taskId={worldCreator.taskId}
          onClose={() => setWorldCreator(null)}
        />
      )}
      <MobileScanToast />
    </>
  );
}
