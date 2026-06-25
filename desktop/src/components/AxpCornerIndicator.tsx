/**
 * AxpCornerIndicator — bottom-right "💎 N AXP" widget.
 *
 * Sprint DA. Mounted in App.tsx chat-panel view. Polls /v1/axp/balance
 * every 30s. Click → opens <AxpHistoryPanel /> (inline sheet).
 *
 * Deliberately low-chrome: no chart, no animations, just a number the
 * user can glance at to know "I have AXP to spend on subscription
 * discount / skill discount / lottery pulls".
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { fetchAxpBalance, fetchAxpHistory, type AxpBalanceView, type AxpLedgerEntry } from "../services/axp";
import { useAuthStore } from "../services/store";

interface Props {
  onOpenCheckin?: () => void;
}

export default function AxpCornerIndicator({ onOpenCheckin }: Props) {
  const token = useAuthStore((s) => s.token);
  const [balance, setBalance] = useState<AxpBalanceView | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!token) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const b = await fetchAxpBalance();
        if (!cancelled) setBalance(b);
      } catch {
        // Silent — unauthenticated / offline are both OK; widget just hides.
      }
    };
    void load();
    const timer = setInterval(load, 30_000);
    // Refresh whenever something locally earns / spends
    const bump = () => load();
    window.addEventListener("agentrix:axp-changed", bump);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("agentrix:axp-changed", bump);
    };
  }, [token]);

  if (!token || !balance) return null;

  return (
    <>
      <button
        style={chipStyle}
        onClick={() => setOpen((v) => !v)}
        title="Click for AXP history · Ctrl-click to check in"
      >
        <span style={chipEmoji}>💎</span>
        <span style={chipValue}>{balance.balance.toLocaleString()}</span>
      </button>
      {open && (
        <AxpHistorySheet
          balance={balance}
          onClose={() => setOpen(false)}
          onOpenCheckin={onOpenCheckin}
        />
      )}
    </>
  );
}

function AxpHistorySheet({
  balance,
  onClose,
  onOpenCheckin,
}: {
  balance: AxpBalanceView;
  onClose: () => void;
  onOpenCheckin?: () => void;
}) {
  const [items, setItems] = useState<AxpLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchAxpHistory(20);
        if (!cancelled) setItems(res.items || []);
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
      <div style={sheetHeader}>
        <div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>AXP 余额</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#22d3ee" }}>
            💎 {balance.balance.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            累计获得 {balance.lifetime_earned.toLocaleString()} · 累计消耗 {balance.lifetime_spent.toLocaleString()}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {onOpenCheckin && (
            <button style={actionBtn} onClick={onOpenCheckin}>☀️ 签到</button>
          )}
          <button style={closeBtn} onClick={onClose}>✕</button>
        </div>
      </div>
      <div style={listStyle}>
        {loading ? (
          <div style={emptyStyle}>加载中…</div>
        ) : items.length === 0 ? (
          <div style={emptyStyle}>还没有 AXP 记录 · 每日签到、陪伴主宠、邀请好友都能获得</div>
        ) : (
          items.map((e) => (
            <div key={e.id} style={rowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={rowSrcStyle}>{sourceLabel(e.source)}</div>
                {e.note && <div style={rowNoteStyle}>{e.note}</div>}
              </div>
              <div style={e.direction === "earn" ? rowAmountEarn : rowAmountSpend}>
                {e.direction === "earn" ? "+" : "−"}
                {e.amount.toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    daily_checkin: "☀️ 每日签到",
    chat_active: "💬 对话奖励",
    pet_lvl_up: "⭐ 主宠升级",
    coraising_feed: "🌱 共养喂食",
    coraising_owner: "🌱 共养回馈",
    referral_signup: "🤝 邀请注册",
    feed_post_liked: "👍 帖子获赞",
    task_complete: "💼 任务完成",
    skin_sold: "🎨 皮肤售出",
    greeting_sent: "🎁 贺卡发送",
    greeting_received: "🎁 贺卡收到",
    game_participate: "🎮 游戏参与",
    contest_win: "🏆 大赛夺冠",
    sub_cashback: "💳 订阅返现",
    sub_discount: "💸 订阅抵扣",
    skill_discount: "⚡ 技能抵扣",
    skin_discount: "🎨 皮肤抵扣",
    admin_grant: "🎁 平台赠送",
    expire_12mo: "⌛ 过期销毁",
  };
  return map[source] || source;
}

const chipStyle: CSSProperties = {
  position: "fixed",
  bottom: 16,
  right: 16,
  zIndex: 9500,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid rgba(34,211,238,0.4)",
  background: "rgba(11,18,32,0.9)",
  backdropFilter: "blur(8px)",
  cursor: "pointer",
  color: "#22d3ee",
  fontSize: 13,
  fontWeight: 700,
  boxShadow: "0 6px 24px rgba(34,211,238,0.2)",
};

const chipEmoji: CSSProperties = { fontSize: 14 };
const chipValue: CSSProperties = { letterSpacing: 0.2 };

const sheetStyle: CSSProperties = {
  position: "fixed",
  bottom: 60,
  right: 16,
  width: 340,
  maxHeight: 480,
  zIndex: 9600,
  background: "rgba(20,24,36,0.97)",
  border: "1px solid rgba(34,211,238,0.3)",
  borderRadius: 14,
  boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  backdropFilter: "blur(10px)",
  color: "var(--text-card)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const sheetHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  padding: 14,
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const listStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "6px 10px 10px",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 4px",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
  fontSize: 12,
};

const rowSrcStyle: CSSProperties = { color: "var(--text-card)", fontWeight: 600 };
const rowNoteStyle: CSSProperties = { color: "var(--text-muted)", fontSize: 11, marginTop: 2 };
const rowAmountEarn: CSSProperties = { color: "#22d3ee", fontWeight: 800 };
const rowAmountSpend: CSSProperties = { color: "#fbbf24", fontWeight: 800 };
const emptyStyle: CSSProperties = { padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 12 };

const actionBtn: CSSProperties = {
  background: "rgba(34,211,238,0.15)",
  border: "1px solid rgba(34,211,238,0.4)",
  color: "#22d3ee",
  borderRadius: 8,
  padding: "4px 10px",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
};

const closeBtn: CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "var(--text-muted)",
  borderRadius: 8,
  padding: "4px 9px",
  cursor: "pointer",
  fontSize: 12,
};
