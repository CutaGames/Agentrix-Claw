// Sprint Pre-launch P-4 (2026-05-23) — outgoing handoff entry point.
//
// A title-bar button that opens a small popover listing the user's other
// online devices. Clicking a device pushes the current chat session via
// REST handoff/create + the existing WS bridge, so the receiving device
// (mobile / web / watch / Toy) can pick it up via its own HandoffBanner.
//
// Design choices:
//   - We use the REST /v1/handoff/create endpoint rather than the WS
//     `initiateHandoffWs` so the handoff has a stable id we can show in
//     UI ("Sent to <Device>").
//   - When `getDeviceLink` is unknown (no device list), we degrade to
//     "no other device online" and the button is dimmed but still visible
//     — this keeps the differentiation discoverable for first-time users.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  fetchOnlineDevices,
  type DeviceInfo,
} from "../services/agentPresence";
import { useAuthStore } from "../services/store";
import { getDesktopDeviceId } from "../services/desktop";
import { API_BASE, apiFetch } from "../services/store";

interface Props {
  /** Active session id, used as the handoff context_ref. */
  sessionId: string | null;
  /** Active agent id; required by the REST contract. */
  agentId: string | null;
  iconStyle: CSSProperties;
}

const DEVICE_ICON: Record<string, string> = {
  mobile: "📱",
  ios: "📱",
  android: "📱",
  desktop: "🖥",
  windows: "🖥",
  mac: "🖥",
  linux: "🖥",
  web: "🌐",
  watch: "⌚",
  wearable: "⌚",
  toy: "🧸",
  tv: "📺",
};

function deviceIconFor(d: DeviceInfo): string {
  const t = (d.platform || "").toLowerCase();
  return DEVICE_ICON[t] || "📡";
}

export default function PushToDeviceButton({ sessionId, agentId, iconStyle }: Props) {
  const token = useAuthStore((s) => s.token);
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Fetch on open.
  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    setLoading(true);
    void fetchOnlineDevices(token)
      .then((list) => {
        if (cancelled) return;
        const myId = getDesktopDeviceId();
        setDevices(list.filter((d) => d.deviceId !== myId));
      })
      .catch(() => {
        if (!cancelled) setDevices([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, token]);

  // Click outside closes the popover.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (e.target instanceof Node && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDocClick);
    return () => window.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const handlePush = useCallback(async (device: DeviceInfo) => {
    if (!token || !agentId || pushingId) return;
    setPushingId(device.deviceId);
    setFeedback(null);
    try {
      const myId = getDesktopDeviceId();
      const res = await apiFetch(`${API_BASE}/v1/handoff/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          agent_id: agentId,
          session_id: sessionId,
          origin_device_id: myId,
          origin_surface: "desktop",
          target_device_id: device.deviceId,
          target_surface: device.platform,
          mode: "handoff",
          task_kind: "chat",
        }),
      });
      if (res.ok) {
        setFeedback(`已推送到 ${device.platform || device.deviceId.slice(0, 8)}`);
        setTimeout(() => {
          setOpen(false);
          setFeedback(null);
        }, 1400);
      } else {
        const text = await res.text();
        setFeedback(`推送失败 · ${text.slice(0, 80)}`);
      }
    } catch (err: any) {
      setFeedback(`推送失败 · ${err?.message || "网络错误"}`);
    } finally {
      setPushingId(null);
    }
  }, [token, agentId, sessionId, pushingId]);

  const disabled = !token || !agentId;

  return (
    <div ref={containerRef} style={containerStyle}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        style={{
          ...iconStyle,
          opacity: disabled ? 0.5 : 1,
        }}
        title={disabled ? "需要先选好 Agent 才能跨端推送" : "推送当前对话到其他设备"}
        aria-label="推送到其他设备"
        data-testid="title-bar-push-to-device"
      >
        ↗
      </button>
      {open && (
        <div style={popoverStyle} role="menu" aria-label="选择目标设备">
          <div style={popoverHeaderStyle}>推送当前对话到</div>
          {loading && <div style={emptyStyle}>读取中…</div>}
          {!loading && devices.length === 0 && (
            <div style={emptyStyle}>
              没有其他设备在线
              <div style={hintStyle}>
                登录手机/Web 端 Agentrix 后会显示在这里
              </div>
            </div>
          )}
          {!loading && devices.map((device) => {
            const pushing = pushingId === device.deviceId;
            return (
              <button
                key={device.deviceId}
                onClick={() => void handlePush(device)}
                disabled={pushing}
                style={{
                  ...rowStyle,
                  opacity: pushing ? 0.6 : 1,
                  cursor: pushing ? "wait" : "pointer",
                }}
              >
                <span style={{ fontSize: 18 }}>{deviceIconFor(device)}</span>
                <span style={rowTextStyle}>
                  <span style={rowTitleStyle}>
                    {device.platform || device.deviceId.slice(0, 8)}
                  </span>
                  <span style={rowSubStyle}>
                    {(device.platform || "").toLowerCase()}
                    {device.lastSeenAt
                      ? ` · ${new Date(device.lastSeenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : ""}
                  </span>
                </span>
                <span style={{ fontSize: 11, color: pushing ? "var(--text-muted)" : "var(--accent-eyebrow)" }}>
                  {pushing ? "推送中" : "→"}
                </span>
              </button>
            );
          })}
          {feedback && (
            <div style={feedbackStyle}>{feedback}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const containerStyle: CSSProperties = {
  position: "relative",
  display: "inline-flex",
  WebkitAppRegion: "no-drag" as any,
};

const popoverStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  minWidth: 260,
  maxWidth: 320,
  background: "var(--bg-card)",
  border: "1px solid var(--border-strong)",
  borderRadius: 12,
  boxShadow: "var(--shadow)",
  padding: 6,
  zIndex: 5000,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const popoverHeaderStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--accent-eyebrow)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  padding: "8px 10px 4px",
};

const emptyStyle: CSSProperties = {
  padding: "12px 10px",
  fontSize: 12,
  color: "var(--text-muted)",
  textAlign: "center",
};

const hintStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 10,
  color: "var(--text-dim)",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 10px",
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: "var(--text)",
  textAlign: "left",
  width: "100%",
};

const rowTextStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0,
};

const rowTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const rowSubStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--text-muted)",
};

const feedbackStyle: CSSProperties = {
  margin: "4px 8px",
  padding: "6px 10px",
  borderRadius: 8,
  background: "var(--tone-success-bg)",
  border: "1px solid var(--tone-success-border)",
  color: "var(--tone-success-text)",
  fontSize: 11,
};
