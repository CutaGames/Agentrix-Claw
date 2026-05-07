/**
 * ProviderPicker — themed dropdown of generation providers.
 *
 * Matches the dark/purple inline-style aesthetic used by VideoStudioPanel /
 * PetCreatorPanel. Live providers are clickable; coming_soon entries render
 * grouped at the bottom, dimmed and disabled.
 */
import { useEffect, useRef, useState } from "react";
import {
  list3dProviders,
  listVideoProviders,
  type GenerationProviderSummary,
} from "../services/videoStudio";

interface Props {
  modality: "video" | "3d";
  value: string;
  onChange: (id: string) => void;
}

const TIER_META: Record<string, { icon: string; color: string }> = {
  free: { icon: "🆓", color: "#10b981" },
  budget: { icon: "💰", color: "#f59e0b" },
  standard: { icon: "🔥", color: "#22d3ee" },
  premium: { icon: "💎", color: "#e879f9" },
};

const PANEL_BG = "#15151c";
const BORDER = "rgba(255,255,255,0.08)";
const ROW_HOVER = "rgba(108,92,231,0.18)";
const ROW_ACTIVE = "rgba(108,92,231,0.35)";

export default function ProviderPicker({ modality, value, onChange }: Props) {
  const [providers, setProviders] = useState<GenerationProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fetcher = modality === "video" ? listVideoProviders : list3dProviders;
    fetcher()
      .then((rows) => !cancelled && setProviders(rows))
      .catch(() => !cancelled && setProviders([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [modality]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = providers.find((p) => p.id === value);
  const live = providers.filter((p) => p.status === "live");
  const coming = providers.filter((p) => p.status === "coming_soon");

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          background: "rgba(255,255,255,0.06)",
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: "10px 12px",
          color: "var(--text, #eee)",
          fontSize: 13,
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {selected ? (
          <>
            <span style={{ fontSize: 16 }}>{TIER_META[selected.tier]?.icon || "•"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {selected.name}
                {selected.chinaAvailable && (
                  <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>🇨🇳</span>
                )}
              </div>
              <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>
                {selected.vendor} · {selected.pricingLabel}
              </div>
            </div>
          </>
        ) : (
          <span style={{ opacity: 0.5 }}>{loading ? "加载 Provider..." : "选择 Provider"}</span>
        )}
        <span style={{ opacity: 0.4, fontSize: 10 }}>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 10000,
            background: PANEL_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
            maxHeight: 380,
            overflowY: "auto",
          }}
        >
          {live.length > 0 && <GroupLabel>✅ 立即可用 · Live</GroupLabel>}
          {live.map((p) => (
            <Row
              key={p.id}
              p={p}
              selected={p.id === value}
              hovered={hoverId === p.id}
              onHover={setHoverId}
              onClick={() => {
                onChange(p.id);
                setOpen(false);
              }}
            />
          ))}

          {coming.length > 0 && <GroupLabel>🕐 Coming Soon</GroupLabel>}
          {coming.map((p) => (
            <Row key={p.id} p={p} selected={false} hovered={false} onHover={() => {}} disabled />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "8px 12px 4px",
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: 1,
        color: "rgba(255,255,255,0.4)",
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

function Row({
  p,
  selected,
  hovered,
  onHover,
  onClick,
  disabled,
}: {
  p: GenerationProviderSummary;
  selected: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const meta = TIER_META[p.tier] || TIER_META.standard;
  return (
    <div
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => !disabled && onHover(p.id)}
      onMouseLeave={() => !disabled && onHover(null)}
      style={{
        padding: "10px 12px",
        cursor: disabled ? "not-allowed" : "pointer",
        background: selected ? ROW_ACTIVE : hovered ? ROW_HOVER : "transparent",
        opacity: disabled ? 0.45 : 1,
        borderTop: `1px solid rgba(255,255,255,0.04)`,
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1, marginTop: 1 }}>{meta.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
          <span>{p.name}</span>
          <span
            style={{
              fontSize: 10,
              color: meta.color,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {p.tier}
          </span>
          {p.chinaAvailable && <span style={{ fontSize: 10, opacity: 0.7 }}>🇨🇳</span>}
          {disabled && (
            <span
              style={{
                marginLeft: "auto",
                fontSize: 10,
                background: "rgba(255,255,255,0.08)",
                padding: "2px 6px",
                borderRadius: 4,
                opacity: 0.85,
              }}
            >
              Coming Soon
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
          {p.vendor} · {p.pricingLabel}
          {p.latencyHint && ` · ⏱ ${p.latencyHint}`}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
          {p.strength}
        </div>
      </div>
    </div>
  );
}
