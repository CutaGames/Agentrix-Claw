// Sprint Post-launch P-2 (2026-05-24) — Self-Evolution Dashboard Panel.
//
// Visualizes Agentrix's self-evolution system (long memory + dreaming +
// memory wiki) as a "your agent is getting smarter" panel. Designed to
// make A_Path differentiation #5 (Living Pet + autonomous learning)
// visible to Standard / Pro Mode users.
//
// See:
//   - `.kiro/specs/positioning-revision-2026-05/` (A_Path / autonomy promise)
//   - `desktop/src/services/selfEvolution.ts` (data fan-out)
//   - `docs/agentrix-positioning-2026-05.zh-CN.md` §3.2 #5

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuthStore } from "../services/store";
import {
  fetchSelfEvolutionSnapshot,
  type SelfEvolutionSnapshot,
} from "../services/selfEvolution";

interface Props {
  open: boolean;
  onClose: () => void;
}

const TIER_ORDER = ["session", "working", "longterm", "wiki"] as const;
const TIER_LABEL: Record<string, string> = {
  session: "对话记忆",
  working: "工作记忆",
  longterm: "长期记忆",
  wiki: "Wiki 知识",
};
const TIER_COLOR: Record<string, string> = {
  session: "#7dd3fc",  // sky-300
  working: "#fbbf24",  // amber-400
  longterm: "#a78bfa", // violet-400
  wiki: "#f472b6",     // pink-400
};

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "尚未运行";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "尚未运行";
  const diffMs = Date.now() - t;
  if (diffMs < 0) return "即将";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "刚才";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return iso.slice(0, 10);
}

