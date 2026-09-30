/**
 * WardrobeVariantPanel — Sprint P-7 (2026-05-22).
 *
 * UI for switching the active pet variant (clan / skin / festival).
 * Wires into the `petVariant` store; changes immediately propagate to
 * every PetSpriteCanvas via the variant subscription, so the desktop
 * pet, title-bar avatar, and tray icon all change in lock-step.
 *
 * The panel is intentionally minimal — clan/skin/festival are picked
 * from a fixed catalog. New entries appear by adding their PNG sprite
 * folders to `desktop/public/pets/sprites/<clan>/<skin>/<festival>/`
 * and registering them in the catalogs below.
 *
 * Catalog entries can be empty (no entries) — the picker degrades
 * gracefully to "no options yet, default sprite stays in use".
 */
import { useState, type CSSProperties } from "react";
import {
  getPetVariant,
  setPetVariant,
  subscribePetVariant,
  type PetVariant,
} from "../services/petVariant";
import { useEffect } from "react";

interface CatalogEntry {
  /** Folder name under `/pets/sprites/<key>/...`. `null` means "default". */
  key: string | null;
  label: string;
  /** Optional emoji / icon shown next to the label. */
  emoji?: string;
  /** Optional human-readable hint. */
  hint?: string;
}

// Catalog of available clans. `null` = no clan override → use default.
const CLAN_CATALOG: CatalogEntry[] = [
  { key: null, label: "默认", emoji: "🐾", hint: "通用 sprite 集" },
  { key: "A_office", label: "A 氏族 · 办公狐", emoji: "💼", hint: "上班族属性" },
  { key: "B_creator", label: "B 氏族 · 创作者", emoji: "🎨", hint: "做内容的小狐狸" },
  { key: "C_maker", label: "C 氏族 · 工匠", emoji: "🛠️", hint: "动手党" },
];

// Catalog of available wardrobe skins. Some are gated behind subscription
// in the real product — for the variant picker we just list the keys;
// gating is enforced server-side by `mobilePetSdk.activateSkin()`.
const SKIN_CATALOG: CatalogEntry[] = [
  { key: null, label: "默认装扮", emoji: "✨" },
  { key: "academy", label: "学院风", emoji: "🎓" },
  { key: "ninja", label: "忍者装", emoji: "🥷" },
  { key: "pajama", label: "睡衣", emoji: "🛌" },
];

// Catalog of festivals — typically auto-applied by date but exposed here
// for preview / opt-out.
const FESTIVAL_CATALOG: CatalogEntry[] = [
  { key: null, label: "无装饰", emoji: "🚫" },
  { key: "spring", label: "春节", emoji: "🧧" },
  { key: "lunar-new-year", label: "元宵", emoji: "🏮" },
  { key: "christmas", label: "圣诞", emoji: "🎄" },
  { key: "halloween", label: "万圣", emoji: "🎃" },
];

interface Props {
  onClose?: () => void;
}

export default function WardrobeVariantPanel({ onClose }: Props) {
  const [variant, setVariantState] = useState<PetVariant>(() => getPetVariant());

  useEffect(() => subscribePetVariant(setVariantState), []);

  const apply = (patch: Partial<PetVariant>) => {
    setPetVariant(patch);
  };

  return (
    <div style={containerStyle} role="dialog" aria-label="衣柜 / 形态选择">
      <div style={headerStyle}>
        <div style={titleStyle}>👗 桌宠衣柜</div>
        {onClose && (
          <button onClick={onClose} style={closeBtnStyle} aria-label="关闭">
            ✕
          </button>
        )}
      </div>

      <div style={leadStyle}>
        选择氏族、装扮和节日装饰。变化会立刻同步到桌宠、标题栏头像和系统托盘。
        新装扮 sprite 包(放进 <code style={codeStyle}>desktop/public/pets/sprites/</code>)
        会自动出现在这里。
      </div>

      <Section
        title="氏族 (Clan)"
        catalog={CLAN_CATALOG}
        active={variant.clan ?? null}
        onPick={(k) => apply({ clan: k ?? undefined })}
      />

      <Section
        title="装扮 (Skin)"
        catalog={SKIN_CATALOG}
        active={variant.skin ?? null}
        onPick={(k) => apply({ skin: k ?? undefined })}
      />

      <Section
        title="节日装饰 (Festival)"
        catalog={FESTIVAL_CATALOG}
        active={variant.festival ?? null}
        onPick={(k) => apply({ festival: k ?? undefined })}
      />

      <div style={footerStyle}>
        <button
          onClick={() => apply({ clan: undefined, skin: undefined, festival: undefined })}
          style={resetBtnStyle}
        >
          ↺ 重置为默认
        </button>
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  catalog: CatalogEntry[];
  active: string | null;
  onPick: (key: string | null) => void;
}

function Section({ title, catalog, active, onPick }: SectionProps) {
  return (
    <div style={sectionStyle}>
      <div style={sectionTitleStyle}>{title}</div>
      <div style={tilesGridStyle}>
        {catalog.map((entry) => {
          const isActive = entry.key === active;
          return (
            <button
              key={entry.key ?? "__default__"}
              onClick={() => onPick(entry.key)}
              style={isActive ? tileActiveStyle : tileStyle}
              title={entry.hint || entry.label}
            >
              <div style={tileEmojiStyle}>{entry.emoji ?? "·"}</div>
              <div style={tileLabelStyle}>{entry.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const containerStyle: CSSProperties = {
  width: 480,
  maxHeight: "80vh",
  overflowY: "auto",
  padding: 20,
  background: "var(--bg-card)",
  color: "var(--text)",
  border: "1px solid var(--border-strong, var(--border))",
  borderRadius: 12,
  boxShadow: "var(--shadow)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 8,
};

const titleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: 0.4,
};

const closeBtnStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text-dim)",
  padding: "4px 10px",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 14,
};

const leadStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--text-dim)",
  marginBottom: 16,
  lineHeight: 1.5,
};

const codeStyle: CSSProperties = {
  background: "var(--code-bg, rgba(0,0,0,0.06))",
  color: "var(--code-fg, var(--text))",
  padding: "1px 6px",
  borderRadius: 4,
  fontSize: 11,
};

const sectionStyle: CSSProperties = {
  marginBottom: 18,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 0.8,
  color: "var(--accent-eyebrow)",
  marginBottom: 8,
};

const tilesGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
  gap: 8,
};

const tileStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  padding: "10px 8px",
  borderRadius: 10,
  background: "var(--bg-card-hover, var(--bg-overlay-light, rgba(0,0,0,0.04)))",
  border: "1px solid var(--border)",
  cursor: "pointer",
  color: "var(--text)",
  fontSize: 12,
  transition: "transform 120ms ease, border-color 120ms ease",
};

const tileActiveStyle: CSSProperties = {
  ...tileStyle,
  background: "rgba(108, 92, 231, 0.16)",
  border: "1.5px solid var(--accent)",
  color: "var(--accent)",
  fontWeight: 700,
  transform: "scale(1.02)",
};

const tileEmojiStyle: CSSProperties = {
  fontSize: 24,
  lineHeight: 1,
};

const tileLabelStyle: CSSProperties = {
  fontSize: 11,
  textAlign: "center",
  lineHeight: 1.3,
};

const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  paddingTop: 12,
  borderTop: "1px solid var(--border)",
};

const resetBtnStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text-dim)",
  padding: "6px 14px",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
};
