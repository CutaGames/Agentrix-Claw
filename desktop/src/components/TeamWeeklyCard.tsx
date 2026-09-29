/**
 * TeamWeeklyCard — Multi-Agent v1 W5.6 weekly summary (Pro / Simple split).
 *
 * Pro Mode (`useUserMode() === 'pro'`):
 *   - Total Sub_Tasks number + cost USD chip
 *   - Top 3 contributing pets
 *   - Top 3 most expensive Sub_Tasks
 *   - "Open Full Report" → dispatch `agentrix:open-team-activity-report`
 *   - "Export CSV" → triggers download
 *
 * Simple Mode:
 *   - Single line "本周阿喵帮你完成了 N 件事 ✨" (R11.5 — no USD/token)
 *
 * Spec: design.md §12.5, §12.7; tasks.md W5.6 + W5.7
 */
import { useEffect, useState, type CSSProperties } from "react";

import { API_BASE, useAuthStore } from "../services/store";

export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  totalSubTasks: number;
  succeededCount: number;
  failedCount: number;
  totalCostUsd: number;
  topPets: Array<{
    livingPetId: string | null;
    petName: string;
    avatarUrl?: string;
    subTaskCount: number;
    totalCostUsd: number;
  }>;
  topExpensiveSubTasks: Array<{
    taskId: string;
    title: string;
    role: string | null;
    totalCostUsd: number;
    completedAt: string | null;
  }>;
}

