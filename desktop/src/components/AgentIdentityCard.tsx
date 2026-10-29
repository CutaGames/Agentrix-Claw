/**
 * AgentIdentityCard — small badge showing an agent's avatar + name +
 * role + status dot. Used in:
 *   - AgentTeamPanel members grid (size=md)
 *   - WorktreePanel lane row (size=sm)
 *   - AgentTeamPanel Leader card (size=lg)
 *
 * Spec: multi-agent-collaboration-2026-06 W1.4
 * Design: §5.2, §6.3
 */
import { useEffect, useState, type CSSProperties } from "react";

import { fetchAgentIdentity, getCachedAgentIdentity, type AgentIdentity } from "../services/agentIdentity";

export type IdentityCardSize = "sm" | "md" | "lg";
export type IdentityCardStatus = "idle" | "running" | "done" | "error";
export type IdentityCardMode = "simple" | "standard" | "pro";

interface Props {
  agentId: string;
  /** Override the resolved identity (skip fetch). Useful in tests. */
  identity?: AgentIdentity | null;
  size?: IdentityCardSize;
  status?: IdentityCardStatus;
  mode?: IdentityCardMode;
  onClick?: () => void;
  onEdit?: () => void;
  style?: CSSProperties;
}

const SIZE_PX: Record<IdentityCardSize, { avatar: number; gap: number; font: number }> = {
  sm: { avatar: 16, gap: 6, font: 11 },
  md: { avatar: 32, gap: 8, font: 13 },
  lg: { avatar: 48, gap: 12, font: 16 },
};

const STATUS_COLOR: Record<IdentityCardStatus, string> = {
  idle: "var(--text-dim)",
  running: "var(--tone-info-text)",
  done: "var(--tone-success-text)",
  error: "var(--tone-danger-text)",
};

function deriveAvatarEmoji(identity: AgentIdentity | null): string {
  if (!identity) return "🤖";
  // Prefer first emoji char if displayName starts with one
  const first = Array.from(identity.displayName ?? "")[0];
  if (first && /\p{Emoji}/u.test(first)) return first;
  // Default per role
  switch ((identity.role ?? "").toLowerCase()) {
    case "ceo":
      return "🦊";
    case "dev":
    case "coder":
      return "🐶";
    case "qa":
    case "qa_ops":
    case "qa-ops":
    case "reviewer":
      return "🐱";
    case "growth":
      return "🐰";
    case "ops":
      return "🦝";
    case "media":
      return "🐼";
    case "ecosystem":
      return "🦔";
    case "community":
      return "🐯";
    case "brand":
      return "🐻";
    case "hunter":
      return "🦅";
    case "treasury":
      return "🦉";
    default:
      return "🤖";
  }
}

export default function AgentIdentityCard({
  agentId,
  identity: identityProp,
  size = "md",
  status = "idle",
  mode = "standard",
  onClick,
  onEdit,
  style,
}: Props) {
  const [identity, setIdentity] = useState<AgentIdentity | null>(
    identityProp ?? getCachedAgentIdentity(agentId),
  );

  useEffect(() => {
    if (identityProp !== undefined) {
      setIdentity(identityProp);
      return;
    }
    let cancelled = false;
    void fetchAgentIdentity(agentId).then((r) => {
      if (!cancelled) setIdentity(r);
    });
    return () => {
      cancelled = true;
    };
  }, [agentId, identityProp]);

  const dims = SIZE_PX[size];
  const emoji = deriveAvatarEmoji(identity);
  const name = identity?.displayName ?? agentId.slice(0, 8);
  const role = identity?.role;

  const containerStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: dims.gap,
    padding: size === "lg" ? "10px 12px" : size === "md" ? "6px 10px" : "2px 6px",
    borderRadius: 8,
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    cursor: onClick ? "pointer" : "default",
    fontSize: dims.font,
    color: "var(--text)",
    maxWidth: size === "lg" ? "100%" : 220,
    ...style,
  };

  const avatarStyle: CSSProperties = {
    width: dims.avatar,
    height: dims.avatar,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: dims.avatar * 0.7,
    flexShrink: 0,
  };

  const dotStyle: CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: STATUS_COLOR[status],
    boxShadow: status === "running" ? `0 0 6px ${STATUS_COLOR.running}` : "none",
    flexShrink: 0,
  };

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
      style={containerStyle}
      data-agent-id={agentId}
      data-status={status}
      data-mode={mode}
    >
      <span style={avatarStyle} aria-hidden>{emoji}</span>
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span
          style={{
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: size === "lg" ? 240 : 140,
          }}
          title={name}
        >
          {name}
        </span>
        {role && size !== "sm" && (
          <span style={{ fontSize: dims.font - 2, color: "var(--text-muted)" }}>
            {role}
          </span>
        )}
      </span>
      <span style={dotStyle} aria-label={`status:${status}`} />
      {mode === "pro" && onEdit && size !== "sm" && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          style={{
            border: "1px solid var(--border)",
            background: "var(--bg-overlay-light)",
            color: "var(--text)",
            padding: "2px 8px",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: dims.font - 2,
          }}
        >
          Edit
        </button>
      )}
    </div>
  );
}
