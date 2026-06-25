// Sprint Pre-launch P-1 (2026-05-23) — App.tsx decomposition: ServiceBootstrapper.
//
// All "boot* / start* / init*" calls fire inside this hook AFTER login. The
// previous version ran every service synchronously on login, blocking the
// first paint. We now split bootstrappers into three priorities and stagger
// the lower-priority ones via `requestIdleCallback` so the chat surface
// becomes interactive sooner.
//
// Priority tiers:
//   - critical: sync, must run on first frame (auth-driven socket + sync)
//   - default: run after first paint (pet/sdk/updater/crash)
//   - background: run when CPU is idle (telemetry/skin notifier/vision)

import { useEffect, useState } from "react";
import { addNotification } from "../services/notifications";
import {
  destroySessionSync,
  initSessionSync,
} from "../services/sessionSync";
import {
  destroyPresenceSocket,
  initPresenceSocket,
} from "../services/agentPresence";
import {
  destroyRemoteControl,
  initRemoteControl,
} from "../services/remoteControl";
import {
  startDesktopPresence,
  stopDesktopPresence,
} from "../services/presence";
import {
  startDesktopAgentSync,
  stopDesktopAgentSync,
} from "../services/desktopAgentSync";
import { startClipboardWatch, stopClipboardWatch } from "../services/clipboard";
import { destroyAnalytics, initAnalytics, trackEvent } from "../services/analytics";
import {
  getNetworkStatus,
  onNetworkStatusChange,
  startNetworkMonitor,
  stopNetworkMonitor,
  type NetworkStatus,
} from "../services/network";
import { bootPetSdk } from "../services/petSdk";
import { bootPetAssets, destroyPetAssets } from "../services/petAssets";
import { bootPetModeBus } from "../services/petMode";
import { bootUpdater } from "../services/updater";
import { bootCrashReport } from "../services/crashReport";
import {
  startChatMilestoneWatcher,
  stopChatMilestoneWatcher,
} from "../services/chatMilestones";
import {
  startAxpRemoteSync,
  stopAxpRemoteSync,
} from "../services/axpRemoteSync";
import {
  startSkinSaleNotifier,
  stopSkinSaleNotifier,
} from "../services/skinSaleNotifier";
import {
  isVisionPerceptionEnabled,
  startVisionPerception,
  stopVisionPerception,
} from "../services/visionPerception";
import {
  startCrossToolContextWatcher,
  stopCrossToolContextWatcher,
} from "../services/crossToolContext";

// ── Idle scheduler (requestIdleCallback fallback) ───────────────────────────
//
// requestIdleCallback isn't available in older Webview2 builds, so we fall
// back to a 16 ms setTimeout (one frame). This is good enough to push work
// past the initial paint without resorting to setImmediate semantics.

type IdleCb = () => void;
function scheduleIdle(cb: IdleCb, timeoutMs = 1500) {
  const ric = (window as any).requestIdleCallback;
  if (typeof ric === "function") {
    ric(cb, { timeout: timeoutMs });
  } else {
    setTimeout(cb, 16);
  }
}

interface ServiceBootstrapperArgs {
  loggedIn: boolean;
  token: string | null;
  isServiceHostWindow: boolean;
  windowLabel: string;
}

interface ServiceBootstrapperResult {
  networkStatus: NetworkStatus;
}

