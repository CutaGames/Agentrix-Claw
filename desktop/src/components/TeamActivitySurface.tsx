/**
 * TeamActivitySurface — Simple Mode full-screen view of pet team
 * activity. NO technical fields (no agent_id / branch / file path /
 * USD / errorMessage). R5.2, R5.4 R5.5.
 *
 * Spec: multi-agent-collaboration-2026-06 W1.8
 * Design: §9.2
 */
import type { CSSProperties } from "react";

import { useTeamSimplifiedSubTasks, useActiveSubTasksCount } from "../services/teamActivityStore";

interface Props {
  open: boolean;
  onClose: () => void;
  onAskLeaderForUpdate?: () => void;
}

export default function TeamActivitySurface({
  open,
  onClose,
  onAskLeaderForUpdate,
}: Props) {
  const activeCount = useActiveSubTasksCount();
  const subTasks = useTeamSimplifiedSubTasks();

  if (!open) return null;

  const totalProgress =
    subTasks.length > 0
      ? Math.round(subTasks.reduce((acc, s) => acc + s.progress, 0) / subTasks.length)
      : 0;

  return (
    <div role="dialog" aria-modal style={surfaceStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>
          🦊 阿喵 + {Math.max(0, activeCount - 1)} 个伙伴在帮你忙
        </h1>
        <button type="button" onClick={onClose} style={closeBtnStyle} aria-label="close">
          ×
        </button>
      </header>

      <div style={progressBarOuterStyle}>
        <div style={{ ...progressBarInnerStyle, width: `${totalProgress}%` }} />
      </div>
      <div style={progressLabelStyle}>整体进度 {totalProgress}%</div>

      <ul style={listStyle}>
        {subTasks.length === 0 && (
          <li style={emptyStyle}>团队休息中,有什么我帮你的?</li>
        )}
        {subTasks.map((sub) => (
          <li key={sub.hashedId} style={itemStyle}>
            <span style={itemEmojiStyle}>{sub.emoji}</span>
            <div style={itemBodyStyle}>
              <div style={itemPetStyle}>{sub.petName}</div>
              <div style={itemStatusStyle}>{sub.plainStatus}</div>
              <div style={itemProgressBarOuterStyle}>
                <div
                  style={{ ...itemProgressBarInnerStyle, width: `${sub.progress}%` }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>

      {onAskLeaderForUpdate && (
        <button type="button" onClick={onAskLeaderForUpdate} style={askButtonStyle}>
          请阿喵汇报进度
        </button>
      )}
    </div>
  );
}

const surfaceStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--bg-app)",
  zIndex: 1500,
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const titleStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  margin: 0,
  color: "var(--text)",
};

const closeBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  fontSize: 26,
  color: "var(--text-muted)",
  cursor: "pointer",
};

const progressBarOuterStyle: CSSProperties = {
  height: 8,
  borderRadius: 999,
  background: "var(--bg-overlay-medium)",
  overflow: "hidden",
};

const progressBarInnerStyle: CSSProperties = {
  height: "100%",
  background: "var(--accent)",
  transition: "width 400ms ease",
};

const progressLabelStyle: CSSProperties = {
  textAlign: "center",
  fontSize: 13,
  color: "var(--text-muted)",
};

const listStyle: CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  flex: 1,
  overflowY: "auto",
};

const emptyStyle: CSSProperties = {
  textAlign: "center",
  color: "var(--text-muted)",
  padding: "40px 0",
};

const itemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: 12,
  borderRadius: 12,
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
};

const itemEmojiStyle: CSSProperties = {
  fontSize: 36,
  flexShrink: 0,
};

const itemBodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  flex: 1,
};

const itemPetStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: "var(--text)",
};

const itemStatusStyle: CSSProperties = {
  fontSize: 13,
  color: "var(--text-muted)",
};

const itemProgressBarOuterStyle: CSSProperties = {
  height: 4,
  borderRadius: 999,
  background: "var(--bg-overlay-medium)",
  overflow: "hidden",
};

const itemProgressBarInnerStyle: CSSProperties = {
  height: "100%",
  background: "var(--tone-success-text)",
  transition: "width 400ms ease",
};

const askButtonStyle: CSSProperties = {
  padding: "12px 16px",
  borderRadius: 999,
  background: "var(--accent)",
  color: "var(--text-on-accent)",
  border: "none",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};
