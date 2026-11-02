/**
 * HandoffBanner — Cross-device session handoff notification
 *
 * Shows a banner when another device (mobile/web) has an active session
 * that can be continued on this desktop. Listens to agentPresence WebSocket
 * events for handoff:request / handoff:initiated.
 */
import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { rejectHandoffWs, acceptHandoffRest, cancelHandoffRest, type HandoffEvent } from "../services/agentPresence";
import { useAuthStore } from "../services/store";

const PENDING_HANDOFF_KEY = "agentrix_pending_handoff";

interface Props {
  onAccept?: (handoff: HandoffEvent) => void;
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
  const [mode, setMode] = useState<'handoff' | 'mirror'>('handoff');
  const token = useAuthStore((s) => s.token);

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
      // P0-W2-6: prefer REST /api/v1/handoff/:id/accept (PRD §6.3 three-option contract)
      if (token) {
        try {
          await acceptHandoffRest(token, handoff.handoffId, { mode });
        } catch (err) {
          console.warn('[HandoffBanner] REST accept failed, falling back to WS', err);
        }
      }
      onAccept?.(handoff);
    } finally {
      setAccepting(false);
      setHandoff(null);
      localStorage.removeItem(PENDING_HANDOFF_KEY);
    }
  }, [handoff, mode, onAccept, token]);

  const handleReject = useCallback(() => {
    if (handoff?.handoffId) {
      // P0-W2-6: prefer REST cancel; WS as fallback for legacy listeners
      if (token) {
        cancelHandoffRest(token, handoff.handoffId).catch((err) => {
          console.warn('[HandoffBanner] REST cancel failed, falling back to WS', err);
          rejectHandoffWs(handoff.handoffId);
        });
      } else {
        rejectHandoffWs(handoff.handoffId);
      }
    }
    setDismissed(true);
    localStorage.removeItem(PENDING_HANDOFF_KEY);
    onDismiss?.();
  }, [handoff, onDismiss, token]);

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
        {/* P0-W2-6: explicit mode toggle (handoff vs mirror) */}
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as 'handoff' | 'mirror')}
          style={styles.modeSelect}
          disabled={accepting}
        >
          <option value="handoff">接力（转移）</option>
          <option value="mirror">镜像（同步）</option>
        </select>
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
    background: "var(--tone-info-bg)",
    border: "1px solid var(--tone-info-border)",
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
    color: "var(--text-card)",
  },
  subtitle: {
    fontSize: 11,
    color: "var(--text-muted)",
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
    background: "var(--accent)",
    color: "var(--text-on-accent)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  dismissBtn: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-muted)",
    fontSize: 12,
    cursor: "pointer",
  },
  modeSelect: {
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-input)",
    color: "var(--text)",
    fontSize: 11,
    cursor: "pointer",
  },
};
