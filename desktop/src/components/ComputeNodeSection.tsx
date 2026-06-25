/**
 * ComputeNodeSection — Settings panel block for D-MESH Phase 2 opt-in
 * local compute. Hardware-aware: unsupported machines see nothing;
 * supported machines see their tier + a per-capability download list.
 *
 * Phase 2.A delivers detection + UI. Phase 2.B will wire downloads to
 * the existing OtaModelDownloadService. Phase 2.C wires routing to
 * the local sidecar.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  detectHardwareProfile,
  tierDescription,
  tierEmoji,
  tierLabel,
  CAPABILITY_PACKS,
  shouldShowLocalComputeOption,
  type HardwareProfile,
} from "../services/hardwareProfile";

export default function ComputeNodeSection() {
  const [profile, setProfile] = useState<HardwareProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem("agentrix_compute_node_enabled") === "1";
    } catch {
      return false;
    }
  });
  const [quietHours, setQuietHours] = useState<boolean>(() => {
    try {
      return localStorage.getItem("agentrix_compute_quiet_hours") !== "0"; // default ON
    } catch {
      return true;
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

  const persistQuiet = (next: boolean) => {
    setQuietHours(next);
    try {
      localStorage.setItem("agentrix_compute_quiet_hours", next ? "1" : "0");
    } catch {}
  };

  if (loading) {
    return (
      <div style={section}>
        <div style={sectionTitle}>🖥 本地算力节点</div>
        <div style={hint}>检测硬件中…</div>
      </div>
    );
  }

  // D-MESH Phase 2 UX rule #1: don't show an enable button to
  // unsupported hardware. They just see the cloud-only fallback note.
  if (!profile || !shouldShowLocalComputeOption(profile)) {
    return (
      <div style={section}>
        <div style={sectionTitle}>🖥 本地算力节点</div>
        <div style={hint}>
          你的硬件不适合本地模型运行。Agentrix 的所有生成功能依然正常 —
          平台走云端服务（Meshy / Hunyuan3D / Fal），由我们付费。你什么都不用做。
        </div>
      </div>
    );
  }

  const tier = profile.recommended_tier;
  const tierName = `${tierEmoji(tier)} ${tierLabel(tier)}`;

  return (
    <div style={section}>
      <div style={sectionTitle}>🖥 本地算力节点 · opt-in</div>

      {/* Hardware snapshot */}
      <div style={box}>
        <div style={row}>
          <span style={label}>检测到的硬件</span>
        </div>
        <div style={{ ...row, alignItems: "flex-start" }}>
          <div style={{ fontSize: 12, color: "var(--text)" }}>
            {profile.gpu_name ? (
              <>
                <b>GPU：</b> {profile.gpu_name}
                {profile.gpu_vram_mb ? ` · ${Math.round(profile.gpu_vram_mb / 1024)} GB VRAM` : ""}
              </>
            ) : (
              <b>GPU：未检测到独立显卡</b>
            )}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
          {profile.cpu_cores} cores · {Math.round(profile.ram_total_mb / 1024)} GB RAM · {profile.os}
        </div>
        <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.25)" }}>
          <div style={{ fontSize: 12, color: "#22d3ee", fontWeight: 700 }}>{tierName}</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4, lineHeight: 1.5 }}>
            {tierDescription(tier)}
          </div>
        </div>
      </div>

      {/* Master switch */}
      <div style={{ ...row, marginTop: 12, justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
            启用本地算力节点
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
            打开后，生成任务会优先路由到你的桌面。不打开也完全不影响使用。
          </div>
        </div>
        <Toggle checked={enabled} onChange={persistEnabled} />
      </div>

      {enabled && (
        <>
          {/* Quiet hours */}
          <div style={{ ...row, marginTop: 10, justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                安静时段（23:00 - 07:00 执行）
              </div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
                只在深夜路由云端分包任务。你主动触发的任务始终立即执行。
              </div>
            </div>
            <Toggle checked={quietHours} onChange={persistQuiet} />
          </div>

          {/* Capability packs */}
          <div style={{ marginTop: 14 }}>
            <div style={label}>可下载能力包（全部可选）</div>
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
                        {pack.label}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
                        {pack.description}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{sizeLabel}</span>
                      {available ? (
                        <button
                          style={downloadBtn}
                          onClick={() => alert(`Phase 2.B will wire the real download. Tracked: ${pack.id}`)}
                        >
                          下载
                        </button>
                      ) : (
                        <span style={{ fontSize: 10, color: "var(--text-dim)", fontStyle: "italic" }}>
                          需更高档位
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 14, fontSize: 10, color: "var(--text-dim)", lineHeight: 1.6 }}>
            💡 关键承诺：<br />
            · 随时关闭 · 一键卸载所有模型释放磁盘 · GPU &gt; 80℃ 自动暂停 10 分钟 · 失败自动降级云端
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
const downloadBtn: CSSProperties = { padding: "4px 10px", fontSize: 11, fontWeight: 700, borderRadius: 6, background: "var(--accent)", color: "#0b1220", border: "none", cursor: "pointer" };
