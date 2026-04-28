import type { CSSProperties } from "react";

const containerStyle: CSSProperties = {
  textAlign: "center",
  color: "var(--text-dim)",
  marginTop: 80,
};

export default function EmptyChatState() {
  return (
    <div style={containerStyle}>
      <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>
        Agentrix
      </div>
      <div style={{ fontSize: 13 }}>Ready when you are</div>
    </div>
  );
}