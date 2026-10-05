import { type CSSProperties, useCallback } from "react";

export interface ChatTab {
  id: string;
  sessionId: string;
  title: string;
  unread: boolean;
}

interface Props {
  tabs: ChatTab[];
  activeTabId: string;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onNew: () => void;
}

export default function TabBar({ tabs, activeTabId, onSelect, onClose, onNew }: Props) {
  const handleMiddleClick = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      if (e.button === 1) {
        e.preventDefault();
        onClose(tabId);
      }
    },
    [onClose],
  );

  return (
    <div style={barStyle}>
      <div style={tabsContainerStyle}>
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              style={{
                ...tabStyle,
                ...(active ? activeTabStyle : {}),
                ...(tab.unread && !active ? unreadTabStyle : {}),
              }}
              onClick={() => onSelect(tab.id)}
              onMouseDown={(e) => handleMiddleClick(e, tab.id)}
              title={tab.title}
            >
              <span style={tabLabelStyle}>{tab.title || "New Chat"}</span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(tab.id);
                  }}
                  style={closeBtnStyle}
                  title="Close tab"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button onClick={onNew} style={newTabBtnStyle} title="New tab (Ctrl+T)">
        ＋
      </button>
    </div>
  );
}

const barStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  background: "var(--bg-dark, #0a0e17)",
  borderBottom: "1px solid var(--border)",
  height: 34,
  padding: "0 4px",
  gap: 2,
  overflow: "hidden",
  flexShrink: 0,
};

const tabsContainerStyle: CSSProperties = {
  display: "flex",
  flex: 1,
  overflow: "hidden",
  gap: 2,
};

const tabStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 10px",
  borderRadius: "6px 6px 0 0",
  cursor: "pointer",
  fontSize: 12,
  color: "var(--text-dim)",
  background: "transparent",
  maxWidth: 160,
  minWidth: 60,
  transition: "background 0.15s, color 0.15s",
  userSelect: "none",
  whiteSpace: "nowrap",
  border: "none",
  position: "relative",
};

const activeTabStyle: CSSProperties = {
  background: "var(--bg-panel, #141926)",
  color: "var(--text, #e0e0e0)",
  fontWeight: 600,
};

const unreadTabStyle: CSSProperties = {
  color: "var(--accent, #6C5CE7)",
};

const tabLabelStyle: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  flex: 1,
  minWidth: 0,
};

const closeBtnStyle: CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: "50%",
  background: "transparent",
  border: "none",
  color: "var(--text-dim)",
  cursor: "pointer",
  fontSize: 13,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  flexShrink: 0,
  opacity: 0.6,
};

const newTabBtnStyle: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: "50%",
  background: "transparent",
  border: "none",
  color: "var(--text-dim)",
  cursor: "pointer",
  fontSize: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  opacity: 0.7,
};
