/**
 * ComputeNodeSection — Settings panel block for D-MESH Phase 2 opt-in
 * local compute. Hardware-aware: unsupported machines see nothing;
 * supported machines see their tier + a per-capability download list.
 *
 * Phase 2.A delivers detection + UI. Phase 2.B will wire downloads to
 * the existing OtaModelDownloadService. Phase 2.C wires routing to
 * the local sidecar.
 *
 * Desktop D0 copy rule (brief item 9, product doc 6.3): until Machine
 * Economy is unfrozen this page only talks about the owner's own tasks.
 * Running work for the platform or other people's agents, and any earnings,
 * may only appear as "规划中" — never as an available option.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  detectHardwareProfile,
  tierDescription,
  tierEmoji,
  tierLabel,
  CAPABILITY_PACKS,
  capabilityPackText,
  shouldShowLocalComputeOption,
  type HardwareProfile,
} from "../services/hardwareProfile";
import { useI18n } from "../i18n/I18nProvider";
import { pickFor } from "../i18n/pick";

export default function ComputeNodeSection() {
  const { locale } = useI18n();
  const p = pickFor(locale);
  const [profile, setProfile] = useState<HardwareProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem("agentrix_compute_node_enabled") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;
    detectHardwareProfile()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persistEnabled = (next: boolean) => {
    setEnabled(next);
    try {
      localStorage.setItem("agentrix_compute_node_enabled", next ? "1" : "0");
    } catch {}
    window.dispatchEvent(new CustomEvent("agentrix:compute-node-changed", { detail: { enabled: next } }));
  };


  if (loading) {
    return (
      <div style={section}>
        <div style={sectionTitle}>🖥 {p("本地算力节点", "Local compute node")}</div>
        <div style={hint}>{p("检测硬件中…", "Checking hardware…")}</div>
      </div>
    );
  }

  // D-MESH Phase 2 UX rule #1: don't show an enable button to
  // unsupported hardware. They just see the cloud-only fallback note.
  if (!profile || !shouldShowLocalComputeOption(profile)) {
    return (
      <div style={section}>
        <div style={sectionTitle}>🖥 {p("本地算力节点", "Local compute node")}</div>
        <div style={hint}>
          {p(
            "你的硬件不适合本地模型运行。Agentrix 的所有生成功能依然正常 — 平台走云端服务（Meshy / Hunyuan3D / Fal），由我们付费。你什么都不用做。",
            "Your hardware isn't suited to running local models. Everything in Agentrix still works: generation runs on cloud services (Meshy / Hunyuan3D / Fal), paid for by us. You don't need to do anything.",
          )}
        </div>
      </div>
    );
  }

  const tier = profile.recommended_tier;
  const tierName = `${tierEmoji(tier)} ${tierLabel(tier, locale)}`;

  return (
    <div style={section}>
      <div style={sectionTitle}>🖥 {p("本地算力节点", "Local compute node")} · opt-in</div>

      {/* Hardware snapshot */}
      <div style={box}>
        <div style={row}>
          <span style={label}>{p("检测到的硬件", "Detected hardware")}</span>
        </div>
        <div style={{ ...row, alignItems: "flex-start" }}>
          <div style={{ fontSize: 12, color: "var(--text)" }}>
            {profile.gpu_name ? (
              <>
                <b>{p("GPU：", "GPU: ")}</b> {profile.gpu_name}
                {profile.gpu_vram_mb ? ` · ${Math.round(profile.gpu_vram_mb / 1024)} GB VRAM` : ""}
              </>
            ) : (
              <b>{p("GPU：未检测到独立显卡", "GPU: no discrete graphics card detected")}</b>
            )}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
          {profile.cpu_cores} cores · {Math.round(profile.ram_total_mb / 1024)} GB RAM · {profile.os}
        </div>
        <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.25)" }}>
          <div style={{ fontSize: 12, color: "var(--tone-info-text)", fontWeight: 700 }}>{tierName}</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4, lineHeight: 1.5 }}>
            {tierDescription(tier, locale)}
          </div>
        </div>
      </div>

      {/* Master switch */}
      <div style={{ ...row, marginTop: 12, justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
            {p("启用本地算力节点", "Turn on the local compute node")}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
            {p("打开后，你自己发起的生成任务会优先在这台电脑上运行。不打开也完全不影响使用。", "Once on, generation tasks you start run on this computer first. Leaving it off doesn't affect how you use the app.")}
          </div>
        </div>
        <Toggle checked={enabled} onChange={persistEnabled} />
      </div>

      {enabled && (
        <>
          {/* Machine Economy is frozen: planned only, no toggle. */}
          <div data-testid="compute-node-planned" style={{ ...box, marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
              {p("空闲时替别的 Agent 干活（规划中）", "Work for other Agents when idle (planned)")}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2, lineHeight: 1.5 }}>
              {p("还没有开放，也没有收益。开放之前，这台电脑只运行你自己的任务。", "Not open yet, and there are no earnings. Until it opens, this computer only runs your own tasks.")}
            </div>
          </div>

          {/* Capability packs */}
          <div style={{ marginTop: 14 }}>
            <div style={label}>{p("可下载能力包（全部可选）", "Capability packs to download (all optional)")}</div>
            <div style={{ marginTop: 6 }}>
              {CAPABILITY_PACKS.map((pack) => {
                const available = pack.requires_tier.includes(tier);
                const sizeLabel = pack.size_mb >= 1024
                  ? `${(pack.size_mb / 1024).toFixed(1)} GB`
                  : `${pack.size_mb} MB`;
                return (
                  <div
                    key={pack.id}
                    style={{
                      ...packRow,
                      opacity: available ? 1 : 0.45,
                      cursor: available ? "pointer" : "default",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                        {capabilityPackText(pack, locale).label}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
                        {capabilityPackText(pack, locale).description}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{sizeLabel}</span>
                      {available ? (
                        <button type="button" style={{ ...downloadBtn, opacity: 0.5, cursor: "not-allowed" }} disabled>
                          {p("即将提供", "Coming soon")}
                        </button>
                      ) : (
                        <span style={{ fontSize: 10, color: "var(--text-dim)", fontStyle: "italic" }}>
                          {p("需更高档位", "Needs a higher tier")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 14, fontSize: 10, color: "var(--text-dim)", lineHeight: 1.6 }}>
            💡 {p("关键承诺：", "Our promises:")}<br />
            {p(
              "· 随时关闭 · 一键卸载所有模型释放磁盘 · GPU > 80℃ 自动暂停 10 分钟 · 失败自动降级云端",
              "· Turn it off any time · remove all models in one click to free disk · pauses 10 minutes when the GPU passes 80°C · falls back to the cloud on failure",
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
        background: checked ? "var(--accent)" : "transparent",
        position: "relative",
        cursor: "pointer",
        transition: "all 180ms ease",
      }}
      aria-checked={checked}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 22 : 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 180ms ease",
        }}
      />
    </button>
  );
}

const section: CSSProperties = { marginTop: 16, padding: "14px 0", borderTop: "1px solid var(--border)" };
const sectionTitle: CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 8, letterSpacing: 0.3 };
const hint: CSSProperties = { fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 };
const box: CSSProperties = { padding: 12, borderRadius: 10, background: "var(--bg-card)", border: "1px solid var(--border)" };
const row: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const label: CSSProperties = { fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 };
const packRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 10px", borderRadius: 8, background: "var(--bg-card)", border: "1px solid var(--border)", marginBottom: 6 };
const downloadBtn: CSSProperties = { padding: "4px 10px", fontSize: 11, fontWeight: 700, borderRadius: 6, background: "var(--accent)", color: "var(--text-on-accent)", border: "none", cursor: "pointer" };
