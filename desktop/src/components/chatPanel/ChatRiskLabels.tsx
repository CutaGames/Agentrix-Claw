import type { CSSProperties } from "react";
import { describeContextWithheld, describeRiskLabel, useChatRiskLabels } from "./chatRiskLabelStore";

/** The two small labels under an assistant reply. Renders nothing when the server sent neither. */
export default function ChatRiskLabels({ messageId }: { messageId: string }) {
  const { riskLabel, contextWithheld } = useChatRiskLabels(messageId);
  if (!riskLabel && !contextWithheld) return null;
  return (
    <div style={box}>
      {contextWithheld && (
        <div style={hint} data-testid="chat-context-withheld">
          {describeContextWithheld(contextWithheld)}
        </div>
      )}
      {riskLabel && (
        <div style={{ ...hint, color: "var(--tone-warning-text, #d97706)" }} data-testid="chat-risk-label">
          {describeRiskLabel(riskLabel)}
        </div>
      )}
    </div>
  );
}

const box: CSSProperties = { display: "grid", gap: 2, marginTop: -4 };
const hint: CSSProperties = { fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 };
