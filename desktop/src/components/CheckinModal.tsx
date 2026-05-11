/**
 * CheckinModal — daily AXP check-in surfaced via right-click menu or
 * AxpCornerIndicator. Opens inline (no new Tauri window).
 *
 * Sprint DA.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { fetchCheckinStatus, doCheckin, type CheckinStatus } from "../services/axp";
import { showAxpToast } from "../services/axpToast";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function CheckinModal({ visible, onClose }: Props) {
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    fetchCheckinStatus()
      .then((s) => setStatus(s))
      .catch((e) => setError(e?.message ?? "加载失败"))
      .finally(() => setLoading(false));
  }, [visible]);

  const claim = async () => {
    if (!status?.can_checkin_today) return;
    setClaiming(true);
    setError(null);
    try {
      const res = await doCheckin();
      showAxpToast({
        amount: res.earned,
        emoji: "☀️",
        reason:
          res.streak > 1
            ? { en: `Daily check-in · day ${res.streak}`, zh: `每日签到 · 连续 ${res.streak} 天` }
            : { en: "Daily check-in reward", zh: "每日签到奖励" },
      });
      // Replace status with the after-claim snapshot
      setStatus(res);
      window.dispatchEvent(new CustomEvent("agentrix:axp-changed"));
      // Close after a moment so user sees the toast
      setTimeout(onClose, 900);
    } catch (e: any) {
      setError(e?.message ?? "签到失败");
    }
    setClaiming(false);
  };

  if (!visible) return null;

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <span style={{ fontSize: 28 }}>☀️</span>
          <span style={titleStyle}>每日签到</span>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={bodyStyle}>
          {loading ? (
            <div style={muted}>加载中…</div>
          ) : error ? (
            <div style={errStyle}>{error}</div>
          ) : status ? (
            <>
              <div style={streakLine}>
                {status.streak > 0 ? (
                  <>🔥 已连续签到 <b style={{ color: "#22d3ee" }}>{status.streak}</b> 天</>
                ) : (
                  <>开启第一天签到</>
                )}
              </div>
              <div style={breakdown}>
                基础 {status.base_amount} AXP + 连击 {status.streak_bonus} AXP（最高 +{status.streak_bonus_cap}）
              </div>
              {status.can_checkin_today ? (
                <button onClick={claim} disabled={claiming} style={claimBtnStyle}>
                  {claiming ? "领取中…" : `领取 +${status.pending_amount} AXP ✨`}
                </button>
              ) : (
                <div style={doneBadge}>
                  今日已领 · 明天再来 +{status.pending_amount}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9900,
};

const cardStyle: CSSProperties = {
  width: 340,
  background: "rgba(20,24,36,0.98)",
  border: "1px solid rgba(34,211,238,0.35)",
  borderRadius: 16,
  boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
  backdropFilter: "blur(10px)",
  color: "#e5e7eb",
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "14px 16px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const titleStyle: CSSProperties = { flex: 1, fontSize: 16, fontWeight: 700 };

const closeBtnStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#9ca3af",
  borderRadius: 8,
  padding: "4px 9px",
  cursor: "pointer",
  fontSize: 12,
};

const bodyStyle: CSSProperties = { padding: 18 };

const streakLine: CSSProperties = { fontSize: 14, marginBottom: 8 };
const breakdown: CSSProperties = { fontSize: 12, color: "#9ca3af", marginBottom: 16 };
const muted: CSSProperties = { color: "#9ca3af", textAlign: "center", padding: "12px 0", fontSize: 13 };
const errStyle: CSSProperties = { color: "#f87171", fontSize: 12, padding: "4px 0" };

const claimBtnStyle: CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  background: "linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%)",
  border: "none",
  borderRadius: 12,
  color: "#0b1220",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "0 6px 20px rgba(34,211,238,0.4)",
};

const doneBadge: CSSProperties = {
  padding: "10px 16px",
  background: "rgba(148,163,184,0.15)",
  borderRadius: 10,
  textAlign: "center",
  color: "#9ca3af",
  fontSize: 12,
};
