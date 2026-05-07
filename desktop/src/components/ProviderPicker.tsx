/**
 * ProviderPicker — dropdown of available video / 3D generation providers.
 *
 * Live providers are clickable; coming_soon entries appear with a badge
 * and disabled. Pricing label, vendor, latency, China-availability and tier
 * are surfaced inline so users can pick by quality vs cost.
 */
import { useEffect, useState } from "react";
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

const TIER_BADGE: Record<string, { label: string; cls: string }> = {
  free: { label: "🆓 Free", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  budget: { label: "💰 Budget", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  standard: { label: "🔥 Standard", cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
  premium: { label: "💎 Premium", cls: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
};

export default function ProviderPicker({ modality, value, onChange }: Props) {
  const [providers, setProviders] = useState<GenerationProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fetcher = modality === "video" ? listVideoProviders : list3dProviders;
    fetcher()
      .then((rows) => {
        if (!cancelled) setProviders(rows);
      })
      .catch(() => {
        if (!cancelled) setProviders([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modality]);

  const selected = providers.find((p) => p.id === value);
  const live = providers.filter((p) => p.status === "live");
  const coming = providers.filter((p) => p.status === "coming_soon");

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2 text-left text-sm hover:bg-white/10"
      >
        {selected ? (
          <span className="flex items-center gap-2 truncate">
            <span className="font-medium">{selected.name}</span>
            <span className="text-xs text-white/50">· {selected.vendor}</span>
            <span className="text-xs text-white/60">· {selected.pricingLabel}</span>
          </span>
        ) : (
          <span className="text-white/50">{loading ? "加载中…" : "选择 Provider"}</span>
        )}
        <span className="text-white/40">▾</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 max-h-[360px] w-full overflow-auto rounded-md border border-white/10 bg-[#1a1a1f] shadow-xl">
          {live.length > 0 && (
            <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-white/40">
              ✅ 立即可用
            </div>
          )}
          {live.map((p) => (
            <ProviderRow
              key={p.id}
              p={p}
              selected={p.id === value}
              onClick={() => {
                onChange(p.id);
                setOpen(false);
              }}
            />
          ))}

          {coming.length > 0 && (
            <div className="border-t border-white/5 px-3 py-1.5 text-[11px] uppercase tracking-wide text-white/40">
              🕐 Coming Soon
            </div>
          )}
          {coming.map((p) => (
            <ProviderRow key={p.id} p={p} selected={false} disabled />
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderRow({
  p,
  selected,
  disabled,
  onClick,
}: {
  p: GenerationProviderSummary;
  selected: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const badge = TIER_BADGE[p.tier] || TIER_BADGE.standard;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`block w-full px-3 py-2 text-left text-xs transition ${
        disabled ? "cursor-not-allowed opacity-60" : "hover:bg-white/10"
      } ${selected ? "bg-white/10" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-white">{p.name}</span>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${badge.cls}`}>
          {badge.label}
        </span>
        {p.chinaAvailable && (
          <span className="rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-300">
            🇨🇳
          </span>
        )}
        {disabled && (
          <span className="ml-auto rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60">
            Coming Soon
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-white/55">
        <span>{p.vendor}</span>
        <span>· {p.pricingLabel}</span>
        {p.latencyHint && <span>· ⏱ {p.latencyHint}</span>}
      </div>
      <div className="mt-0.5 text-[11px] text-white/45">{p.strength}</div>
    </button>
  );
}
