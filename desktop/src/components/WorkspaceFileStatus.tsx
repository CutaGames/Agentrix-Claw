import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { GitFileChange } from "../services/git";
import { gitDiff } from "../services/git";
import DiffView from "./DiffView";
import type { WorkspaceFileBackup } from "../services/workspaceBackups";

interface Props {
  changes: GitFileChange[];
  backups?: Record<string, WorkspaceFileBackup>;
  onRevert?: (filePath: string) => void | Promise<void>;
}

export default function WorkspaceFileStatus({
  changes,
  backups = {},
  onRevert,
}: Props) {
  const [selectedPath, setSelectedPath] = useState<string | null>(changes[0]?.file || null);
  const [diffByPath, setDiffByPath] = useState<Record<string, string>>({});
  const [loadingPath, setLoadingPath] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPath || !changes.some((change) => change.file === selectedPath)) {
      setSelectedPath(changes[0]?.file || null);
    }
  }, [changes, selectedPath]);

  useEffect(() => {
    if (!selectedPath || diffByPath[selectedPath] !== undefined) {
      return;
    }

    const backup = backups[selectedPath];
    if (backup?.diffPreview?.trim()) {
      setDiffByPath((prev) => ({ ...prev, [selectedPath]: backup.diffPreview || "" }));
      return;
    }

    let cancelled = false;
    setLoadingPath(selectedPath);
    void gitDiff(false, selectedPath)
      .then((diff) => {
        if (cancelled) return;
        setDiffByPath((prev) => ({
          ...prev,
          [selectedPath]: diff || backup?.diffPreview || "",
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setDiffByPath((prev) => ({
          ...prev,
          [selectedPath]: backup?.diffPreview || "",
        }));
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingPath((current) => (current === selectedPath ? null : current));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [backups, diffByPath, selectedPath]);

  const selectedDiff = selectedPath ? diffByPath[selectedPath] : "";
  const selectedBackup = selectedPath ? backups[selectedPath] : undefined;
  const selectedChange = useMemo(
    () => changes.find((change) => change.file === selectedPath) || null,
    [changes, selectedPath],
  );

  if (changes.length === 0) {
    return null;
  }

  return (
    <div style={shellStyle}>
      <div style={listStyle}>
        {changes.map((change) => {
          const active = change.file === selectedPath;
          const backup = backups[change.file];
          return (
            <button
              key={`${change.status}-${change.file}`}
              onClick={() => setSelectedPath(change.file)}
              style={{
                ...itemStyle,
                borderColor: active ? "rgba(125,211,252,0.3)" : "rgba(255,255,255,0.06)",
                background: active ? "rgba(125,211,252,0.08)" : "rgba(255,255,255,0.03)",
              }}
            >
              <div style={itemTopStyle}>
                <span style={statusChipStyle}>{change.status}</span>
                {backup && <span style={backupChipStyle}>Undo ready</span>}
              </div>
              <div style={pathStyle}>{change.file}</div>
            </button>
          );
        })}
      </div>
      <div style={detailStyle}>
        {selectedChange ? (
          <>
            <div style={detailHeaderStyle}>
              <div>
                <div style={detailEyebrowStyle}>Workspace Diff</div>
                <div style={detailTitleStyle}>{selectedChange.file}</div>
              </div>
              {selectedBackup && onRevert && (
                <button onClick={() => void onRevert(selectedChange.file)} style={revertButtonStyle}>
                  Undo
                </button>
              )}
            </div>
            {loadingPath === selectedPath ? (
              <div style={emptyStyle}>Loading diff…</div>
            ) : selectedDiff ? (
              <DiffView diff={selectedDiff} fileName={selectedChange.file} defaultCollapsed={false} />
            ) : (
              <div style={emptyStyle}>No diff preview is available for this file yet.</div>
            )}
          </>
        ) : (
          <div style={emptyStyle}>Select a file to inspect the inline diff.</div>
        )}
      </div>
    </div>
  );
}

const shellStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 0.85fr) minmax(0, 1.35fr)",
  gap: 12,
  minWidth: 0,
};

const listStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minWidth: 0,
};

const itemStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.06)",
  padding: "10px 12px",
  cursor: "pointer",
  textAlign: "left",
};

const itemTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const statusChipStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  borderRadius: 999,
  padding: "3px 7px",
  border: "1px solid rgba(125,211,252,0.2)",
  color: "#7dd3fc",
};

const backupChipStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  borderRadius: 999,
  padding: "3px 7px",
  border: "1px solid rgba(134,239,172,0.24)",
  color: "#86efac",
};

const pathStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  color: "#e2e8f0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const detailStyle: CSSProperties = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const detailHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const detailEyebrowStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#7dd3fc",
  textTransform: "uppercase",
  letterSpacing: 0.8,
};

const detailTitleStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 14,
  fontWeight: 700,
  color: "#f8fafc",
};

const revertButtonStyle: CSSProperties = {
  border: "1px solid rgba(134,239,172,0.28)",
  borderRadius: 999,
  padding: "8px 12px",
  background: "rgba(134,239,172,0.1)",
  color: "#bbf7d0",
  fontWeight: 700,
  cursor: "pointer",
};

const emptyStyle: CSSProperties = {
  borderRadius: 12,
  padding: "14px 16px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  fontSize: 12,
  color: "#94a3b8",
};