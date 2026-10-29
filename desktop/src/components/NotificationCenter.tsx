import { useState, useEffect, type CSSProperties } from "react";
import {
  subscribe,
  markRead,
  markAllRead,
  removeNotification,
  clearAll,
  type AppNotification,
  type NotificationType,
} from "../services/notifications";
import { useI18n } from "../i18n/I18nProvider";
import { fill, type Translator } from "../i18n/strings";

interface Props {
  open: boolean;
  onClose: () => void;
}

const typeIcons: Record<NotificationType, string> = {
  info: "ℹ️",
  success: "✅",
  warning: "⚠️",
  error: "❌",
  task: "📋",
  sync: "🔄",
};

export default function NotificationCenter({ open, onClose }: Props) {
  const { t } = useI18n();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => subscribe(setNotifications), []);

  if (!open) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            {t("notif.title")} {unreadCount > 0 && <span style={badgeStyle}>{unreadCount}</span>}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={headerBtnStyle} title={t("notif.markAllRead")}>
                {t("notif.all")}
              </button>
            )}
            {notifications.length > 0 && (
              <button onClick={clearAll} style={headerBtnStyle} title={t("notif.clearAll")}>
                {t("notif.clear")}
              </button>
            )}
            <button onClick={onClose} style={headerBtnStyle} aria-label={t("common.close")}>
              ✕
            </button>
          </div>
        </div>

        {/* List */}
        <div style={listStyle}>
          {notifications.length === 0 ? (
            <div style={emptyStyle}>{t("notif.empty")}</div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                style={{
                  ...itemStyle,
                  ...(n.read ? {} : unreadItemStyle),
                }}
                onClick={() => markRead(n.id)}
              >
                <div style={itemHeaderStyle}>
                  <span>
                    {typeIcons[n.type] || "•"} <strong>{n.title}</strong>
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNotification(n.id);
                    }}
                    style={removeBtnStyle}
                    title={t("notif.dismiss")}
                    aria-label={t("notif.dismiss")}
                  >
                    ×
                  </button>
                </div>
                <div style={bodyStyle}>{n.body}</div>
                <div style={timeStyle}>{formatTime(n.timestamp, t)}</div>
                {n.action && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.dispatchEvent(
                        new CustomEvent(n.action!.event, { detail: n.action!.payload }),
                      );
                      markRead(n.id);
                    }}
                    style={actionBtnStyle}
                  >
                    {n.action.label}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(ts: number, t: Translator): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return t("notif.justNow");
  if (diff < 3_600_000) return fill(t("notif.minutesAgo"), { n: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return fill(t("notif.hoursAgo"), { n: Math.floor(diff / 3_600_000) });
  return new Date(ts).toLocaleDateString();
}

export function NotificationBadge({ count, onClick }: { count: number; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button onClick={onClick} style={bellBtnStyle} title={t("notif.title")}>
      🔔
      {count > 0 && <span style={floatingBadgeStyle}>{count > 99 ? "99+" : count}</span>}
    </button>
  );
}

// ─── Styles ──────────────────────────────────────────────

const overlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  zIndex: 200,
  display: "flex",
  justifyContent: "flex-end",
};

const panelStyle: CSSProperties = {
  width: 320,
  maxWidth: "100%",
  height: "100%",
  background: "var(--bg-panel, #141926)",
  borderLeft: "1px solid var(--border)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 16px",
  borderBottom: "1px solid var(--border)",
  color: "var(--text)",
};

const headerBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text-dim)",
  cursor: "pointer",
  fontSize: 12,
  padding: "2px 6px",
  borderRadius: 4,
};

const listStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 0",
};

const emptyStyle: CSSProperties = {
  textAlign: "center",
  padding: 40,
  color: "var(--text-dim)",
  fontSize: 13,
};

const itemStyle: CSSProperties = {
  padding: "10px 16px",
  borderBottom: "1px solid var(--border)",
  cursor: "pointer",
  transition: "background 0.15s",
};

const unreadItemStyle: CSSProperties = {
  background: "rgba(99, 102, 241, 0.06)",
  borderLeft: "3px solid var(--accent, #6C5CE7)",
};

const itemHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  fontSize: 13,
  color: "var(--text)",
};

const bodyStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--text-dim)",
  marginTop: 4,
  lineHeight: 1.4,
  wordBreak: "break-word",
};

const timeStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--text-dim)",
  opacity: 0.6,
  marginTop: 4,
};

const removeBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text-dim)",
  cursor: "pointer",
  fontSize: 15,
  padding: "0 2px",
  opacity: 0.5,
  lineHeight: 1,
};

const actionBtnStyle: CSSProperties = {
  marginTop: 6,
  padding: "4px 10px",
  fontSize: 11,
  borderRadius: 4,
  border: "1px solid var(--accent)",
  background: "transparent",
  color: "var(--accent)",
  cursor: "pointer",
};

const bellBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: 16,
  position: "relative",
  padding: "4px 6px",
  WebkitAppRegion: "no-drag",
};

const floatingBadgeStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  background: "#ef4444",
  color: "#fff",
  fontSize: 9,
  fontWeight: 700,
  borderRadius: "50%",
  minWidth: 16,
  height: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 3px",
};

const badgeStyle: CSSProperties = {
  background: "var(--accent, #6C5CE7)",
  color: "#fff",
  fontSize: 10,
  borderRadius: 10,
  padding: "1px 6px",
  marginLeft: 6,
  fontWeight: 600,
};
