import { useEffect, useState, useCallback } from "react";
import { apiFetch, API_BASE } from "../services/store";

/**
 * PetEconomyPanel — Phase 4 W8 desktop economic panel for the active pet.
 *
 * Maps to PRD docs/PRD_PET_PHASED_TEST_PLAN.zh-CN.md §6.5 DT-T4.1 / DT-T4.2:
 *  - 钱包 / 今日 / 本周 / 本月 (today's earnings + energy + LLM cost)
 *  - Auto-Earn 开关
 *  - 接入 GET /api/v1/pet/energy/:petSkinId/state
 *           GET /api/v1/pet/report/daily/:petSkinId
 *           POST /api/v1/pet/energy/:petSkinId/resume
 */

interface Props {
  petSkinId: string | null;
  open: boolean;
  onClose: () => void;
}

interface EnergyState {
  pet_skin_id: string;
  energy: number;
  daily_llm_calls: number;
  daily_spend_cents: number;
  paused: boolean;
  paused_reason: string | null;
  updated_at: string;
}

interface DailyReport {
  windowStart: string;
  windowEnd: string;
  llmCalls: number;
  llmCostCents: number;
  dispatches: number;
  dispatchesCompleted: number;
  dispatchesFailed: number;
  rewardEarnedCents: number;
  energyAtEnd: number;
  paused: boolean;
}

export default function PetEconomyPanel({ petSkinId, open, onClose }: Props) {
  const [state, setState] = useState<EnergyState | null>(null);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [autoEarn, setAutoEarn] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("agentrix_auto_earn") === "true";
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!petSkinId) return;
    setLoading(true);
    setError(null);
    try {
      const [stateRes, reportRes] = await Promise.all([
        apiFetch(`${API_BASE}/v1/pet/energy/${petSkinId}/state`),
        apiFetch(`${API_BASE}/v1/pet/report/daily/${petSkinId}`),
      ]);
      if (stateRes.ok) {
        const j = await stateRes.json();
        setState(j.state ?? null);
      } else {
        setError(`state ${stateRes.status}`);
      }
      if (reportRes.ok) {
        const j = await reportRes.json();
        setReport(j.report ?? null);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [petSkinId]);

  useEffect(() => {
    if (open && petSkinId) {
      refresh();
      const id = setInterval(refresh, 30_000);
      return () => clearInterval(id);
    }
  }, [open, petSkinId, refresh]);

  async function resume() {
    if (!petSkinId) return;
    const res = await apiFetch(`${API_BASE}/v1/pet/energy/${petSkinId}/resume`, { method: "POST" });
    if (res.ok) refresh();
  }

  function toggleAutoEarn() {
    const next = !autoEarn;
    setAutoEarn(next);
    localStorage.setItem("agentrix_auto_earn", String(next));
  }

  if (!open) return null;

  return (
    <div className="pet-economy-panel" data-testid="pet-economy" style={panelStyle}>
      <div style={headerStyle}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Pet Economy</h2>
        <button onClick={onClose} style={closeBtnStyle}>×</button>
      </div>

      {!petSkinId && (
        <div style={emptyStyle} data-testid="pe-no-pet">No active pet selected.</div>
      )}

      {petSkinId && (
        <>
          {error && (
            <div style={errorStyle} data-testid="pe-error">⚠ {error}</div>
          )}
          {loading && !state && <div style={emptyStyle} data-testid="pe-loading">Loading…</div>}

          {state && (
            <div data-testid="pe-state" style={cardStyle}>
              <div style={rowStyle}>
                <span>Energy</span>
                <strong data-testid="pe-energy">{state.energy} / 100</strong>
              </div>
              <div style={progressOuterStyle}>
                <div
                  style={{
                    ...progressInnerStyle,
                    width: `${state.energy}%`,
                    background: state.energy > 30 ? "#10b981" : "#f59e0b",
                  }}
                  data-testid="pe-energy-bar"
                />
              </div>
              <div style={rowStyle}>
                <span>Today's spend</span>
                <strong data-testid="pe-spend">${(state.daily_spend_cents / 100).toFixed(2)}</strong>
              </div>
              <div style={rowStyle}>
                <span>LLM calls today</span>
                <strong data-testid="pe-calls">{state.daily_llm_calls}</strong>
              </div>
              {state.paused && (
                <div style={pausedStyle} data-testid="pe-paused">
                  Paused: {state.paused_reason || "unknown"}
                  <button onClick={resume} style={resumeBtnStyle} data-testid="pe-resume">Resume</button>
                </div>
              )}
            </div>
          )}

          {report && (
            <div data-testid="pe-report" style={cardStyle}>
              <h3 style={{ margin: "0 0 8px 0", fontSize: 13, fontWeight: 600, opacity: 0.7 }}>Last 24h</h3>
              <div style={rowStyle}>
                <span>Earned</span>
                <strong data-testid="pe-earned">${(report.rewardEarnedCents / 100).toFixed(2)}</strong>
              </div>
              <div style={rowStyle}>
                <span>Tasks completed / failed</span>
                <strong data-testid="pe-tasks">{report.dispatchesCompleted} / {report.dispatchesFailed}</strong>
              </div>
              <div style={rowStyle}>
                <span>LLM cost</span>
                <strong>${(report.llmCostCents / 100).toFixed(2)}</strong>
              </div>
            </div>
          )}

          <div style={cardStyle}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={autoEarn}
                onChange={toggleAutoEarn}
                data-testid="pe-auto-earn-toggle"
              />
              <span>Auto-Earn enabled</span>
            </label>
            <p style={{ fontSize: 11, opacity: 0.6, margin: "6px 0 0 0" }}>
              When ON, the pet will accept tasks that pass the evaluator + budget gate.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: "fixed", top: 60, right: 16, width: 320, maxHeight: "80vh", overflowY: "auto",
  background: "var(--panel-bg, #fff)", color: "var(--panel-fg, #111)",
  border: "1px solid rgba(0,0,0,0.1)", borderRadius: 12,
  boxShadow: "0 12px 32px rgba(0,0,0,0.18)", padding: 12, zIndex: 99,
};
const headerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8,
};
const closeBtnStyle: React.CSSProperties = {
  background: "transparent", border: "none", fontSize: 20, cursor: "pointer", lineHeight: 1,
};
const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 12,
};
const rowStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0",
};
const progressOuterStyle: React.CSSProperties = {
  height: 6, background: "rgba(0,0,0,0.08)", borderRadius: 3, overflow: "hidden", marginBottom: 6,
};
const progressInnerStyle: React.CSSProperties = {
  height: "100%", transition: "width 400ms ease",
};
const emptyStyle: React.CSSProperties = { padding: 12, textAlign: "center", opacity: 0.6, fontSize: 12 };
const errorStyle: React.CSSProperties = {
  background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b",
  padding: 8, borderRadius: 6, marginBottom: 8, fontSize: 12,
};
const pausedStyle: React.CSSProperties = {
  background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e",
  padding: 8, borderRadius: 6, marginTop: 8, fontSize: 12,
  display: "flex", justifyContent: "space-between", alignItems: "center",
};
const resumeBtnStyle: React.CSSProperties = {
  background: "#92400e", color: "#fff", border: "none", borderRadius: 4,
  padding: "3px 8px", cursor: "pointer", fontSize: 11,
};
