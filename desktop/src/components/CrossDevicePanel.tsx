/**
 * CrossDevicePanel — P8 Unified Cross-Device Management UI
 *
 * Provides:
 * - 8.1 Unified session history from all devices
 * - 8.2 Remote control panel (device list, pending approvals, commands)
 * - 8.3 Device capabilities view (camera, GPS, screenshot, file_system)
 * - 8.4 Shared workspace management
 */
import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { API_BASE, useAuthStore, type ChatMessage } from "../services/store";

// ── Types ──────────────────────────────────────────────

interface UnifiedSession {
  sessionId: string;
  title: string;
  messageCount: number;
  lastUpdatedAt: number;
  originDeviceId: string;
  originDeviceType: string;
  devices: { deviceId: string; deviceType: string }[];
}

interface DeviceInfo {
  deviceId: string;
  platform: string;
  isOnline: boolean;
  capabilities: string[];
  context?: Record<string, unknown>;
}

interface PendingApproval {
  approvalId: string;
  title: string;
  description: string;
  riskLevel: string;
  status: string;
  deviceId: string;
  requestedAt: string;
}

interface MediaTransfer {
  transferId: string;
  sourceDeviceId: string;
  targetDeviceId?: string;
  mediaType: string;
  fileName?: string;
  status: string;
  createdAt: string;
  hasData: boolean;
}

interface SharedWorkspace {
  workspaceId: string;
  name: string;
  description?: string;
  role: string;
  ownerId: string;
}

type PanelTab = "sessions" | "devices" | "media" | "workspaces";

// ── API helpers ────────────────────────────────────────

async function apiFetch(url: string, token: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...opts?.headers },
  });
  return res.json();
}

// ── Component ──────────────────────────────────────────

interface Props {
  onClose: () => void;
  onResumeSession?: (sessionId: string, messages: ChatMessage[]) => void;
}

