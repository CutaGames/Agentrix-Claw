import { type CSSProperties } from "react";
import type { ProactiveSuggestion, WorkflowTemplate } from "../services/proactive";

interface Props {
  suggestions: ProactiveSuggestion[];
  templates: WorkflowTemplate[];
  onSuggestionSelect: (prompt: string) => void;
  onSuggestionDismiss: (signature: string) => void;
  onTemplateSelect: (prompt: string) => void;
  contextFreshnessLabel?: string;
}

export default function ProactivePanel({
  suggestions,
  templates,
  onSuggestionSelect,
  onSuggestionDismiss,
  onTemplateSelect,
  contextFreshnessLabel,
}: Props) {
  if (suggestions.length === 0 && templates.length === 0) {
    return null;
  }

  return (
    <div style={container}>
      {suggestions.length > 0 && (
        <div style={section}>
          <div style={sectionHeader}>
            <div style={sectionLabel}>Suggested Next</div>
            {contextFreshnessLabel ? <div style={freshnessText}>Context {contextFreshnessLabel}</div> : null}
          </div>
          <div style={cardRow}>
            {suggestions.map((suggestion) => (
              <div key={suggestion.signature} style={suggestionCard} title={suggestion.reason}>
                <button
                  onClick={() => onSuggestionSelect(suggestion.prompt)}
                  style={primaryChip}
                >
                  {suggestion.title}
                </button>
                <div style={metaRow}>
                  <span style={metaText}>{suggestion.freshnessLabel}</span>
                  <button
                    onClick={() => onSuggestionDismiss(suggestion.signature)}
                    style={dismissBtn}
                    title="Dismiss this suggestion until context changes"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {templates.length > 0 && (
        <div style={section}>
          <div style={sectionLabel}>Workflow Templates</div>
          <div style={chipRow}>
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => onTemplateSelect(template.prompt)}
                style={secondaryChip}
              >
                {template.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const container: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const section: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const sectionHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const sectionLabel: CSSProperties = {
  fontSize: 11,
  color: "var(--text-dim)",
  textTransform: "uppercase",
  letterSpacing: 0.6,
};

const chipRow: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const cardRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 8,
};

const baseChip: CSSProperties = {
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
};

const primaryChip: CSSProperties = {
  ...baseChip,
  border: "1px solid rgba(125,211,252,0.28)",
  background: "rgba(125,211,252,0.1)",
  color: "var(--accent-card-action)",
  textAlign: "left",
};

const secondaryChip: CSSProperties = {
  ...baseChip,
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  color: "var(--text)",
};

const suggestionCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 8,
  borderRadius: 12,
  background: "var(--bg-card)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const metaRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
};

const metaText: CSSProperties = {
  fontSize: 11,
  color: "var(--text-dim)",
};

const dismissBtn: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--text-dim)",
  fontSize: 11,
  cursor: "pointer",
  padding: 0,
};

const freshnessText: CSSProperties = {
  fontSize: 11,
  color: "var(--text-dim)",
};