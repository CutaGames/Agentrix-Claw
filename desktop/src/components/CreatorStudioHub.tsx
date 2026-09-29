/**
 * CreatorStudioHub — unified creator workbench.
 *
 * Sprint DD. Right-click menu → "🎨 Creator Studio" opens this hub, which
 * routes to the existing specialized panels (Pet Creator / Video Studio /
 * Wardrobe / Photo Mimic) through a shared top-tab layout.
 *
 * The individual panels remain the single source of truth for their
 * functionality — this hub is a *launcher + context* layer. We don't
 * re-implement pet generation or video composition here.
 */
import { useState } from "react";
import type { CSSProperties } from "react";
import WorldCreatorPanel from "./WorldCreatorPanel";
import PetCreatorPanel from "./PetCreatorPanel";
import VideoStudioPanel from "./VideoStudioPanel";
import WardrobePanel from "./WardrobePanel";
import SocialPanel from "./SocialPanel";
import PosterWorkshop from "./PosterWorkshop";

type Tab = "pet" | "poster" | "video" | "skin" | "mimic" | "world";

interface Props {
  visible: boolean;
  initialTab?: Tab;
  onClose: () => void;
}

const TABS: Array<{ key: Tab; emoji: string; label: string; hint: string }> = [
  { key: "pet",    emoji: "🐾", label: "Pet Creator",    hint: "文字 / 图片 → 3D 萌宠 + 多形态" },
  { key: "poster", emoji: "🎨", label: "Poster",         hint: "海报 / 社交图 / 路演物料" },
  { key: "video",  emoji: "🎬", label: "Video Studio",   hint: "单镜头 / 多场景剧情" },
  { key: "skin",   emoji: "👗", label: "Wardrobe",       hint: "皮肤 · 切换装备 · 上架市场" },
  { key: "mimic",  emoji: "📸", label: "Photo Mimic",    hint: "每周赛季 · 冠军 5000 AXP" },
  { key: "world",  emoji: "🌐", label: "World",          hint: "Tier_C 世界创作器(AI World Creation v6)" },
];

export default function CreatorStudioHub({ visible, initialTab = "pet", onClose }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  // World Creation (v6) — Tier_C creator launcher state (entered Plot ID + open).
  const [wcPlotInput, setWcPlotInput] = useState("");
  const [wcPlotId, setWcPlotId] = useState<string | null>(null);

  if (!visible) return null;

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={shellStyle} onClick={(e) => e.stopPropagation()}>
        {/* Top header with tabs + AXP-reward hint */}
        <div style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🎨</span>
            <div>
              <div style={titleStyle}>Creator Studio</div>
              <div style={subtitleStyle}>每次成功上架 · 被装备 · 赢赛季 → AXP 奖励</div>
            </div>
          </div>
          <button style={closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={tabsRow}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                ...tabBtn,
                ...(tab === t.key ? tabBtnActive : {}),
              }}
              title={t.hint}
            >
              <span style={{ fontSize: 15 }}>{t.emoji}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div style={rewardHintRow}>
          {TABS.find((t) => t.key === tab)?.hint}
          <span style={axpHintStyle}>💎 生成完成 · 上架 · 被赞 · 赢赛季 都给 AXP</span>
        </div>

        {/* Routed content */}
        <div style={bodyStyle}>
          {tab === "pet"    && <PetCreatorPanel onClose={onClose} />}
          {tab === "poster" && <PosterWorkshop onClose={onClose} />}
          {tab === "video"  && <VideoStudioPanel onClose={onClose} />}
          {tab === "skin"   && <WardrobePanel onClose={onClose} />}
          {tab === "mimic"  && <SocialPanel visible={true} initialTab="mimic" onClose={onClose} />}
          {tab === "world"  && (
            <div style={worldLauncherStyle}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)", marginBottom: 8 }}>
                🌐 World 创作器 · Tier_C
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 16 }}>
                在桌面端创作 Tier_C(沙箱 WASM 逻辑)世界体验。<br />
                · 从移动端派发来的 Tier_C 创作任务会<b>自动</b>在此打开。<br />
                · 手动创作:先在移动端/地图获取一个 Plot,然后在下方输入它的 Plot ID。
              </div>
              <input
                style={worldInputStyle}
                placeholder="输入 Plot ID,例如 plot_8842"
                value={wcPlotInput}
                onChange={(e) => setWcPlotInput(e.target.value)}
              />
              <button
                style={wcPlotInput.trim() ? worldOpenBtn : worldOpenBtnDisabled}
                disabled={!wcPlotInput.trim()}
                onClick={() => setWcPlotId(wcPlotInput.trim())}
              >
                打开 Tier_C 创作器
              </button>
            </div>
          )}
        </div>
      </div>
      {/* World Creation (v6) Tier_C creator — opens over the hub for the entered Plot. */}
      {wcPlotId && (
        <WorldCreatorPanel
          visible
          plotId={wcPlotId}
          onClose={() => setWcPlotId(null)}
        />
      )}
    </div>
  );
}