export default function CrossDevicePanel({ onClose, onResumeSession }: Props) {
  const { token } = useAuthStore();
  const [activeTab, setActiveTab] = useState<PanelTab>("sessions");
  const [sessions, setSessions] = useState<UnifiedSession[]>([]);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [transfers, setTransfers] = useState<MediaTransfer[]>([]);
  const [workspaces, setWorkspaces] = useState<SharedWorkspace[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [sessRes, devRes, appRes, mediaRes, wsRes] = await Promise.all([
        apiFetch(`${API_BASE}/desktop-sync/sessions/unified`, token),
        apiFetch(`${API_BASE}/desktop-sync/capabilities`, token),
        apiFetch(`${API_BASE}/desktop-sync/approvals/pending`, token),
        apiFetch(`${API_BASE}/desktop-sync/media`, token),
        apiFetch(`${API_BASE}/desktop-sync/workspaces`, token),
      ]);
      setSessions(sessRes?.sessions || []);
      setDevices(devRes?.devices || []);
      setApprovals(appRes?.approvals || []);
      setTransfers(mediaRes?.transfers || []);
      setWorkspaces(wsRes?.workspaces || []);
    } catch (err) {
      console.error("CrossDevicePanel refresh:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Handlers ──────────────────────────────────────────

  const handleResumeSession = async (sessionId: string) => {
    if (!token || !onResumeSession) return;
    try {
      const data = await apiFetch(`${API_BASE}/desktop-sync/sessions/${sessionId}`, token);
      if (data?.messages) {
        onResumeSession(sessionId, data.messages);
        onClose();
      }
    } catch (err) {
      console.error("Resume session:", err);
    }
  };

  const handleApprovalResponse = async (approvalId: string, decision: "approved" | "rejected") => {
    if (!token) return;
    try {
      await apiFetch(`${API_BASE}/desktop-sync/approvals/${approvalId}/respond`, token, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      refresh();
    } catch (err) {
      console.error("Approval response:", err);
    }
  };

  const handleCreateWorkspace = async () => {
    if (!token) return;
    const name = prompt("Workspace name:");
    if (!name) return;
    await apiFetch(`${API_BASE}/desktop-sync/workspaces`, token, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    refresh();
  };

  const handleShareScreenshot = async () => {
    if (!token) return;
    try {
      const { captureScreen } = await import("../services/screenshot");
      const result = await captureScreen(false);
      await apiFetch(`${API_BASE}/desktop-sync/media`, token, {
        method: "POST",
        body: JSON.stringify({
          sourceDeviceId: localStorage.getItem("agentrix_desktop_device_id") || "desktop",
          mediaType: "screenshot",
          fileName: `screenshot-${Date.now()}.png`,
          mimeType: "image/png",
          dataUrl: `data:image/png;base64,${result.dataBase64}`,
          metadata: { width: result.width, height: result.height },
        }),
      });
      refresh();
    } catch (err) {
      console.error("Screenshot share:", err);
    }
  };

  // ── Render ────────────────────────────────────────────

  const onlineCount = devices.filter((d) => d.isOnline).length;
  const pendingCount = approvals.length;

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.title}>Cross-Device Hub</span>
          <div style={styles.headerRight}>
            <span style={styles.badge}>{onlineCount} online</span>
            {pendingCount > 0 && <span style={styles.alertBadge}>{pendingCount} pending</span>}
            <button onClick={onClose} style={styles.closeBtn}>✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={styles.tabBar}>
          {(["sessions", "devices", "media", "workspaces"] as PanelTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={activeTab === tab ? { ...styles.tab, ...styles.tabActive } : styles.tab}
            >
              {tab === "sessions" ? "📋 Sessions" : tab === "devices" ? "📱 Devices" : tab === "media" ? "📸 Media" : "👥 Workspaces"}
            </button>
          ))}
          <button onClick={refresh} style={styles.refreshBtn} disabled={loading}>
            {loading ? "↻" : "⟳"}
          </button>
        </div>

        {/* Tab Content */}
        <div style={styles.content}>
          {activeTab === "sessions" && (
            <SessionsTab sessions={sessions} onResume={handleResumeSession} />
          )}
          {activeTab === "devices" && (
            <DevicesTab devices={devices} approvals={approvals} onApproval={handleApprovalResponse} />
          )}
          {activeTab === "media" && (
            <MediaTab transfers={transfers} onShareScreenshot={handleShareScreenshot} />
          )}
          {activeTab === "workspaces" && (
            <WorkspacesTab workspaces={workspaces} onCreate={handleCreateWorkspace} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────

function SessionsTab({ sessions, onResume }: { sessions: UnifiedSession[]; onResume: (id: string) => void }) {
  if (!sessions.length) return <div style={styles.empty}>No cross-device sessions yet</div>;
  return (
    <div style={styles.list}>
      {sessions.map((s) => (
        <div key={s.sessionId} style={styles.card} onClick={() => onResume(s.sessionId)}>
          <div style={styles.cardHeader}>
            <span style={styles.cardTitle}>{s.title}</span>
            <span style={styles.cardMeta}>{s.messageCount} msgs</span>
          </div>
          <div style={styles.cardFooter}>
            <span style={styles.deviceLabel}>
              {s.devices.map((d) => deviceIcon(d.deviceType)).join(" ")} from {s.originDeviceType}
            </span>
            <span style={styles.timeLabel}>{timeAgo(s.lastUpdatedAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DevicesTab({
  devices,
  approvals,
  onApproval,
}: {
  devices: DeviceInfo[];
  approvals: PendingApproval[];
  onApproval: (id: string, d: "approved" | "rejected") => void;
}) {
  return (
    <div style={styles.list}>
      {/* Pending approvals */}
      {approvals.length > 0 && (
        <>
          <div style={styles.sectionTitle}>⚠️ Pending Approvals</div>
          {approvals.map((a) => (
            <div key={a.approvalId} style={{ ...styles.card, borderLeft: "3px solid #f59e0b" }}>
              <div style={styles.cardHeader}>
                <span style={styles.cardTitle}>{a.title}</span>
                <span style={{ ...styles.badge, background: riskColor(a.riskLevel) }}>{a.riskLevel}</span>
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>{a.description}</div>
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <button onClick={() => onApproval(a.approvalId, "approved")} style={styles.approveBtn}>✓ Approve</button>
                <button onClick={() => onApproval(a.approvalId, "rejected")} style={styles.rejectBtn}>✗ Reject</button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Devices */}
      <div style={styles.sectionTitle}>🖥️ Connected Devices</div>
      {devices.map((d) => (
        <div key={d.deviceId} style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardTitle}>
              {deviceIcon(d.platform)} {d.platform}
            </span>
            <span style={d.isOnline ? styles.onlineDot : styles.offlineDot}>●</span>
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
            Capabilities: {d.capabilities.join(", ")}
          </div>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
            {d.deviceId.substring(0, 20)}…
          </div>
        </div>
      ))}
      {!devices.length && <div style={styles.empty}>No devices registered</div>}
    </div>
  );
}

function MediaTab({ transfers, onShareScreenshot }: { transfers: MediaTransfer[]; onShareScreenshot: () => void }) {
  return (
    <div style={styles.list}>
      <button onClick={onShareScreenshot} style={styles.actionBtn}>📸 Share Screenshot</button>
      {transfers.length > 0 ? (
        transfers.map((t) => (
          <div key={t.transferId} style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.cardTitle}>{mediaIcon(t.mediaType)} {t.fileName || t.mediaType}</span>
              <span style={styles.cardMeta}>{t.status}</span>
            </div>
            <div style={styles.cardFooter}>
              <span style={styles.deviceLabel}>from {t.sourceDeviceId.substring(0, 12)}…</span>
              <span style={styles.timeLabel}>{timeAgo(new Date(t.createdAt).getTime())}</span>
            </div>
          </div>
        ))
      ) : (
        <div style={styles.empty}>No media transfers yet</div>
      )}
    </div>
  );
}

function WorkspacesTab({ workspaces, onCreate }: { workspaces: SharedWorkspace[]; onCreate: () => void }) {
  return (
    <div style={styles.list}>
      <button onClick={onCreate} style={styles.actionBtn}>+ Create Workspace</button>
      {workspaces.length > 0 ? (
        workspaces.map((ws) => (
          <div key={ws.workspaceId} style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.cardTitle}>👥 {ws.name}</span>
              <span style={styles.badge}>{ws.role}</span>
            </div>
            {ws.description && (
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>{ws.description}</div>
            )}
          </div>
        ))
      ) : (
        <div style={styles.empty}>No shared workspaces. Create one to collaborate!</div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────

function deviceIcon(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("mobile") || t.includes("android") || t.includes("ios")) return "📱";
  if (t.includes("desktop") || t.includes("win") || t.includes("mac") || t.includes("linux")) return "🖥️";
  return "🌐";
}

function mediaIcon(type: string): string {
  if (type === "photo") return "📷";
  if (type === "screenshot") return "📸";
  if (type === "file") return "📄";
  if (type === "gps") return "📍";
  return "📎";
}

function riskColor(level: string): string {
  if (level === "L0") return "#22c55e";
  if (level === "L1") return "#eab308";
  if (level === "L2") return "#f97316";
  return "#ef4444";
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ── Styles ──────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 999, display: "flex",
    alignItems: "center", justifyContent: "center",
    background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
  },
  panel: {
    width: 520, maxHeight: "85vh", background: "#1a1a2e",
    borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column",
    border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  headerRight: { display: "flex", alignItems: "center", gap: 8 },
  title: { fontSize: 16, fontWeight: 700, color: "#e5e7eb" },
  badge: {
    fontSize: 11, padding: "2px 8px", borderRadius: 10,
    background: "rgba(59,130,246,0.2)", color: "#60a5fa",
  },
  alertBadge: {
    fontSize: 11, padding: "2px 8px", borderRadius: 10,
    background: "rgba(245,158,11,0.2)", color: "#fbbf24",
  },
  closeBtn: {
    background: "none", border: "none", color: "#9ca3af",
    fontSize: 16, cursor: "pointer", padding: "4px 8px",
  },
  tabBar: {
    display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.08)",
    padding: "0 12px",
  },
  tab: {
    flex: 1, padding: "10px 8px", background: "none", border: "none",
    color: "#9ca3af", fontSize: 12, cursor: "pointer",
    borderBottom: "2px solid transparent", transition: "all 0.15s",
  },
  tabActive: { color: "#60a5fa", borderBottomColor: "#3b82f6" },
  refreshBtn: {
    background: "none", border: "none", color: "#9ca3af",
    fontSize: 14, cursor: "pointer", padding: "8px",
  },
  content: { flex: 1, overflow: "auto", padding: "12px 16px" },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  card: {
    background: "rgba(255,255,255,0.04)", borderRadius: 10,
    padding: "12px 14px", cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.06)",
    transition: "background 0.15s",
  },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 13, fontWeight: 600, color: "#e5e7eb" },
  cardMeta: { fontSize: 11, color: "#6b7280" },
  cardFooter: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginTop: 6,
  },
  deviceLabel: { fontSize: 11, color: "#6b7280" },
  timeLabel: { fontSize: 10, color: "#9ca3af" },
  sectionTitle: {
    fontSize: 12, fontWeight: 700, color: "#9ca3af",
    textTransform: "uppercase" as const, letterSpacing: 0.5, padding: "8px 0 4px",
  },
  empty: { textAlign: "center", color: "#6b7280", fontSize: 13, padding: 32 },
  onlineDot: { color: "#22c55e", fontSize: 12 },
  offlineDot: { color: "#6b7280", fontSize: 12 },
  approveBtn: {
    padding: "4px 12px", borderRadius: 6, border: "none",
    background: "#22c55e", color: "#fff", fontSize: 12, cursor: "pointer",
  },
  rejectBtn: {
    padding: "4px 12px", borderRadius: 6, border: "none",
    background: "#ef4444", color: "#fff", fontSize: 12, cursor: "pointer",
  },
  actionBtn: {
    padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(59,130,246,0.3)",
    background: "rgba(59,130,246,0.1)", color: "#60a5fa", fontSize: 12,
    cursor: "pointer", textAlign: "center",
  },
};
