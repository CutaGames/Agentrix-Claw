import { useState, useCallback, useEffect, type CSSProperties } from "react";

interface McpServer {
  id: string;
  name: string;
  description?: string;
  transport: "stdio" | "sse" | "http";
  url?: string;
  command?: string;
  isActive: boolean;
  createdAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const TRANSPORT_EMOJI: Record<string, string> = { stdio: "⌨️", sse: "📡", http: "🌐" };

export default function McpPanel({ open, onClose }: Props) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "add">("list");

  // Form state
  const [formName, setFormName] = useState("");
  const [formTransport, setFormTransport] = useState<"stdio" | "sse" | "http">("stdio");
  const [formEndpoint, setFormEndpoint] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const token = localStorage.getItem("agentrix_token");

  const fetchServers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/mcp-servers", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setServers(await res.json());
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (open) fetchServers();
  }, [open, fetchServers]);

  const addServer = async () => {
    if (!formName.trim() || !formEndpoint.trim() || !token) return;
    setSubmitting(true);
    try {
      const body: Record<string, any> = {
        name: formName,
        description: formDesc,
        transport: formTransport,
      };
      if (formTransport === "stdio") {
        body.command = formEndpoint;
      } else {
        body.url = formEndpoint;
      }
      const res = await fetch("/mcp-servers", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setViewMode("list");
        setFormName("");
        setFormEndpoint("");
        setFormDesc("");
        await fetchServers();
      }
    } catch {}
    setSubmitting(false);
  };

  const toggleServer = async (id: string) => {
    if (!token) return;
    await fetch(`/mcp-servers/${id}/toggle`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchServers();
  };

  const deleteServer = async (id: string) => {
    if (!token || !confirm("Delete this MCP server?")) return;
    await fetch(`/mcp-servers/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchServers();
  };

  if (!open) return null;

  // Add server form
  if (viewMode === "add") {
    return (
      <div style={overlay} onClick={onClose}>
        <div style={panel} onClick={(e) => e.stopPropagation()}>
          <div style={header}>
            <button onClick={() => setViewMode("list")} style={{ ...closeBtn, fontSize: 12 }}>
              ← Back
            </button>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Add MCP Server</span>
            <div style={{ width: 40 }} />
          </div>
          <div style={formBody}>
            <label style={fieldLabel}>Name</label>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="github-mcp"
              style={fieldInput}
            />

            <label style={fieldLabel}>Transport</label>
            <div style={{ display: "flex", gap: 6 }}>
              {(["stdio", "sse", "http"] as const).map((tr) => (
                <button
                  key={tr}
                  onClick={() => setFormTransport(tr)}
                  style={{ ...trBtn, ...(formTransport === tr ? trBtnActive : {}) }}
                >
                  {TRANSPORT_EMOJI[tr]} {tr.toUpperCase()}
                </button>
              ))}
            </div>

            <label style={fieldLabel}>
              {formTransport === "stdio" ? "Command" : "Endpoint URL"}
            </label>
            <input
              value={formEndpoint}
              onChange={(e) => setFormEndpoint(e.target.value)}
              placeholder={
                formTransport === "stdio"
                  ? "npx -y @modelcontextprotocol/server-github"
                  : "https://mcp.example.com/sse"
              }
              style={fieldInput}
            />

            <label style={fieldLabel}>Description (optional)</label>
            <input
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="What this server does..."
              style={fieldInput}
            />

            <button
              onClick={addServer}
              disabled={submitting}
              style={{ ...submitBtn, opacity: submitting ? 0.5 : 1 }}
            >
              {submitting ? "Registering..." : "Register Server"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={header}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>
            🔌 MCP Manager ({servers.length})
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setViewMode("add")} style={addBtn}>+ Add</button>
            <button onClick={onClose} style={closeBtn}>✕</button>
          </div>
        </div>

        {/* Server list */}
        <div style={content}>
          {loading && <div style={{ color: "var(--text-dim)", textAlign: "center" }}>Loading...</div>}
          {!loading && servers.length === 0 && (
            <div style={{ color: "var(--text-dim)", textAlign: "center", marginTop: 20 }}>
              No MCP servers registered. Add your first server!
            </div>
          )}
          {servers.map((s) => (
            <div key={s.id} style={serverCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text, #f0f6ff)", fontSize: 13, fontWeight: 700 }}>
                  {TRANSPORT_EMOJI[s.transport]} {s.name}
                </span>
                <button
                  onClick={() => toggleServer(s.id)}
                  style={{
                    ...statusBadge,
                    background: s.isActive ? "rgba(16,185,129,0.15)" : "rgba(255,100,100,0.1)",
                    color: s.isActive ? "#10b981" : "#f87171",
                  }}
                >
                  {s.isActive ? "Active" : "Off"}
                </button>
              </div>
              {s.description && (
                <div style={{ color: "var(--text-dim, #8ba3be)", fontSize: 11, marginTop: 3 }}>
                  {s.description}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 10, color: "var(--text-dim)" }}>
                <span>{s.transport.toUpperCase()}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
                  {s.url || s.command || "—"}
                </span>
              </div>
              <button onClick={() => deleteServer(s.id)} style={delBtn}>🗑 Delete</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9000,
  display: "flex", alignItems: "center", justifyContent: "center",
};
const panel: CSSProperties = {
  width: 420, maxHeight: "80vh", background: "var(--bg-panel, #1a1a2e)",
  border: "1px solid var(--border, #2a3a52)", borderRadius: 16,
  display: "flex", flexDirection: "column", overflow: "hidden",
};
const header: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "12px 16px", borderBottom: "1px solid var(--border, #2a3a52)",
};
const closeBtn: CSSProperties = {
  background: "none", border: "none", color: "var(--text-dim, #8ba3be)",
  fontSize: 16, cursor: "pointer",
};
const addBtn: CSSProperties = {
  background: "#1a77e0", border: "none", borderRadius: 6,
  padding: "4px 10px", fontSize: 11, color: "#fff", fontWeight: 600, cursor: "pointer",
};
const content: CSSProperties = { flex: 1, overflowY: "auto", padding: 16 };
const serverCard: CSSProperties = {
  background: "var(--bg-card, #1a2235)", borderRadius: 10,
  padding: 10, marginBottom: 8,
};
const statusBadge: CSSProperties = {
  border: "none", borderRadius: 5, padding: "2px 6px",
  fontSize: 10, fontWeight: 600, cursor: "pointer",
};
const delBtn: CSSProperties = {
  background: "none", border: "none", color: "#f87171",
  fontSize: 10, cursor: "pointer", marginTop: 4, padding: 0,
};
const formBody: CSSProperties = {
  flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 6,
};
const fieldLabel: CSSProperties = { color: "var(--text-dim, #8ba3be)", fontSize: 11, marginTop: 6 };
const fieldInput: CSSProperties = {
  background: "var(--bg-card, #1a2235)", border: "1px solid var(--border, #2a3a52)",
  borderRadius: 8, padding: "7px 10px", fontSize: 12,
  color: "var(--text, #f0f6ff)", outline: "none", width: "100%",
};
const trBtn: CSSProperties = {
  flex: 1, background: "var(--bg-card, #1a2235)", border: "1px solid transparent",
  borderRadius: 8, padding: "8px 4px", fontSize: 11, color: "var(--text, #f0f6ff)",
  cursor: "pointer", textAlign: "center",
};
const trBtnActive: CSSProperties = {
  background: "rgba(0,212,255,0.1)", borderColor: "#00d4ff",
};
const submitBtn: CSSProperties = {
  width: "100%", padding: 10, background: "#1a77e0",
  border: "none", borderRadius: 10, color: "#fff", fontSize: 13,
  fontWeight: 600, cursor: "pointer", marginTop: 10,
};
