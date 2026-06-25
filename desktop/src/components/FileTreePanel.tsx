import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { listWorkspaceDir, readWorkspaceFile, type FileEntry } from "../services/workspace";

interface Props {
  workspaceDir: string | null;
  onFileSelect: (relativePath: string, content: string) => void;
  onClose: () => void;
}

interface TreeNode extends FileEntry {
  path: string;
  children?: TreeNode[];
  expanded?: boolean;
  loading?: boolean;
}

export default function FileTreePanel({ workspaceDir, onFileSelect, onClose }: Props) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const loadDir = useCallback(async (relativePath: string): Promise<TreeNode[]> => {
    const entries = await listWorkspaceDir(relativePath);
    return entries
      .sort((a, b) => {
        if (a.is_dir && !b.is_dir) return -1;
        if (!a.is_dir && b.is_dir) return 1;
        return a.name.localeCompare(b.name);
      })
      .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "__pycache__" && e.name !== "dist" && e.name !== "build")
      .map((e) => ({
        ...e,
        path: relativePath ? `${relativePath}/${e.name}` : e.name,
        children: e.is_dir ? undefined : undefined,
        expanded: false,
      }));
  }, []);

  useEffect(() => {
    if (!workspaceDir) return;
    setLoading(true);
    setError(null);
    loadDir("")
      .then(setTree)
      .catch((err) => setError(err?.message || "Failed to load workspace"))
      .finally(() => setLoading(false));
  }, [workspaceDir, loadDir]);

  const toggleDir = useCallback(async (path: string) => {
    const updateNode = (nodes: TreeNode[]): TreeNode[] =>
      nodes.map((node) => {
        if (node.path === path && node.is_dir) {
          if (node.expanded) {
            return { ...node, expanded: false };
          }
          if (node.children) {
            return { ...node, expanded: true };
          }
          // Need to load
          return { ...node, loading: true };
        }
        if (node.children) {
          return { ...node, children: updateNode(node.children) };
        }
        return node;
      });

    setTree((prev) => updateNode(prev));

    // Load children
    try {
      const children = await loadDir(path);
      const insertChildren = (nodes: TreeNode[]): TreeNode[] =>
        nodes.map((node) => {
          if (node.path === path) {
            return { ...node, children, expanded: true, loading: false };
          }
          if (node.children) {
            return { ...node, children: insertChildren(node.children) };
          }
          return node;
        });
      setTree((prev) => insertChildren(prev));
    } catch {
      const clearLoading = (nodes: TreeNode[]): TreeNode[] =>
        nodes.map((node) => {
          if (node.path === path) return { ...node, loading: false };
          if (node.children) return { ...node, children: clearLoading(node.children) };
          return node;
        });
      setTree((prev) => clearLoading(prev));
    }
  }, [loadDir]);

  const handleFileClick = useCallback(async (path: string) => {
    setSelectedPath(path);
    try {
      const content = await readWorkspaceFile(path);
      onFileSelect(path, content);
    } catch (err: any) {
      onFileSelect(path, `// Error reading file: ${err?.message || err}`);
    }
  }, [onFileSelect]);

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isSelected = node.path === selectedPath;
    const icon = node.is_dir
      ? node.expanded ? "📂" : "📁"
      : getFileIcon(node.name);

    return (
      <div key={node.path}>
        <div
          onClick={() => node.is_dir ? toggleDir(node.path) : handleFileClick(node.path)}
          style={{
            ...fileRow,
            paddingLeft: 12 + depth * 16,
            background: isSelected ? "rgba(108,92,231,0.15)" : "transparent",
            borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
          }}
          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--bg-card)"; }}
          onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
        >
          <span style={{ fontSize: 13, flexShrink: 0 }}>{node.loading ? "⏳" : icon}</span>
          <span style={{
            fontSize: 12,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: node.is_dir ? "var(--text)" : "var(--text-dim)",
            fontWeight: node.is_dir ? 500 : 400,
          }}>
            {node.name}
          </span>
          {!node.is_dir && (
            <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: "auto", flexShrink: 0 }}>
              {formatSize(node.size)}
            </span>
          )}
        </div>
        {node.expanded && node.children && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  if (!workspaceDir) {
    return (
      <div style={container}>
        <div style={header}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Files</span>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ padding: 20, textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
          No workspace selected.<br />Go to Settings to set one.
        </div>
      </div>
    );
  }

  return (
    <div style={container}>
      <div style={header}>
        <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          📁 {workspaceDir.split(/[/\\]/).pop()}
        </span>
        <button onClick={onClose} style={closeBtnStyle}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && <div style={{ padding: 20, textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>Loading...</div>}
        {error && <div style={{ padding: 12, fontSize: 11, color: "#f87171" }}>{error}</div>}
        {!loading && !error && tree.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>Empty directory</div>
        )}
        {tree.map((node) => renderNode(node))}
      </div>
    </div>
  );
}

function getFileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const icons: Record<string, string> = {
    ts: "🟦", tsx: "⚛️", js: "🟨", jsx: "⚛️",
    py: "🐍", rs: "🦀", go: "🔵", java: "☕",
    json: "📋", yaml: "📋", yml: "📋", toml: "📋",
    md: "📝", txt: "📄", html: "🌐", css: "🎨",
    svg: "🖼️", png: "🖼️", jpg: "🖼️", jpeg: "🖼️",
    sql: "🗃️", sh: "⚡", dockerfile: "🐳",
  };
  return icons[ext] || "📄";
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

const container: CSSProperties = {
  position: "absolute",
  top: 52,
  left: 0,
  bottom: 0,
  width: 240,
  background: "var(--bg-panel)",
  borderRight: "1px solid var(--border)",
  borderTop: "1px solid var(--border)",
  display: "flex",
  flexDirection: "column",
  zIndex: 40,
};

const header: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
  gap: 8,
};

const closeBtnStyle: CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: "50%",
  background: "transparent",
  color: "var(--text-dim)",
  border: "none",
  cursor: "pointer",
  fontSize: 11,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const fileRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 12px",
  cursor: "pointer",
  transition: "background 0.1s",
  userSelect: "none",
};
