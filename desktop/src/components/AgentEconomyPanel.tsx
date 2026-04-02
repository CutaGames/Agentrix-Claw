import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { apiFetch, API_BASE, useAuthStore } from "../services/store";

interface AgentAccountInfo {
  balance: number;
  currency: string;
  creditScore: number;
  totalEarned: number;
  totalSpent: number;
  pendingEarnings: number;
}

interface Transaction {
  id: string;
  type: "income" | "expense";
  amount: number;
  description: string;
  createdAt: string;
  status: "completed" | "pending" | "failed";
}

interface InstalledSkill {
  id: string;
  name: string;
  description: string;
  price: number;
  installedAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AgentEconomyPanel({ open, onClose }: Props) {
  const { token, activeInstanceId } = useAuthStore();
  const [account, setAccount] = useState<AgentAccountInfo | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [skills, setSkills] = useState<InstalledSkill[]>([]);
  const [tab, setTab] = useState<"overview" | "transactions" | "skills">("overview");
  const [loading, setLoading] = useState(false);

  const fetchAccountInfo = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/agent-presence/agents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const agents = await res.json();
        const agent = Array.isArray(agents) ? agents[0] : agents?.data?.[0];
        if (agent?.metadata?.agentAccountId) {
          // Fetch account details
          const accRes = await apiFetch(`${API_BASE}/agent-accounts/${agent.metadata.agentAccountId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (accRes.ok) {
            const accData = await accRes.json();
            setAccount({
              balance: accData.balance ?? 0,
              currency: accData.currency ?? "USD",
              creditScore: accData.creditScore ?? 0,
              totalEarned: accData.totalEarned ?? 0,
              totalSpent: accData.totalSpent ?? 0,
              pendingEarnings: accData.pendingEarnings ?? 0,
            });
          }
        }
      }
    } catch {
      // Graceful fallback — show mock placeholder
      setAccount({ balance: 0, currency: "USD", creditScore: 0, totalEarned: 0, totalSpent: 0, pendingEarnings: 0 });
    }
    setLoading(false);
  }, [token]);

  const fetchSkills = useCallback(async () => {
    if (!token || !activeInstanceId) return;
    try {
      const res = await apiFetch(`${API_BASE}/openclaw/proxy/${activeInstanceId}/skills`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSkills(Array.isArray(data) ? data : data?.skills || []);
      }
    } catch {}
  }, [token, activeInstanceId]);

  useEffect(() => {
    if (open) {
      fetchAccountInfo();
      fetchSkills();
    }
  }, [open, fetchAccountInfo, fetchSkills]);

  if (!open) return null;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={header}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>💰 Agent Economy</span>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        {/* Tabs */}
        <div style={tabBar}>
          {(["overview", "transactions", "skills"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{ ...tabBtn, ...(tab === t ? tabBtnActive : {}) }}
            >
              {t === "overview" ? "📊 Overview" : t === "transactions" ? "📋 Transactions" : "🧩 Skills"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={content}>
          {loading && <div style={emptyText}>Loading...</div>}

          {!loading && tab === "overview" && account && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Balance card */}
              <div style={card}>
                <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>Balance</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#86efac" }}>
                  ${account.balance.toFixed(2)}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{account.currency}</div>
              </div>

              {/* Stats grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={statCard}>
                  <div style={{ fontSize: 10, color: "var(--text-dim)" }}>Total Earned</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#86efac" }}>${account.totalEarned.toFixed(2)}</div>
                </div>
                <div style={statCard}>
                  <div style={{ fontSize: 10, color: "var(--text-dim)" }}>Total Spent</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#fca5a5" }}>${account.totalSpent.toFixed(2)}</div>
                </div>
                <div style={statCard}>
                  <div style={{ fontSize: 10, color: "var(--text-dim)" }}>Pending</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#fbbf24" }}>${account.pendingEarnings.toFixed(2)}</div>
                </div>
                <div style={statCard}>
                  <div style={{ fontSize: 10, color: "var(--text-dim)" }}>Credit Score</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#7dd3fc" }}>{account.creditScore || "—"}</div>
                </div>
              </div>
            </div>
          )}

          {!loading && tab === "transactions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {transactions.length === 0 ? (
                <div style={emptyText}>No transactions yet</div>
              ) : (
                transactions.map((tx) => (
                  <div key={tx.id} style={txRow}>
                    <span style={{ fontSize: 14 }}>{tx.type === "income" ? "📈" : "📉"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {tx.description}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 12, fontWeight: 600,
                      color: tx.type === "income" ? "#86efac" : "#fca5a5",
                    }}>
                      {tx.type === "income" ? "+" : "-"}${tx.amount.toFixed(2)}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {!loading && tab === "skills" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {skills.length === 0 ? (
                <div style={emptyText}>No skills installed</div>
              ) : (
                skills.map((skill) => (
                  <div key={skill.id} style={skillRow}>
                    <span style={{ fontSize: 14 }}>🧩</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{skill.name}</div>
                      <div style={{ fontSize: 10, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {skill.description}
                      </div>
                    </div>
                    {skill.price > 0 && (
                      <span style={{ fontSize: 10, color: "var(--text-dim)" }}>${skill.price.toFixed(2)}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  zIndex: 9000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const panel: CSSProperties = {
  width: 380,
  maxHeight: "80vh",
  background: "var(--bg-panel, #16213e)",
  border: "1px solid var(--border, rgba(255,255,255,0.08))",
  borderRadius: 16,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
};

const header: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: "1px solid var(--border)",
};

const closeBtn: CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-dim)",
  fontSize: 16,
  cursor: "pointer",
};

const tabBar: CSSProperties = {
  display: "flex",
  gap: 4,
  padding: "8px 16px",
  borderBottom: "1px solid var(--border)",
};

const tabBtn: CSSProperties = {
  flex: 1,
  background: "none",
  border: "1px solid transparent",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 11,
  color: "var(--text-dim)",
  cursor: "pointer",
  transition: "all 0.2s",
};

const tabBtnActive: CSSProperties = {
  background: "rgba(108,92,231,0.15)",
  borderColor: "rgba(108,92,231,0.3)",
  color: "#a78bfa",
  fontWeight: 600,
};

const content: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 16,
};

const card: CSSProperties = {
  padding: 16,
  borderRadius: 12,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid var(--border)",
  textAlign: "center",
};

const statCard: CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid var(--border)",
};

const txRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid var(--border)",
};

const skillRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid var(--border)",
};

const emptyText: CSSProperties = {
  fontSize: 12,
  color: "var(--text-dim)",
  textAlign: "center",
  padding: 24,
};
