import type { CSSProperties } from "react";

const overlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "color-mix(in srgb, var(--accent) 16%, transparent)",
  border: "2px dashed var(--accent)",
  borderRadius: "inherit",
  zIndex: 999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
};

export default function DragDropOverlay() {
  return (
    <div style={overlayStyle}>
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--accent)" }}>
        Drop files here to attach
      </div>
    </div>
  );
}