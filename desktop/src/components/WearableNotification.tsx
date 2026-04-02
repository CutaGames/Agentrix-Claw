/**
 * WearableNotification — Wearable device push notification component
 *
 * Displays compact notification cards for events forwarded from wearable
 * devices (smartwatch, band). Subscribes to presence WebSocket events
 * with wearable source. Supports quick actions (approve, dismiss, reply).
 */
import { useState, useEffect, useCallback, type CSSProperties } from "react";

export interface WearableAlert {
  id: string;
  type: "health" | "automation" | "reminder" | "approval" | "notification";
  title: string;
  body: string;
  sourceDevice?: string;
  priority: "low" | "normal" | "high" | "critical";
  timestamp: number;
  actionable?: boolean;
  actions?: { label: string; value: string }[];
}

interface Props {
  onAction?: (alertId: string, action: string) => void;
  maxVisible?: number;
}

const TYPE_ICONS: Record<WearableAlert["type"], string> = {
  health: "❤️",
  automation: "⚡",
  reminder: "⏰",
  approval: "🔐",
  notification: "🔔",
};

const PRIORITY_COLORS: Record<WearableAlert["priority"], string> = {
  low: "rgba(148,163,184,0.2)",
  normal: "rgba(99,102,241,0.15)",
  high: "rgba(245,158,11,0.2)",
  critical: "rgba(239,68,68,0.25)",
};

export default function WearableNotification({ onAction, maxVisible = 3 }: Props) {
  const [alerts, setAlerts] = useState<WearableAlert[]>([]);

  useEffect(() => {
    function handlePresenceEvent(e: Event) {
      const { event, data } = (e as CustomEvent).detail ?? {};
      if (event === "wearable:alert" || event === "wearable:notification") {
        const alert: WearableAlert = {
          id: data?.id || `w-${Date.now()}`,
          type: data?.type || "notification",
          title: data?.title || "Wearable Alert",
          body: data?.body || data?.message || "",
          sourceDevice: data?.sourceDevice || data?.deviceId,
          priority: data?.priority || "normal",
          timestamp: Date.now(),
          actionable: data?.actionable ?? false,
          actions: data?.actions,
        };
        setAlerts((prev) => [alert, ...prev].slice(0, 10));
      }
    }

    // Also support manual push via custom events
    function handleManualAlert(e: Event) {
      const alert = (e as CustomEvent).detail as WearableAlert;
      if (alert) {
        setAlerts((prev) => [alert, ...prev].slice(0, 10));
      }
    }

    window.addEventListener("agentrix:presence-event", handlePresenceEvent);
    window.addEventListener("agentrix:wearable-alert", handleManualAlert);
    return () => {
      window.removeEventListener("agentrix:presence-event", handlePresenceEvent);
      window.removeEventListener("agentrix:wearable-alert", handleManualAlert);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleAction = useCallback(
    (alertId: string, action: string) => {
      onAction?.(alertId, action);
      dismiss(alertId);
    },
    [onAction, dismiss],
  );

  // Auto-dismiss low-priority alerts after 15s
  useEffect(() => {
    const timers = alerts
      .filter((a) => a.priority === "low")
      .map((a) =>
        setTimeout(() => dismiss(a.id), 15_000),
      );
    return () => timers.forEach(clearTimeout);
  }, [alerts, dismiss]);

  const visible = alerts.slice(0, maxVisible);
  if (visible.length === 0) return null;

  return (
    <div style={styles.container}>
      {visible.map((alert) => (
        <div
          key={alert.id}
          style={{
            ...styles.card,
            background: PRIORITY_COLORS[alert.priority],
          }}
        >
          <div style={styles.header}>
            <span style={styles.icon}>{TYPE_ICONS[alert.type]}</span>
            <span style={styles.title}>{alert.title}</span>
            <span style={styles.device}>
              ⌚ {alert.sourceDevice?.slice(0, 8) || "wearable"}
            </span>
            <button style={styles.closeBtn} onClick={() => dismiss(alert.id)}>
              ✕
            </button>
          </div>
          {alert.body && <div style={styles.body}>{alert.body}</div>}
          {alert.actionable && alert.actions && alert.actions.length > 0 && (
            <div style={styles.actions}>
              {alert.actions.map((act) => (
                <button
                  key={act.value}
                  style={styles.actionBtn}
                  onClick={() => handleAction(alert.id, act.value)}
                >
                  {act.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      {alerts.length > maxVisible && (
        <div style={styles.overflow}>
          还有 {alerts.length - maxVisible} 条通知
        </div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    margin: "0 0 8px 0",
  },
  card: {
    borderRadius: 8,
    padding: "8px 10px",
    border: "1px solid rgba(148,163,184,0.15)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  icon: {
    fontSize: 14,
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: 12,
    fontWeight: 600,
    color: "#e2e8f0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  device: {
    fontSize: 10,
    color: "#64748b",
    flexShrink: 0,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#64748b",
    cursor: "pointer",
    fontSize: 11,
    padding: "0 2px",
    lineHeight: 1,
  },
  body: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 4,
    lineHeight: 1.4,
  },
  actions: {
    display: "flex",
    gap: 6,
    marginTop: 6,
  },
  actionBtn: {
    padding: "3px 10px",
    borderRadius: 4,
    border: "1px solid rgba(99,102,241,0.4)",
    background: "rgba(99,102,241,0.15)",
    color: "#a5b4fc",
    fontSize: 11,
    cursor: "pointer",
  },
  overflow: {
    textAlign: "center" as const,
    fontSize: 10,
    color: "#64748b",
    padding: 2,
  },
};