export function useServiceBootstrapper({
  loggedIn,
  token,
  isServiceHostWindow,
  windowLabel,
}: ServiceBootstrapperArgs): ServiceBootstrapperResult {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(getNetworkStatus());

  useEffect(() => {
    if (!loggedIn) return;

    // ── PRIORITY 1: critical (sync, must run before first interaction) ──
    startNetworkMonitor();
    const unsubNetwork = onNetworkStatusChange(setNetworkStatus);
    startClipboardWatch();
    initAnalytics(token);

    if (token && isServiceHostWindow) {
      initSessionSync(token, {
        onSessionUpdated: (snapshot) => {
          localStorage.setItem(
            `chat_session_${snapshot.sessionId}`,
            JSON.stringify(snapshot.messages),
          );
          window.dispatchEvent(new CustomEvent("agentrix:session-synced", { detail: snapshot }));
        },
        onConnectionChange: (connected) => {
          window.dispatchEvent(new CustomEvent("agentrix:sync-status", { detail: { connected } }));
        },
      });

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
          void import("@tauri-apps/api/core")
            .then(({ invoke }) => invoke("desktop_bridge_open_chat_panel"))
            .catch(() => {});
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
              riskLevel: typeof approval?.riskLevel === "number" ? approval?.riskLevel : 0,
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

      // Remote-control receiver: join device:<activeInstanceId> so mobile
      // "启动 Computer Use / Pro 模式" reaches this desktop. Mobile targets the
      // OpenClaw instance id, so we must use that (not the localStorage device id).
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const { useAuthStore } = require("../services/store");
        const st = useAuthStore.getState?.();
        const instanceId = st?.activeInstanceId || st?.instances?.find((i: any) => i.isPrimary)?.id || st?.instances?.[0]?.id;
        if (instanceId) initRemoteControl(token, instanceId);
      } catch {
        /* store not ready — remote control stays off until next login */
      }

      // Cross-device presence (soul-companion task 4.3, R8.2): opening the
      // desktop app auto-reports `device='desktop'` heartbeats so the same
      // Claw_Instance shows as cross-device online. The active instance is
      // resolved lazily on each beat (same order as remote-control above), so
      // it starts as soon as /auth/me populates instances. Heartbeat failures
      // are swallowed and the interval continues — losing the network just lets
      // the backend ttl sweep mark this end offline, and reconnect auto-recovers.
      startDesktopPresence(token);
    }

    trackEvent("session_start");
    trackEvent("desktop_launch", {
      platform: typeof navigator !== "undefined" ? navigator.platform : "unknown",
      is_first_run: localStorage.getItem("agentrix_first_run_seen") === "1" ? 0 : 1,
    });
    try { localStorage.setItem("agentrix_first_run_seen", "1"); } catch {}

    // ── PRIORITY 2: default (after first paint) ─────────────────────────
    // These need to run for chat to work but can wait one frame so the
    // first paint completes faster.
    scheduleIdle(() => {
      bootPetSdk();
      bootPetAssets();
      bootPetModeBus();
      bootUpdater();
      bootCrashReport();
      // Multi-Agent Collaboration v1 W1 — Simple Mode CompanionBall
      // badge bus listener (zero-cost,1 DOM event listener).
      void import("../services/teamActivityStore").then(({ bootTeamActivityBus }) => {
        bootTeamActivityBus();
      });
    }, 800);

    // ── PRIORITY 3: background (CPU-idle) ───────────────────────────────
    // Telemetry / non-essential watchers — can wait a few seconds without
    // any user impact. This frees the main thread for the first interactive
    // turn (which is where users notice lag the most).
    scheduleIdle(() => {
      startChatMilestoneWatcher();
      startAxpRemoteSync();
      startSkinSaleNotifier();
      // Sprint Pre-launch P-4 (2026-05-23) — cross-tool context watcher
      // (polls active window, drives the floating-pet ambient bar).
      startCrossToolContextWatcher();
      // Multi-agent v1 W1 — bulk-import legacy localStorage worktree
      // lanes once per session. Idempotent + best-effort.
      void Promise.all([
        import("../services/worktreeLanes"),
        import("../services/store"),
      ]).then(([{ bulkImportFromLocalStorage }, { useAuthStore }]) => {
        const userId = useAuthStore.getState().user?.id;
        if (userId) void bulkImportFromLocalStorage(String(userId)).catch(() => {});
      });
      if (isVisionPerceptionEnabled()) {
        startVisionPerception();
      }
    }, 2500);

    return () => {
      stopNetworkMonitor();
      unsubNetwork();
      stopClipboardWatch();
      destroyAnalytics();
      destroySessionSync();
      destroyPresenceSocket();
      destroyRemoteControl();
      stopDesktopPresence();
      stopDesktopAgentSync();
      stopVisionPerception();
      destroyPetAssets();
      stopChatMilestoneWatcher();
      stopAxpRemoteSync();
      stopSkinSaleNotifier();
      stopCrossToolContextWatcher();
    };
  }, [isServiceHostWindow, loggedIn, token, windowLabel]);

  return { networkStatus };
}
