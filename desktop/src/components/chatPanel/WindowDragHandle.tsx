import type { CSSProperties, MouseEvent } from "react";

type Props = {
  onMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
  onDoubleClick: (event: MouseEvent<HTMLDivElement>) => void;
};

const dragHandleStyle: CSSProperties = {
  height: 40,
  width: "100%",
  cursor: "grab",
  WebkitAppRegion: "drag",
  background: "var(--bg-panel)",
  borderBottom: "1px solid var(--border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const gripStyle: CSSProperties = {
  width: 88,
  height: 6,
  borderRadius: 999,
  background: "linear-gradient(90deg, transparent, var(--text-dim), transparent)",
  opacity: 0.7,
};

export default function WindowDragHandle({ onMouseDown, onDoubleClick }: Props) {
  return (
    <div
      data-tauri-drag-region
      title="Drag window"
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      style={dragHandleStyle}
    >
      <div data-tauri-drag-region style={gripStyle} />
    </div>
  );
}