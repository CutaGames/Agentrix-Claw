/**
 * HandoffBanner — Cross-device session handoff notification
 *
 * Shows a banner when another device (mobile/web) has an active session
 * that can be continued on this desktop. Listens to agentPresence WebSocket
 * events for handoff:request / handoff:initiated.
 */
import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { acceptHandoffWs, rejectHandoffWs, type HandoffEvent } from "../services/agentPresence";

const PENDING_HANDOFF_KEY = "agentrix_pending_handoff";

interface Props {
  onAccept?: (handoffId: string, context: Record<string, unknown>) => void;
  onDismiss?: () => void;
}

const DEVICE_ICONS: Record<string, string> = {
  mobile: "📱",
  web: "🌐",
  desktop: "🖥️",
  tablet: "📋",
  wearable: "⌚",
};

export default function HandoffBanner({ onAccept, onDismiss }: Props) {
  const [handoff, setHandoff] = useState<HandoffEvent | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const setIncomingHandoff = (next: HandoffEvent | null) => {
      setHandoff(next);
      setDismissed(false);
      if (next) {
        localStorage.setItem(PENDING_HANDOFF_KEY, JSON.stringify(next));
      }
    };

    try {
      const raw = localStorage.getItem(PENDING_HANDOFF_KEY);
      if (raw) {
        setHandoff(JSON.parse(raw) as HandoffEvent);
      }
    } catch {}

    function handlePresenceEvent(e: Event) {
      const { event, data } = (e as CustomEvent).detail ?? {};
      if (event === "handoff:request" || event === "handoff:initiated") {
        setIncomingHandoff(data as HandoffEvent);
      }
      if (event === "handoff:accepted" || event === "handoff:accept_ok" || event === "handoff:rejected") {
        setHandoff(null);
        localStorage.removeItem(PENDING_HANDOFF_KEY);
      }
    }

    function handleIncomingHandoff(e: Event) {
      const detail = (e as CustomEvent).detail as HandoffEvent | undefined;
      if (detail) {
        setIncomingHandoff(detail);
      }
    }

    window.addEventListener("agentrix:presence-event", handlePresenceEvent);
    window.addEventListener("agentrix:handoff-incoming", handleIncomingHandoff as EventListener);
    return () => {
      window.removeEventListener("agentrix:presence-event", handlePresenceEvent);
      window.removeEventListener("agentrix:handoff-incoming", handleIncomingHandoff as EventListener);
    };
  }, []);

  // Auto-dismiss after 30s
  useEffect(() => {
    if (!handoff || hovered) return;
    const timer = setTimeout(() => setDismissed(true), 30_000);
    return () => clearTimeout(timer);
  }, [handoff, hovered]);

  const handleAccept = useCallback(async () => {
    if (!handoff?.handoffId) return;
    setAccepting(true);
    try {
      acceptHandoffWs(handoff.handoffId);
      onAccept?.(handoff.handoffId, handoff.contextSnapshot ?? {});
    } finally {
      setAccepting(false);
      setHandoff(null);
      localStorage.removeItem(PENDING_HANDOFF_KEY);
    }
  }, [handoff, onAccept]);

  const handleReject = useCallback(() => {
    if (handoff?.handoffId) {
      rejectHandoffWs(handoff.handoffId);
    }
    setDismissed(true);
    localStorage.removeItem(PENDING_HANDOFF_KEY);
    onDismiss?.();
  }, [handoff, onDismiss]);

  if (!handoff || dismissed) return null;

  const sourceIcon = DEVICE_ICONS[handoff.contextSnapshot?.deviceType as string] ?? "📱";

  return (
    <div
      style={styles.container}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={styles.content}>
        <span style={styles.icon}>{sourceIcon}</span>
        <div style={styles.text}>
          <div style={styles.title}>其他设备上有进行中的任务</div>
          <div style={styles.subtitle}>
            来自 {(handoff.contextSnapshot?.deviceName as string) || handoff.fromDeviceId?.slice(0, 8)}
            {handoff.contextSnapshot?.sessionTitle ? ` · ${String(handoff.contextSnapshot.sessionTitle)}` : null}
          </div>
        </div>
      </div>
      <div style={styles.actions}>
        <button style={styles.acceptBtn} onClick={handleAccept} disabled={accepting}>
          {accepting ? "接续中…" : "继续在桌面查看"}
        </button>
        <button style={styles.dismissBtn} onClick={handleReject}>
          忽略
        </button>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  container: {
    background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.10))",
    border: "1px solid rgba(99,102,241,0.3)",
    borderRadius: 10,
    padding: "10px 14px",
    margin: "0 0 8px 0",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    animation: "slideDown 0.3s ease-out",
  },
  content: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  icon: {
    fontSize: 22,
    flexShrink: 0,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: "#e2e8f0",
  },
  subtitle: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  actions: {
    display: "flex",
    gap: 8,
  },
  acceptBtn: {
    flex: 1,
    padding: "6px 12px",
    borderRadius: 6,
    border: "none",
    background: "rgba(99,102,241,0.8)",
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  dismissBtn: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid rgba(148,163,184,0.3)",
    background: "transparent",
    color: "#94a3b8",
    fontSize: 12,
    cursor: "pointer",
  },
};
