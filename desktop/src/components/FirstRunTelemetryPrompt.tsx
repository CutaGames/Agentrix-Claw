/**
 * FirstRunTelemetryPrompt — soft opt-in nudge (Sprint G-2 / US-G2-4).
 *
 * Shows ONCE, at least 3 days after the user finished onboarding. After
 * the user makes a choice (开启 / 先不用) or closes the toast, it never
 * re-appears.
 *
 * Telemetry is OFF by default — this component only requests permission;
 * it does not flip the flag itself except when the user clicks 开启.
 */
import { useEffect, useState } from "react";
import { optInAnalytics, optOutAnalytics } from "../services/analytics";

const PROMPT_SHOWN_KEY = "agentrix_telemetry_prompt_shown";
const ONBOARDED_AT_KEY = "agentrix_onboarded_at";
const MIN_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export default function FirstRunTelemetryPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(PROMPT_SHOWN_KEY) === "1") return;
    const onboardedAtRaw = localStorage.getItem(ONBOARDED_AT_KEY);
    if (!onboardedAtRaw) return;
    const onboardedAt = Number(onboardedAtRaw);
    if (!Number.isFinite(onboardedAt) || onboardedAt <= 0) return;
    if (Date.now() - onboardedAt < MIN_AGE_MS) return;
    setShow(true);
  }, []);

  if (!show) return null;

  function dismiss(reason: "opt_in" | "opt_out" | "later") {
    try {
      localStorage.setItem(PROMPT_SHOWN_KEY, "1");
    } catch {}
    if (reason === "opt_in") {
      optInAnalytics();
    } else if (reason === "opt_out") {
      // Be explicit — sets opt-in to '0' so isAnalyticsOptedIn() reads false.
      optOutAnalytics();
    }
    setShow(false);
  }

  return (
    <div
      data-testid="first-run-telemetry-prompt"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 9700,
        maxWidth: 320,
        padding: 14,
        borderRadius: 10,
        background: "var(--bg-elevated)",
        color: "var(--text-card)",
        border: "1px solid rgba(167, 139, 250, 0.35)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>帮助我们改进 Agentrix</div>
      <div style={{ color: "var(--text-muted)", marginBottom: 12 }}>
        是否愿意分享匿名使用数据？崩溃报告独立机制，仅含设备指纹。
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => dismiss("opt_in")}
          style={{
            flex: 1,
            padding: "6px 12px",
            background: "#a78bfa",
            color: "#0f172a",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          开启
        </button>
        <button
          onClick={() => dismiss("opt_out")}
          style={{
            flex: 1,
            padding: "6px 12px",
            background: "transparent",
            color: "var(--text-muted)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 6,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          先不用
        </button>
      </div>
    </div>
  );
}
