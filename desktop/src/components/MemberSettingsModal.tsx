/**
 * MemberSettingsModal — Pro-Mode editor for an AgentTeam member.
 *
 * Spec: multi-agent-collaboration-2026-06 W3.6
 * Design: §10.1, §10.2, §10.3, §10.4, §10.5
 *
 * Lets the user edit:
 *   - role tag (free-form, max 30 chars)
 *   - displayName
 *   - dailyBudgetUsd (capped by subscription tier)
 *   - workspace path globs
 *   - tool whitelist (subset of leader scope)
 *   - status (active / paused)
 *
 * Tier caps (R8.7):
 *   - Free:     $2 / day per member
 *   - Pro:      $20 / day per member
 *   - Business: $200 / day per member
 *
 * Backend PATCH `/api/v1/pet/team/:memberId` enforces the cap regardless
 * of what the client sends (defense-in-depth).
 */
import { useEffect, useState, type CSSProperties } from "react";

import { API_BASE, useAuthStore } from "../services/store";

export type SubscriptionTier = "free" | "pro" | "business";

export const TIER_BUDGET_CAP_USD: Record<SubscriptionTier, number> = {
  free: 2,
  pro: 20,
  business: 200,
};

export interface MemberSettingsModalProps {
  open: boolean;
  onClose: () => void;
  member: {
    id: string;
    role: string;
    displayName: string;
    dailyBudgetUsd: number;
    scope?: {
      tools?: string[];
      workspace_paths?: string[];
    };
    status: "active" | "paused" | "revoked";
  };
  tier: SubscriptionTier;
  /** Fired after successful PATCH so caller can refresh. */
  onSaved?: () => void;
}

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function MemberSettingsModal({
  open,
  onClose,
  member,
  tier,
  onSaved,
}: MemberSettingsModalProps) {
  const cap = TIER_BUDGET_CAP_USD[tier];
  const [role, setRole] = useState(member.role);
  const [displayName, setDisplayName] = useState(member.displayName);
  const [budget, setBudget] = useState(member.dailyBudgetUsd);
  const [tools, setTools] = useState<string>((member.scope?.tools ?? []).join(", "));
  const [paths, setPaths] = useState<string>((member.scope?.workspace_paths ?? []).join(", "));
  const [status, setStatus] = useState<"active" | "paused">(
    member.status === "revoked" ? "paused" : member.status,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRole(member.role);
    setDisplayName(member.displayName);
    setBudget(member.dailyBudgetUsd);
    setTools((member.scope?.tools ?? []).join(", "));
    setPaths((member.scope?.workspace_paths ?? []).join(", "));
    setStatus(member.status === "revoked" ? "paused" : member.status);
    setError(null);
  }, [open, member]);

  if (!open) return null;

  const handleSave = async () => {
    setError(null);
    if (!role.trim()) {
      setError("Role is required");
      return;
    }
    if (role.length > 30) {
      setError("Role: max 30 chars");
      return;
    }
    if (budget < 0.1 || budget > cap) {
      setError(`Daily budget must be 0.10 - ${cap.toFixed(2)} for ${tier} tier`);
      return;
    }
    setSaving(true);
    try {
      const body = {
        role: role.trim(),
        displayName: displayName.trim(),
        dailyBudgetUsd: budget,
        scope: {
          tools: tools.split(",").map((s) => s.trim()).filter(Boolean),
          workspace_paths: paths.split(",").map((s) => s.trim()).filter(Boolean),
        },
        status,
      };
      const res = await fetch(`${API_BASE}/v1/pet/team/${encodeURIComponent(member.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err?.message || `HTTP ${res.status}`);
        return;
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose} role="presentation">
      <div style={modal} onClick={(e) => e.stopPropagation()} role="dialog">
        <div style={headerStyle}>
          <h3 style={{ margin: 0, fontSize: 16 }}>编辑成员设置</h3>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close">×</button>
        </div>

        {/* v2.1 banner — model tier setting takes effect from v2.1 onwards.
            Before v2.1 (v1 ship), worker hard-coded Haiku 4.5 and ignored
            this field. After v2.1 the setting is honored per the
            subscription tier ladder (free=Haiku, pro=Sonnet 4.6 with Opus
            4.7 on-demand). See MULTI_AGENT_V2_1_PRODUCT_DECISIONS §2. */}
        <div
          style={{
            background: 'rgba(76, 175, 80, 0.10)',
            border: '1px solid rgba(76, 175, 80, 0.40)',
            borderRadius: 6,
            padding: '8px 10px',
            margin: '0 0 12px 0',
            fontSize: 12,
            lineHeight: 1.5,
            color: 'var(--text)',
          }}
          role="status"
        >
          <strong>v2.1 起生效</strong> — 这里选的模型 tier 与每日预算
          会真正路由到 sub-task。Free tier 锁定 Haiku 4.5;Pro/Business
          默认 Sonnet 4.6,Opus 4.7 在偏好里手动选。
        </div>

        <div style={fieldGroup}>
          <label style={labelStyle}>Role tag</label>
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            maxLength={30}
            style={inputStyle}
            placeholder="e.g. coder / researcher / qa_ops"
          />
        </div>

        <div style={fieldGroup}>
          <label style={labelStyle}>Display name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={64}
            style={inputStyle}
          />
        </div>

        <div style={fieldGroup}>
          <label style={labelStyle}>
            Daily budget (USD) — cap ${cap.toFixed(2)} for {tier}
          </label>
          <input
            type="number"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            min={0.1}
            max={cap}
            step={0.5}
            style={inputStyle}
          />
        </div>

        <div style={fieldGroup}>
          <label style={labelStyle}>Tools (comma-separated whitelist)</label>
          <input
            type="text"
            value={tools}
            onChange={(e) => setTools(e.target.value)}
            placeholder="read_file, run_command, web_search"
            style={inputStyle}
          />
        </div>

        <div style={fieldGroup}>
          <label style={labelStyle}>Workspace paths (comma-separated globs)</label>
          <input
            type="text"
            value={paths}
            onChange={(e) => setPaths(e.target.value)}
            placeholder="src/**, docs/**, !secrets/**"
            style={inputStyle}
          />
        </div>

        <div style={fieldGroup}>
          <label style={labelStyle}>Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "active" | "paused")}
            style={inputStyle}
          >
            <option value="active">active</option>
            <option value="paused">paused</option>
          </select>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        <div style={footerStyle}>
          <button type="button" onClick={onClose} style={cancelBtn} disabled={saving}>
            取消
          </button>
          <button type="button" onClick={handleSave} style={saveBtn} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  zIndex: 9000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const modal: CSSProperties = {
  width: 480,
  maxWidth: "90vw",
  maxHeight: "85vh",
  overflowY: "auto",
  padding: 20,
  borderRadius: 12,
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 4,
};

const closeBtn: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text-muted)",
  fontSize: 22,
  cursor: "pointer",
  lineHeight: 1,
};

const fieldGroup: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const inputStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-input, var(--bg-card))",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
};

const errorStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  background: "var(--tone-danger-bg, rgba(239, 68, 68, 0.1))",
  color: "var(--tone-danger-text, #f87171)",
  fontSize: 12,
};

const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 8,
};

const cancelBtn: CSSProperties = {
  padding: "8px 16px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "inherit",
};

const saveBtn: CSSProperties = {
  padding: "8px 16px",
  borderRadius: 6,
  border: "1px solid var(--accent)",
  background: "var(--accent)",
  color: "white",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "inherit",
};