export default function SelfEvolutionDashboardPanel({ open, onClose }: Props) {
  const token = useAuthStore((s) => s.token);
  const [snapshot, setSnapshot] = useState<SelfEvolutionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setError("需要登录才能查看自进化数据");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await fetchSelfEvolutionSnapshot(token);
      setSnapshot(next);
      if (!next.hasAnyData) {
        setError("暂时没有数据 — 你的 agent 还需要一些时间积累记忆与梦境。继续聊会儿吧。");
      }
    } catch (err: any) {
      setError(err?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!open) return;
    refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  const memoryTotal = snapshot?.memory?.total ?? 0;
  const dreamingTotal = snapshot?.dreaming?.total ?? 0;
  const dreamLast7d = snapshot?.dreaming?.last7d ?? 0;
  const wikiNodes = snapshot?.wiki?.nodeCount ?? 0;
  const wikiLinks = snapshot?.wiki?.linkCount ?? 0;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Self-Evolution Dashboard"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--surface-overlay, rgba(0, 0, 0, 0.45))",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        zIndex: 9000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--surface-1, #fff)",
          color: "var(--text-1, inherit)",
          width: "min(960px, 92vw)",
          maxHeight: "88vh",
          margin: "auto",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid var(--border-subtle, rgba(120,120,140,0.2))",
          }}
        >
          <div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>🌱 Self-Evolution Dashboard</div>
            <div style={{ fontSize: 12, color: "var(--text-2, inherit)", opacity: 0.7, marginTop: 2 }}>
              你的 agent 正在变强 · {snapshot ? formatRelative(new Date(snapshot.fetchedAt).toISOString()) : "正在读取…"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              style={{
                background: "var(--surface-2, rgba(120,120,140,0.12))",
                color: "var(--text-1, inherit)",
                border: "1px solid var(--border-subtle, rgba(120,120,140,0.3))",
                borderRadius: 6,
                padding: "6px 14px",
                cursor: loading ? "wait" : "pointer",
                fontSize: 12,
              }}
            >
              ↻ 刷新
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Self-Evolution Dashboard"
              style={{
                background: "transparent",
                color: "var(--text-2, inherit)",
                border: "1px solid var(--border-subtle, rgba(120,120,140,0.3))",
                borderRadius: 6,
                padding: "6px 14px",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              ✕ 关闭 (Esc)
            </button>
          </div>
        </header>

        <main style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Hero stats row */}
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 14,
            }}
          >
            <StatCard
              icon="🧠"
              label="总记忆条目"
              value={memoryTotal}
              subtitle={`分布在 ${Object.keys(snapshot?.memory?.byTier ?? {}).length} 层`}
            />
            <StatCard
              icon="💤"
              label="梦境次数"
              value={dreamingTotal}
              subtitle={`近 7 天 ${dreamLast7d}`}
            />
            <StatCard
              icon="📝"
              label="Wiki 网络"
              value={wikiNodes}
              subtitle={`${wikiLinks} 条连接`}
            />
          </section>

          {/* Memory tiers breakdown */}
          {snapshot?.memory && (
            <section>
              <h3 style={sectionTitleStyle}>4 层记忆系统</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {TIER_ORDER.map((tier) => {
                  const count = snapshot.memory!.byTier[tier] ?? 0;
                  const pct = memoryTotal > 0 ? (count / memoryTotal) * 100 : 0;
                  return (
                    <div key={tier}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                        <span>{TIER_LABEL[tier] || tier}</span>
                        <span style={{ color: "var(--text-2, inherit)", opacity: 0.7 }}>
                          {count} 条 · {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div
                        style={{
                          height: 8,
                          background: "var(--surface-2, rgba(120,120,140,0.12))",
                          borderRadius: 4,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            background: TIER_COLOR[tier] || "#7dd3fc",
                            transition: "width 0.4s ease-out",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Wiki top pages */}
          {snapshot?.wiki?.topPages && snapshot.wiki.topPages.length > 0 && (
            <section>
              <h3 style={sectionTitleStyle}>Wiki 中被引用最多的页面</h3>
              <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {snapshot.wiki.topPages.map((p, i) => (
                  <li
                    key={p.slug}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 12px",
                      background: "var(--surface-2, rgba(120,120,140,0.08))",
                      borderRadius: 6,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ minWidth: 24, fontWeight: 600, color: "var(--text-2, inherit)", opacity: 0.6 }}>
                      #{i + 1}
                    </span>
                    <span style={{ flex: 1 }}>{p.title || p.slug}</span>
                    <span style={{ fontSize: 11, color: "var(--text-2, inherit)", opacity: 0.6 }}>
                      {p.linkInCount} 处引用
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Dreaming summary */}
          {snapshot?.dreaming && snapshot.dreaming.byStatus && Object.keys(snapshot.dreaming.byStatus).length > 0 && (
            <section>
              <h3 style={sectionTitleStyle}>梦境状态分布</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {Object.entries(snapshot.dreaming.byStatus).map(([status, count]) => (
                  <span
                    key={status}
                    style={{
                      padding: "4px 10px",
                      background: "var(--surface-2, rgba(120,120,140,0.12))",
                      border: "1px solid var(--border-subtle, rgba(120,120,140,0.2))",
                      borderRadius: 999,
                      fontSize: 12,
                    }}
                  >
                    {status}: <strong>{count}</strong>
                  </span>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-2, inherit)", opacity: 0.7 }}>
                上次梦境:{formatRelative(snapshot.dreaming.lastRunAt)}
              </div>
            </section>
          )}

          {/* Empty / error state */}
          {(error || (!snapshot?.hasAnyData && !loading)) && (
            <section
              role="alert"
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--text-2, inherit)",
                opacity: 0.7,
                fontSize: 13,
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>🌱</div>
              <div>{error || "暂时没有数据 — 你的 agent 还需要一些时间积累记忆与梦境。继续聊会儿吧。"}</div>
            </section>
          )}
        </main>

        <footer
          style={{
            padding: "10px 18px",
            borderTop: "1px solid var(--border-subtle, rgba(120,120,140,0.2))",
            fontSize: 11,
            color: "var(--text-2, inherit)",
            opacity: 0.7,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>差异化护城河 #5 · A_Path · 定位 §3.2</span>
          <span>Esc / 点击外部 = 关闭</span>
        </footer>
      </div>
    </div>,
    portalTarget,
  );
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  marginTop: 0,
  marginBottom: 10,
  color: "var(--text-1, inherit)",
};

interface StatCardProps {
  icon: string;
  label: string;
  value: number;
  subtitle: string;
}

function StatCard({ icon, label, value, subtitle }: StatCardProps) {
  return (
    <div
      style={{
        background: "var(--surface-2, rgba(120,120,140,0.08))",
        border: "1px solid var(--border-subtle, rgba(120,120,140,0.18))",
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-2, inherit)", opacity: 0.7, marginBottom: 6 }}>
        <span style={{ marginRight: 4 }}>{icon}</span>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, color: "var(--text-1, inherit)" }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-2, inherit)", opacity: 0.6, marginTop: 4 }}>
        {subtitle}
      </div>
    </div>
  );
}
