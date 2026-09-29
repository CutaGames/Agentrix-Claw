import { useState, useCallback, useEffect, type CSSProperties } from "react";

interface WikiPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  outgoingLinks: string[];
  tags: string[];
  viewCount: number;
  updatedAt: string;
}

interface GraphNode {
  slug: string;
  title: string;
  linksTo: string[];
  linkedFrom: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function MemoryWikiPanel({ open, onClose }: Props) {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [graph, setGraph] = useState<GraphNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "editor" | "graph">("list");
  const [search, setSearch] = useState("");

  // Editor
  const [editPage, setEditPage] = useState<WikiPage | null>(null);
  const [edTitle, setEdTitle] = useState("");
  const [edContent, setEdContent] = useState("");
  const [edTags, setEdTags] = useState("");
  const [saving, setSaving] = useState(false);

  const token = localStorage.getItem("agentrix_token");

  const fetchPages = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/memory-wiki/pages${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setPages(await res.json());
    } catch {}
    setLoading(false);
  }, [token, search]);

  const fetchGraph = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/memory-wiki/graph", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setGraph(await res.json());
    } catch {}
  }, [token]);

  useEffect(() => {
    if (open) fetchPages();
  }, [open, fetchPages]);

  useEffect(() => {
    if (open && viewMode === "graph") fetchGraph();
  }, [open, viewMode, fetchGraph]);

  const openEditor = (page?: WikiPage) => {
    setEditPage(page ?? null);
    setEdTitle(page?.title ?? "");
    setEdContent(page?.content ?? "");
    setEdTags(page?.tags?.join(", ") ?? "");
    setViewMode("editor");
  };

  const savePage = async () => {
    if (!edTitle.trim() || !token) return;
    setSaving(true);
    try {
      const body = {
        title: edTitle,
        content: edContent,
        tags: edTags.split(",").map((t) => t.trim()).filter(Boolean),
      };
      if (editPage) {
        await fetch(`/memory-wiki/pages/${editPage.slug}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetch("/memory-wiki/pages", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      setViewMode("list");
      await fetchPages();
    } catch {}
    setSaving(false);
  };

  const deletePage = async (slug: string) => {
    if (!token || !confirm("Delete this page?")) return;
    await fetch(`/memory-wiki/pages/${slug}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchPages();
  };

  if (!open) return null;

  // Editor view
  if (viewMode === "editor") {
    return (
      <div style={overlay} onClick={onClose}>
        <div style={panel} onClick={(e) => e.stopPropagation()}>
          <div style={header}>
            <button onClick={() => setViewMode("list")} style={{ ...closeBtn, fontSize: 12 }}>
              ← Back
            </button>
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              {editPage ? "Edit Page" : "New Page"}
            </span>
            <button onClick={savePage} disabled={saving} style={saveBtn}>
              {saving ? "..." : "Save"}
            </button>
          </div>
          <div style={editorBody}>
            <input
              value={edTitle}
              onChange={(e) => setEdTitle(e.target.value)}
              placeholder="Page title..."
              style={titleInput}
            />
            <textarea
              value={edContent}
              onChange={(e) => setEdContent(e.target.value)}
              placeholder="Write with [[wikilinks]]..."
              style={contentInput}
            />
            <input
              value={edTags}
              onChange={(e) => setEdTags(e.target.value)}
              placeholder="Tags (comma separated)"
              style={tagInput}
            />
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
          <span style={{ fontSize: 14, fontWeight: 700 }}>📝 Memory Wiki</span>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        {/* Toolbar */}
        <div style={toolbar}>
          <div style={{ display: "flex", gap: 4 }}>
            {(["list", "graph"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                style={{ ...tabBtn, ...(viewMode === m ? tabBtnActive : {}) }}
              >
                {m === "list" ? "📝 Pages" : "🕸 Graph"}
              </button>
            ))}
          </div>
          <button onClick={() => openEditor()} style={newBtn}>+ New</button>
        </div>

        {/* Search */}
        {viewMode === "list" && (
          <div style={{ padding: "0 12px 8px" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchPages()}
              placeholder="Search pages..."
              style={searchInput}
            />
          </div>
        )}

        {/* Content */}
        <div style={content}>
          {loading && <div style={{ color: "var(--text-dim)", textAlign: "center" }}>Loading...</div>}

          {viewMode === "list" && !loading && pages.map((p) => (
            <div key={p.id} style={pageCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span
                  style={{ color: "var(--text, #f0f6ff)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                  onClick={() => openEditor(p)}
                >
                  📄 {p.title}
                </span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ color: "var(--text-dim)", fontSize: 10 }}>👁 {p.viewCount}</span>
                  <button onClick={() => deletePage(p.slug)} style={delBtn}>🗑</button>
                </div>
              </div>
              <div style={{ color: "var(--text-dim, #8ba3be)", fontSize: 11, marginTop: 3, lineHeight: "16px" }}>
                {highlightWikilinks(p.content.slice(0, 120))}
                {p.content.length > 120 ? "..." : ""}
              </div>
              {p.outgoingLinks.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                  {p.outgoingLinks.slice(0, 4).map((l, i) => (
                    <span key={i} style={linkBadge}>🔗 {l}</span>
                  ))}
                </div>
              )}
              {p.tags.length > 0 && (
                <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
                  {p.tags.map((t, i) => (
                    <span key={i} style={{ color: "var(--text-dim)", fontSize: 10 }}>#{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {viewMode === "graph" && !loading && graph.map((n) => (
            <div key={n.slug} style={graphNode}>
              <span style={{ color: "var(--text, #f0f6ff)", fontSize: 12, fontWeight: 600 }}>
                📄 {n.title}
              </span>
              <span style={{ color: "#00d4ff", fontSize: 11 }}>
                → {n.linksTo.length} | ← {n.linkedFrom.length}
              </span>
            </div>
          ))}

          {!loading && viewMode === "list" && pages.length === 0 && (
            <div style={{ color: "var(--text-dim)", textAlign: "center", marginTop: 20 }}>
              No wiki pages yet. Create your first page!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function highlightWikilinks(text: string) {
  const parts = text.split(/(\[\[[^\]]+\]\])/g);
  return parts.map((part, i) =>
    part.startsWith("[[") ? (
      <span key={i} style={{ color: "#00d4ff", fontWeight: 600 }}>{part}</span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

const overlay: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9000,
  display: "flex", alignItems: "center", justifyContent: "center",
};
const panel: CSSProperties = {
  width: 440, maxHeight: "85vh", background: "var(--bg-panel, #1a1a2e)",
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
const toolbar: CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "8px 12px", borderBottom: "1px solid var(--border, #2a3a52)",
};
const tabBtn: CSSProperties = {
  background: "none", border: "1px solid transparent", borderRadius: 8,
  padding: "5px 10px", fontSize: 11, color: "var(--text-dim, #8ba3be)",
  cursor: "pointer", transition: "all 0.2s",
};
const tabBtnActive: CSSProperties = {
  background: "rgba(0,212,255,0.1)", borderColor: "rgba(0,212,255,0.3)",
  color: "#00d4ff", fontWeight: 600,
};
const newBtn: CSSProperties = {
  background: "#1a77e0", border: "none", borderRadius: 6,
  padding: "5px 10px", fontSize: 11, color: "#fff",
  fontWeight: 600, cursor: "pointer",
};
const searchInput: CSSProperties = {
  width: "100%", background: "var(--bg-card, #1a2235)",
  border: "1px solid var(--border, #2a3a52)", borderRadius: 8,
  padding: "7px 10px", fontSize: 12, color: "var(--text, #f0f6ff)",
  outline: "none",
};
const content: CSSProperties = {
  flex: 1, overflowY: "auto", padding: 12,
};
const pageCard: CSSProperties = {
  background: "var(--bg-card, #1a2235)", borderRadius: 10,
  padding: 10, marginBottom: 8,
};
const delBtn: CSSProperties = {
  background: "none", border: "none", cursor: "pointer", fontSize: 11,
};
const linkBadge: CSSProperties = {
  background: "rgba(0,212,255,0.08)", padding: "1px 5px",
  borderRadius: 4, fontSize: 9, color: "#00d4ff",
};
const graphNode: CSSProperties = {
  background: "var(--bg-card, #1a2235)", borderRadius: 8,
  padding: 10, marginBottom: 6,
  display: "flex", justifyContent: "space-between", alignItems: "center",
};
const saveBtn: CSSProperties = {
  background: "#1a77e0", border: "none", borderRadius: 6,
  padding: "5px 12px", fontSize: 12, color: "#fff",
  fontWeight: 600, cursor: "pointer",
};
const editorBody: CSSProperties = {
  flex: 1, overflowY: "auto", padding: 16,
  display: "flex", flexDirection: "column", gap: 10,
};
const titleInput: CSSProperties = {
  background: "var(--bg-card, #1a2235)", border: "1px solid var(--border, #2a3a52)",
  borderRadius: 8, padding: "8px 10px", fontSize: 16, fontWeight: 700,
  color: "var(--text, #f0f6ff)", outline: "none",
};
const contentInput: CSSProperties = {
  background: "var(--bg-card, #1a2235)", border: "1px solid var(--border, #2a3a52)",
  borderRadius: 8, padding: 10, fontSize: 13, lineHeight: "20px",
  color: "var(--text, #f0f6ff)", outline: "none", minHeight: 200, resize: "vertical",
};
const tagInput: CSSProperties = {
  background: "var(--bg-card, #1a2235)", border: "1px solid var(--border, #2a3a52)",
  borderRadius: 8, padding: "6px 10px", fontSize: 12,
  color: "var(--text, #f0f6ff)", outline: "none",
};
