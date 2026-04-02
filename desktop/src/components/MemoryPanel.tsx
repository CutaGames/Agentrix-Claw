import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { apiFetch, API_BASE } from "../services/store";

type MemoryLayer = "session" | "agent" | "user" | "knowledge";

interface MemoryEntry {
  id: string;
  content: string;
  layer: MemoryLayer;
  createdAt: string;
  updatedAt?: string;
  source?: string;
}

interface KnowledgeFile {
  id: string;
  originalName: string;
  size: number;
  createdAt: string;
  chunkCount?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  token: string | null;
  sessionId?: string;
}

const LAYER_META: Record<MemoryLayer, { emoji: string; label: string; description: string }> = {
  session: { emoji: "💬", label: "Session", description: "Current conversation context" },
  agent: { emoji: "🤖", label: "Agent", description: "Long-term agent preferences & knowledge" },
  user: { emoji: "👤", label: "User", description: "Cross-agent user profile" },
  knowledge: { emoji: "📚", label: "Knowledge Base", description: "Uploaded documents & RAG" },
};

export default function MemoryPanel({ open, onClose, token, sessionId }: Props) {
  const [activeLayer, setActiveLayer] = useState<MemoryLayer>("agent");
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchMemories = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      if (activeLayer === "knowledge") {
        const res = await apiFetch(`${API_BASE}/ai-rag/knowledge`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setKnowledgeFiles(Array.isArray(data) ? data : data?.files || []);
        }
      } else {
        // Fetch memory entries by layer
        const url = `${API_BASE}/ai-rag/memory/preferences?layer=${activeLayer}${sessionId ? `&sessionId=${sessionId}` : ""}`;
        const res = await apiFetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setEntries(Array.isArray(data) ? data : data?.entries || data?.preferences || []);
        } else {
          setEntries([]);
        }
      }
    } catch {
      setEntries([]);
      setKnowledgeFiles([]);
    }
    setLoading(false);
  }, [token, activeLayer, sessionId]);

  useEffect(() => {
    if (open) fetchMemories();
  }, [open, fetchMemories]);

  const handleUploadKnowledge = useCallback(async (file: File) => {
    if (!token) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await apiFetch(`${API_BASE}/ai-rag/knowledge`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData as any,
      });
      if (res.ok) {
        fetchMemories();
      }
    } catch {}
  }, [token, fetchMemories]);

  const handleDeleteKnowledge = useCallback(async (id: string) => {
    if (!token) return;
    try {
      await apiFetch(`${API_BASE}/ai-rag/knowledge/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setKnowledgeFiles((prev) => prev.filter((f) => f.id !== id));
    } catch {}
  }, [token]);

  if (!open) return null;

  const freshness = (dateStr: string) => {
    const age = Date.now() - new Date(dateStr).getTime();
    if (age < 3600_000) return { label: "Fresh", color: "#86efac" };
    if (age < 86400_000) return { label: "Today", color: "#7dd3fc" };
    if (age < 604800_000) return { label: "This week", color: "#fbbf24" };
    return { label: "Older", color: "var(--text-dim)" };
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={header}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>🧠 Memory Management</span>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        {/* Layer tabs */}
        <div style={layerBar}>
          {(Object.keys(LAYER_META) as MemoryLayer[]).map((layer) => {
            const meta = LAYER_META[layer];
            const active = layer === activeLayer;
            return (
              <button
                key={layer}
                onClick={() => setActiveLayer(layer)}
                style={{ ...layerBtn, ...(active ? layerBtnActive : {}) }}
                title={meta.description}
              >
                {meta.emoji} {meta.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div style={content}>
          {loading && <div style={emptyText}>Loading...</div>}

          {/* Knowledge Base layer */}
          {!loading && activeLayer === "knowledge" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={uploadBtn}
              >
                📤 Upload Document
              </button>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                accept=".md,.txt,.pdf,.csv,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadKnowledge(file);
                  e.target.value = "";
                }}
              />
              {knowledgeFiles.length === 0 ? (
                <div style={emptyText}>No knowledge files uploaded yet. Upload .md, .txt, or .pdf files.</div>
              ) : (
                knowledgeFiles.map((file) => {
                  const f = freshness(file.createdAt);
                  return (
                    <div key={file.id} style={entryRow}>
                      <span style={{ fontSize: 14 }}>📄</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {file.originalName}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
                          {formatBytes(file.size)}{file.chunkCount ? ` · ${file.chunkCount} chunks` : ""}
                        </div>
                      </div>
                      <span style={{ fontSize: 9, color: f.color, flexShrink: 0 }}>{f.label}</span>
                      <button
                        onClick={() => handleDeleteKnowledge(file.id)}
                        style={{ ...closeBtn, fontSize: 12 }}
                        title="Delete"
                      >
                        🗑
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Memory entries for session/agent/user layers */}
          {!loading && activeLayer !== "knowledge" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>
                {LAYER_META[activeLayer].description}
              </div>
              {entries.length === 0 ? (
                <div style={emptyText}>No {LAYER_META[activeLayer].label.toLowerCase()} memories found</div>
              ) : (
                entries.map((entry) => {
                  const f = freshness(entry.updatedAt || entry.createdAt);
                  return (
                    <div key={entry.id} style={entryRow}>
                      <span style={{ fontSize: 14 }}>{LAYER_META[activeLayer].emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 12, lineHeight: 1.4,
                          overflow: "hidden", display: "-webkit-box",
                          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                        }}>
                          {entry.content}
                        </div>
                        {entry.source && (
                          <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>via {entry.source}</div>
                        )}
                      </div>
                      <span style={{ fontSize: 9, color: f.color, flexShrink: 0 }}>{f.label}</span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  zIndex: 9000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const panel: CSSProperties = {
  width: 400,
  maxHeight: "80vh",
  background: "var(--bg-panel, #16213e)",
  border: "1px solid var(--border, rgba(255,255,255,0.08))",
  borderRadius: 16,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
};

const header: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: "1px solid var(--border)",
};

const closeBtn: CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-dim)",
  fontSize: 16,
  cursor: "pointer",
};

const layerBar: CSSProperties = {
  display: "flex",
  gap: 4,
  padding: "8px 12px",
  borderBottom: "1px solid var(--border)",
  overflowX: "auto",
};

const layerBtn: CSSProperties = {
  background: "none",
  border: "1px solid transparent",
  borderRadius: 8,
  padding: "5px 8px",
  fontSize: 11,
  color: "var(--text-dim)",
  cursor: "pointer",
  transition: "all 0.2s",
  whiteSpace: "nowrap",
};

const layerBtnActive: CSSProperties = {
  background: "rgba(108,92,231,0.15)",
  borderColor: "rgba(108,92,231,0.3)",
  color: "#a78bfa",
  fontWeight: 600,
};

const content: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 16,
};

const entryRow: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid var(--border)",
};

const uploadBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px dashed rgba(108,92,231,0.4)",
  background: "rgba(108,92,231,0.08)",
  color: "#a78bfa",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  textAlign: "center",
  transition: "background 0.2s",
};

const emptyText: CSSProperties = {
  fontSize: 12,
  color: "var(--text-dim)",
  textAlign: "center",
  padding: 24,
};