interface Props {
  /** Override fetch result (tests / Storybook). */
  injectedSummary?: WeeklySummary | null;
  mode?: "pro" | "simple" | "standard";
  /** Optional click on a pet row → caller can filter AgentTeamPanel. */
  onPetClick?: (livingPetId: string | null, petName: string) => void;
}

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function TeamWeeklyCard({
  injectedSummary,
  mode = "standard",
  onPetClick,
}: Props) {
  const [summary, setSummary] = useState<WeeklySummary | null>(injectedSummary ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (injectedSummary !== undefined) {
      setSummary(injectedSummary);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/multi-agent/weekly-summary`, { headers: authHeaders() })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((body) => {
        if (cancelled) return;
        setSummary((body?.data as WeeklySummary) || null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [injectedSummary]);

  // ── Simple Mode — single line, no USD/token (R11.5) ──────────────────
  if (mode === "simple") {
    if (!summary || summary.totalSubTasks === 0) {
      return (
        <div style={simpleLine}>
          这周还没有 sub-task 完成。<span aria-hidden>🌱</span>
        </div>
      );
    }
    return (
      <div style={simpleLine}>
        本周阿喵帮你完成了 <strong>{summary.totalSubTasks}</strong> 件事 ✨
      </div>
    );
  }

  // ── Pro / Standard Mode ──────────────────────────────────────────────
  if (loading) {
    return (
      <div style={card}>
        <div style={emptyText}>Loading weekly summary…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div style={card}>
        <div style={errorText}>无法获取周报: {error}</div>
      </div>
    );
  }
  if (!summary || summary.totalSubTasks === 0) {
    return (
      <div style={card}>
        <div style={emptyText}>
          🌱 还没有 sub-task 完成。让 Leader 派发一个看看?
        </div>
      </div>
    );
  }

  const handleExportCsv = async () => {
    const url = `${API_BASE}/multi-agent/team-activity-report?format=csv&days=30`;
    try {
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
      a.download = `agentrix-team-activity-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleOpenReport = () => {
    window.dispatchEvent(new CustomEvent("agentrix:open-team-activity-report"));
  };

  return (
    <div style={card}>
      <header style={cardHeader}>
        <div>
          <div style={eyebrow}>WEEKLY · {summary.weekStart} → {summary.weekEnd}</div>
          <div style={titleStyle}>Team Activity</div>
        </div>
        {mode === "pro" && (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={btnSecondary} onClick={handleExportCsv}>
              ⤓ CSV
            </button>
            <button type="button" style={btnPrimary} onClick={handleOpenReport}>
              Open Full Report
            </button>
          </div>
        )}
      </header>

      {/* Top numbers */}
      <div style={metricsRow}>
        <Metric label="Sub-Tasks" value={summary.totalSubTasks.toString()} />
        <Metric
          label="Succeeded"
          value={`${summary.succeededCount} / ${summary.totalSubTasks}`}
        />
        <Metric label="Cost (USD)" value={`$${summary.totalCostUsd.toFixed(2)}`} />
      </div>

      {/* Top pets */}
      {summary.topPets.length > 0 && (
        <section style={section}>
          <div style={sectionTitle}>Top contributors</div>
          <ul style={list}>
            {summary.topPets.map((p) => (
              <li
                key={p.livingPetId ?? p.petName}
                style={listItem}
                onClick={() => onPetClick?.(p.livingPetId, p.petName)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && onPetClick) {
                    e.preventDefault();
                    onPetClick(p.livingPetId, p.petName);
                  }
                }}
                role="button"
                tabIndex={onPetClick ? 0 : -1}
              >
                <span style={petName}>{p.petName}</span>
                <span style={chipNeutral}>{p.subTaskCount} tasks</span>
                <span style={chipCost}>${p.totalCostUsd.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Top expensive */}
      {summary.topExpensiveSubTasks.length > 0 && (
        <section style={section}>
          <div style={sectionTitle}>Most expensive sub-tasks</div>
          <ul style={list}>
            {summary.topExpensiveSubTasks.map((t) => (
              <li key={t.taskId} style={listItem}>
                <span style={taskTitle} title={t.title}>{t.title}</span>
                {t.role && <span style={chipRole}>{t.role}</span>}
                <span style={chipCost}>${t.totalCostUsd.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricCol}>
      <div style={metricLabel}>{label}</div>
      <div style={metricValue}>{value}</div>
    </div>
  );
}

const card: CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  borderRadius: 12,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const cardHeader: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const eyebrow: CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  color: "var(--text-dim)",
  marginBottom: 2,
};

const titleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
};

const metricsRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 12,
};

const metricCol: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const metricLabel: CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
};

const metricValue: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
};

const section: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const sectionTitle: CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: "var(--text-muted)",
};

const list: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const listItem: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 8px",
  borderRadius: 6,
  background: "var(--bg-overlay-light, rgba(255,255,255,0.04))",
  cursor: "pointer",
};

const petName: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const taskTitle: CSSProperties = {
  fontSize: 12,
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const chipNeutral: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  padding: "2px 6px",
  borderRadius: 999,
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--text-muted)",
};

const chipCost: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  padding: "2px 6px",
  borderRadius: 999,
  background: "var(--tone-success-bg, rgba(132,204,22,0.12))",
  color: "var(--tone-success-text, #86efac)",
  border: "1px solid var(--tone-success-border, rgba(132,204,22,0.3))",
};

const chipRole: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  padding: "2px 6px",
  borderRadius: 999,
  background: "var(--tone-info-bg, rgba(125,211,252,0.12))",
  color: "var(--tone-info-text, #7dd3fc)",
  border: "1px solid var(--tone-info-border, rgba(125,211,252,0.3))",
};

const btnPrimary: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--accent)",
  background: "var(--accent)",
  color: "white",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};

const btnSecondary: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};

const emptyText: CSSProperties = {
  fontSize: 12,
  color: "var(--text-muted)",
  padding: "12px 0",
  textAlign: "center",
};

const errorText: CSSProperties = {
  fontSize: 12,
  color: "var(--tone-danger-text, #f87171)",
  padding: "12px 0",
  textAlign: "center",
};

const simpleLine: CSSProperties = {
  fontSize: 13,
  padding: "8px 12px",
  borderRadius: 8,
  background: "var(--bg-card)",
  color: "var(--text)",
  textAlign: "center",
};