const backdropStyle: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9750,
  display: "flex", alignItems: "center", justifyContent: "center",
};

const worldLauncherStyle: CSSProperties = {
  padding: "8px 4px",
  maxWidth: 520,
};

const worldInputStyle: CSSProperties = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: 13,
  padding: "9px 11px",
  boxSizing: "border-box",
  marginBottom: 12,
  outline: "none",
};

const worldOpenBtn: CSSProperties = {
  background: "linear-gradient(135deg, #00d4ff, #0096c7)",
  border: "none",
  color: "#05121a",
  fontWeight: 700,
  fontSize: 13,
  padding: "9px 18px",
  borderRadius: 8,
  cursor: "pointer",
};

const worldOpenBtnDisabled: CSSProperties = { ...worldOpenBtn, opacity: 0.5, cursor: "not-allowed" };

const shellStyle: CSSProperties = {
  width: "min(1100px, 92vw)",
  height: "min(780px, 90vh)",
  background: "var(--bg-panel)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  color: "var(--text-card)",
};

const headerStyle: CSSProperties = {
  padding: "14px 18px",
  borderBottom: "1px solid var(--border-light)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const titleStyle: CSSProperties = { fontSize: 18, fontWeight: 800, letterSpacing: -0.3 };
const subtitleStyle: CSSProperties = { fontSize: 11, color: "var(--text-muted)", marginTop: 2 };

const closeBtn: CSSProperties = {
  background: "transparent", border: "1px solid var(--border-strong)", color: "var(--text-muted)",
  borderRadius: 8, padding: "4px 9px", cursor: "pointer", fontSize: 12,
};

const tabsRow: CSSProperties = {
  display: "flex", gap: 6, padding: "10px 14px",
  borderBottom: "1px solid var(--border-light)",
};

const tabBtn: CSSProperties = {
  display: "flex", alignItems: "center", gap: 6,
  padding: "7px 14px", borderRadius: 10, cursor: "pointer",
  background: "var(--bg-card)", border: "1px solid var(--border)",
  color: "var(--text-muted)", fontSize: 12, fontWeight: 600,
};

const tabBtnActive: CSSProperties = {
  background: "linear-gradient(135deg, rgba(34,211,238,0.25), rgba(167,139,250,0.2))",
  border: "1px solid rgba(34,211,238,0.55)",
  color: "#22d3ee",
};

const rewardHintRow: CSSProperties = {
  padding: "8px 18px",
  background: "rgba(34,211,238,0.06)",
  borderBottom: "1px solid rgba(34,211,238,0.16)",
  fontSize: 11, color: "var(--text-muted)",
  display: "flex", justifyContent: "space-between", alignItems: "center",
  gap: 12, flexWrap: "wrap",
};

const axpHintStyle: CSSProperties = { color: "#22d3ee", fontWeight: 600 };

const bodyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  position: "relative",
  overflow: "hidden",
  // Child panels use position:fixed but Hub clips them via this container
};
