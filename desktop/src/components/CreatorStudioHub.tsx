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
import PetCreatorPanel from "./PetCreatorPanel";
import VideoStudioPanel from "./VideoStudioPanel";
import WardrobePanel from "./WardrobePanel";
import SocialPanel from "./SocialPanel";

type Tab = "pet" | "video" | "skin" | "mimic";

interface Props {
  visible: boolean;
  initialTab?: Tab;
  onClose: () => void;
}

const TABS: Array<{ key: Tab; emoji: string; label: string; hint: string }> = [
  { key: "pet",   emoji: "🐾", label: "Pet Creator",   hint: "文字 / 图片 → 3D 萌宠" },
  { key: "video", emoji: "🎬", label: "Video Studio",  hint: "单镜头 / 多场景剧情" },
  { key: "skin",  emoji: "👗", label: "Wardrobe",       hint: "皮肤 · 切换装备 · 市场" },
  { key: "mimic", emoji: "📸", label: "Photo Mimic",    hint: "每周赛季 · 冠军 5000 AXP" },
];

export default function CreatorStudioHub({ visible, initialTab = "pet", onClose }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);

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
          {tab === "pet"   && <PetCreatorPanel onClose={onClose} />}
          {tab === "video" && <VideoStudioPanel onClose={onClose} />}
          {tab === "skin"  && <WardrobePanel onClose={onClose} />}
          {tab === "mimic" && <SocialPanel visible={true} initialTab="mimic" onClose={onClose} />}
        </div>
      </div>
    </div>
  );
}

const backdropStyle: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9750,
  display: "flex", alignItems: "center", justifyContent: "center",
};

const shellStyle: CSSProperties = {
  width: "min(1100px, 92vw)",
  height: "min(780px, 90vh)",
  background: "rgba(18,22,32,0.98)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
  boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  color: "#e5e7eb",
};

const headerStyle: CSSProperties = {
  padding: "14px 18px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const titleStyle: CSSProperties = { fontSize: 18, fontWeight: 800, letterSpacing: -0.3 };
const subtitleStyle: CSSProperties = { fontSize: 11, color: "#9ca3af", marginTop: 2 };

const closeBtn: CSSProperties = {
  background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "#9ca3af",
  borderRadius: 8, padding: "4px 9px", cursor: "pointer", fontSize: 12,
};

const tabsRow: CSSProperties = {
  display: "flex", gap: 6, padding: "10px 14px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

const tabBtn: CSSProperties = {
  display: "flex", alignItems: "center", gap: 6,
  padding: "7px 14px", borderRadius: 10, cursor: "pointer",
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
  color: "#9ca3af", fontSize: 12, fontWeight: 600,
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
  fontSize: 11, color: "#9ca3af",
  display: "flex", justifyContent: "space-between", alignItems: "center",
  gap: 12, flexWrap: "wrap",
};

const axpHintStyle: CSSProperties = { color: "#22d3ee", fontWeight: 600 };

const bodyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  position: "relative",
  overflow: "hidden",
};
