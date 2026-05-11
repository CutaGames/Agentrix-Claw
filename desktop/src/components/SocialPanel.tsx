/**
 * SocialPanel — unified right-docked sheet for Co-Raising / Greeting /
 * Photo Mimic. Opened via FloatingBall right-click menu.
 *
 * Sprint DC.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  listMyCoRaisingInvites,
  fetchGreetingCatalog,
  fetchCurrentSeason,
  fetchLeaderboard,
  submitMimicEntry,
  castMimicVote,
  type CoRaisingInvite,
  type GreetingTemplate,
  type PhotoMimicSeason,
  type PhotoMimicEntry,
} from "../services/social";
import { showAxpToast } from "../services/axpToast";
import { useAuthStore } from "../services/store";

type Tab = "coraising" | "greeting" | "mimic";

interface Props {
  visible: boolean;
  initialTab?: Tab;
  onClose: () => void;
}

export default function SocialPanel({ visible, initialTab = "mimic", onClose }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    if (visible) setTab(initialTab);
  }, [visible, initialTab]);

  if (!visible) return null;

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={titleStyle}>🎪 社交中心</div>
          <button style={closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={tabsRow}>
          {[
            { key: "mimic",     label: "📸 模仿秀" },
            { key: "coraising", label: "🌱 共养" },
            { key: "greeting",  label: "🎁 贺卡" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as Tab)}
              style={{
                ...tabBtn,
                ...(tab === t.key ? tabBtnActive : {}),
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={bodyStyle}>
          {tab === "coraising" && <CoRaisingTab />}
          {tab === "greeting" && <GreetingTab />}
          {tab === "mimic" && <MimicTab />}
        </div>
      </div>
    </div>
  );
}

// ── Co-Raising Tab ─────────────────────────────────────────

function CoRaisingTab() {
  const [items, setItems] = useState<CoRaisingInvite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listMyCoRaisingInvites(10);
        if (!cancelled) setItems(res.items || []);
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const copyLink = async (url: string) => {
    try {
      const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
      await writeText(url);
      showAxpToast({ amount: 0, emoji: "📋", reason: { en: "Link copied", zh: "链接已复制" } });
    } catch {}
  };

  if (loading) return <div style={muted}>加载中…</div>;

  return (
    <>
      <div style={sectionLead}>
        邀请朋友帮你喂主宠。每次喂食给他们 5 AXP、你 2 AXP · 未来收益 5% 分他。
      </div>
      {items.length === 0 ? (
        <div style={emptyBox}>
          还没有共养邀请。请在移动端创建一个邀请，然后在桌面查看和分享。
        </div>
      ) : (
        items.map((inv) => (
          <div key={inv.id} style={rowCard}>
            <div style={rowHead}>
              <div style={{ fontFamily: "monospace", fontSize: 12, color: "#22d3ee" }}>
                {inv.token.slice(0, 10)}…
              </div>
              <div style={{ ...pill, background: inv.status === "active" ? "rgba(34,211,238,0.2)" : "rgba(156,163,175,0.15)", color: inv.status === "active" ? "#22d3ee" : "#9ca3af" }}>
                {inv.status}
              </div>
            </div>
            <div style={rowMeta}>
              喂养者 {inv.feeders_count}{inv.max_feeders > 0 ? ` / ${inv.max_feeders}` : ""} ·
              喂养次数 {inv.total_feeds} · 分成 {(inv.split_bps / 100).toFixed(0)}%
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={smallBtn} onClick={() => copyLink(inv.share_url)}>📋 复制链接</button>
            </div>
          </div>
        ))
      )}
    </>
  );
}

// ── Greeting Tab ──────────────────────────────────────────

function GreetingTab() {
  const [templates, setTemplates] = useState<GreetingTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchGreetingCatalog();
        if (!cancelled) setTemplates(res.templates || []);
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div style={muted}>加载中…</div>;

  const free = templates.filter((t) => !t.premium);
  const premium = templates.filter((t) => t.premium);

  return (
    <>
      <div style={sectionLead}>
        选一个场景，让主宠替你给朋友送上祝福。免费模板不限量，Premium 模板扣 AXP。
      </div>
      <div style={sectionHeading}>免费模板</div>
      <div style={gridStyle}>
        {free.map((t) => (
          <TemplateCard key={t.key} template={t} />
        ))}
      </div>
      <div style={sectionHeading}>Premium (消耗 AXP)</div>
      <div style={gridStyle}>
        {premium.map((t) => (
          <TemplateCard key={t.key} template={t} />
        ))}
      </div>
      <div style={{ ...muted, marginTop: 16 }}>
        详细编辑 / 发送流程在 Phase 2 桌面 GreetingStudio 中实现。当前面板仅预览可用模板。
      </div>
    </>
  );
}

function TemplateCard({ template }: { template: GreetingTemplate }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#e5e7eb" }}>{template.label_zh || template.label_en}</div>
      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{template.category}</div>
      {template.axp_cost > 0 && (
        <div style={{ fontSize: 10, color: "#fbbf24", marginTop: 6, fontWeight: 700 }}>
          💎 {template.axp_cost} AXP
        </div>
      )}
    </div>
  );
}

// ── Photo Mimic Tab ───────────────────────────────────────

function MimicTab() {
  const [season, setSeason] = useState<PhotoMimicSeason | null>(null);
  const [entries, setEntries] = useState<PhotoMimicEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageUrl, setImageUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const token = useAuthStore((s) => s.token);

  const load = async () => {
    setLoading(true);
    try {
      const s = await fetchCurrentSeason();
      setSeason(s);
      if (s) {
        const lb = await fetchLeaderboard(s.id, 10).catch(() => ({ items: [] as PhotoMimicEntry[], total: 0 }));
        setEntries(lb.items);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const onSubmit = async () => {
    if (!season || !imageUrl.trim()) return;
    setSubmitting(true);
    try {
      await submitMimicEntry({ season_id: season.id, source_image_url: imageUrl.trim(), caption: caption.trim() || undefined });
      showAxpToast({ amount: 30, emoji: "📸", reason: { en: "Photo Mimic entry reward", zh: "宠物模仿秀参赛奖励" } });
      setImageUrl("");
      setCaption("");
      window.dispatchEvent(new CustomEvent("agentrix:axp-changed"));
      void load();
    } catch (e: any) {
      alert(e?.message ?? "提交失败");
    }
    setSubmitting(false);
  };

  const onVote = async (entryId: string) => {
    try {
      const res = await castMimicVote(entryId);
      showAxpToast({
        amount: 0,
        emoji: "🗳",
        reason: { en: `Voted · ${res.daily_votes_remaining} left`, zh: `已投票 · 今日剩 ${res.daily_votes_remaining} 票` },
      });
      void load();
    } catch (e: any) {
      alert(e?.message ?? "投票失败");
    }
  };

  if (loading) return <div style={muted}>加载中…</div>;
  if (!season) return <div style={emptyBox}>暂无活跃赛季 · 请稍后再来</div>;

  return (
    <>
      <div style={{ padding: "8px 0 12px" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#e5e7eb" }}>
          {season.theme_title_zh || season.theme_title_en}
        </div>
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
          {season.theme_desc_zh || season.theme_desc_en}
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: "#fbbf24", fontWeight: 700 }}>
          🏆 奖金池 {Number(season.prize_pool_axp).toLocaleString()} AXP
        </div>
      </div>

      {season.status === "submitting" && token && (
        <div style={submitBlock}>
          <div style={{ fontSize: 12, color: "#e5e7eb", marginBottom: 6, fontWeight: 700 }}>📸 参赛</div>
          <input
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="图片 URL (https://...)"
            style={inputStyle}
          />
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="描述（可选）"
            style={{ ...inputStyle, marginTop: 6 }}
          />
          <button
            onClick={onSubmit}
            disabled={submitting || !imageUrl.trim()}
            style={{ ...primaryBtn, marginTop: 8, opacity: !imageUrl.trim() ? 0.5 : 1 }}
          >
            {submitting ? "提交中…" : "🚀 提交 (+30 AXP)"}
          </button>
        </div>
      )}

      <div style={sectionHeading}>排行榜</div>
      {entries.length === 0 ? (
        <div style={emptyBox}>还没有作品 · 成为第一个！</div>
      ) : (
        <div style={gridStyle}>
          {entries.map((entry, idx) => (
            <div key={entry.id} style={entryCard}>
              <div style={rankBadge}>#{idx + 1}</div>
              {entry.sourceImageUrl ? (
                <img src={entry.sourceImageUrl} style={entryImage} alt="" />
              ) : (
                <div style={entryImagePlaceholder}>📷</div>
              )}
              <div style={{ padding: 6 }}>
                <div style={{ fontSize: 11, color: "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.caption || "—"}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: "#9ca3af" }}>🗳 {entry.voteCount}</span>
                  {season.status === "voting" && (
                    <button style={voteBtn} onClick={() => onVote(entry.id)}>投票</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────

const backdropStyle: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 9700, display: "flex", justifyContent: "flex-end",
};
const sheetStyle: CSSProperties = {
  width: 400, height: "100%", background: "rgba(18,22,32,0.98)",
  borderLeft: "1px solid rgba(255,255,255,0.08)",
  display: "flex", flexDirection: "column", color: "#e5e7eb",
};
const headerStyle: CSSProperties = {
  padding: 14, borderBottom: "1px solid rgba(255,255,255,0.06)",
  display: "flex", justifyContent: "space-between", alignItems: "center",
};
const titleStyle: CSSProperties = { fontSize: 16, fontWeight: 800 };
const closeBtn: CSSProperties = {
  background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "#9ca3af",
  borderRadius: 8, padding: "4px 9px", cursor: "pointer", fontSize: 12,
};
const tabsRow: CSSProperties = { display: "flex", gap: 6, padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)" };
const tabBtn: CSSProperties = {
  flex: 1, padding: "6px 8px", fontSize: 11, fontWeight: 600, borderRadius: 999,
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#9ca3af", cursor: "pointer",
};
const tabBtnActive: CSSProperties = { background: "#22d3ee", color: "#0b1220", border: "1px solid #22d3ee" };
const bodyStyle: CSSProperties = { flex: 1, overflowY: "auto", padding: "12px 14px" };
const sectionLead: CSSProperties = { fontSize: 12, color: "#9ca3af", marginBottom: 14, lineHeight: 1.5 };
const sectionHeading: CSSProperties = { fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, margin: "12px 0 8px", fontWeight: 700 };
const muted: CSSProperties = { color: "#9ca3af", textAlign: "center", padding: "24px 0", fontSize: 12 };
const emptyBox: CSSProperties = {
  padding: 16, textAlign: "center", color: "#9ca3af", fontSize: 12,
  background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)",
};
const rowCard: CSSProperties = {
  padding: 12, borderRadius: 10, marginBottom: 8,
  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
};
const rowHead: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 };
const rowMeta: CSSProperties = { fontSize: 11, color: "#9ca3af", marginBottom: 8 };
const pill: CSSProperties = { padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600, textTransform: "uppercase" };
const smallBtn: CSSProperties = {
  padding: "5px 10px", fontSize: 11, borderRadius: 8, cursor: "pointer",
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#e5e7eb",
};
const gridStyle: CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
};
const cardStyle: CSSProperties = {
  padding: 10, borderRadius: 10,
  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
};
const submitBlock: CSSProperties = {
  padding: 12, borderRadius: 10, marginBottom: 12,
  background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.25)",
};
const inputStyle: CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  background: "rgba(11,18,32,0.7)", border: "1px solid rgba(255,255,255,0.1)",
  color: "#e5e7eb", fontSize: 12, boxSizing: "border-box" as any,
};
const primaryBtn: CSSProperties = {
  width: "100%", padding: "10px", background: "#22d3ee", border: "none",
  borderRadius: 8, color: "#0b1220", fontWeight: 800, fontSize: 13, cursor: "pointer",
};
const entryCard: CSSProperties = {
  position: "relative", borderRadius: 10, overflow: "hidden",
  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
};
const rankBadge: CSSProperties = {
  position: "absolute", top: 6, left: 6, background: "rgba(0,0,0,0.7)", color: "#fff",
  fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, zIndex: 1,
};
const entryImage: CSSProperties = { width: "100%", aspectRatio: "1/1", objectFit: "cover" as any, display: "block" };
const entryImagePlaceholder: CSSProperties = {
  width: "100%", aspectRatio: "1/1", display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 28, background: "rgba(255,255,255,0.04)",
};
const voteBtn: CSSProperties = {
  padding: "3px 8px", fontSize: 10, fontWeight: 700, borderRadius: 6,
  background: "#22d3ee", color: "#0b1220", border: "none", cursor: "pointer",
};
