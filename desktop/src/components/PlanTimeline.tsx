import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPlan, streamPlan, type Plan, type PlanArtifact, type PlanEvent, type PlanStep } from "../services/planStream";
import { useAuthStore } from "../services/store";

interface Props {
  planId: string;
  onClose?: () => void;
}

const STATUS_COLORS: Record<PlanStep["status"], string> = {
  pending: "#64748b",
  running: "#3b82f6",
  done: "#10b981",
  failed: "#ef4444",
  skipped: "#94a3b8",
};

/**
 * PlanTimeline (P0-#4 Desktop Claw 化) — renders a single plan with live SSE
 * updates. Step status, durations, and artifacts (esp. slides_generate
 * previewHtml) are shown inline.
 */
export default function PlanTimeline({ planId, onClose }: Props) {
  const token = useAuthStore((s) => s.token);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const handleRef = useRef<{ close(): void } | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    fetchPlan(planId, token)
      .then((p) => {
        if (!cancelled) setPlan(p);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || String(e));
      });

    const handle = streamPlan(
      planId,
      token,
      (e: PlanEvent) => {
        setConnected(true);
        applyEvent(e, setPlan);
      },
      (err) => setError(err.message),
    );
    handleRef.current = handle;
    return () => {
      cancelled = true;
      handle.close();
      handleRef.current = null;
    };
  }, [planId, token]);

  const totalMs = useMemo(() => {
    if (!plan?.startedAt) return 0;
    const end = plan.finishedAt ?? Date.now();
    return Math.max(0, end - plan.startedAt);
  }, [plan]);

  if (!token) {
    return <Empty>请先登录后查看任务计划</Empty>;
  }
  if (error && !plan) {
    return <Empty error>加载失败：{error}</Empty>;
  }
  if (!plan) {
    return <Empty>加载中…</Empty>;
  }

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#f1f5f9" }}>{plan.title}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
            {plan.intent}
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
            状态: <StatusPill status={plan.status} /> · 步骤 {plan.steps.length} ·
            {plan.startedAt ? ` 已用 ${(totalMs / 1000).toFixed(1)}s` : " 未启动"}
            {connected ? " · 🟢 实时" : " · ⚪ 离线"}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} style={closeBtnStyle}>关闭</button>
        )}
      </header>
      <div style={timelineStyle}>
        {plan.steps.map((step, idx) => (
          <StepCard key={step.id} step={step} index={idx} />
        ))}
      </div>
    </div>
  );
}

function StepCard({ step, index }: { step: PlanStep; index: number }) {
  const color = STATUS_COLORS[step.status];
  return (
    <div style={{ ...stepCardStyle, borderLeftColor: color }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ ...stepIndexStyle, background: color }}>{index + 1}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: "#f1f5f9", fontWeight: 500 }}>{step.description}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            <code style={kindStyle}>{step.kind}</code>
            {step.durationMs !== undefined && (
              <span style={{ marginLeft: 8 }}>{step.durationMs}ms</span>
            )}
          </div>
        </div>
        <StatusPill status={step.status} />
      </div>
      {step.error && (
        <div style={errorBoxStyle}>错误: {step.error}</div>
      )}
      {step.artifacts && step.artifacts.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {step.artifacts.map((a) => (
            <ArtifactCard key={a.id} artifact={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArtifactCard({ artifact }: { artifact: PlanArtifact }) {
  const [expanded, setExpanded] = useState(false);
  // Detect slides_generate output (has both markdown + previewHtml inside JSON content)
  const slidesPreview = useMemo(() => {
    if (artifact.kind !== "json" || !artifact.content) return null;
    try {
      const parsed = JSON.parse(artifact.content);
      if (parsed && typeof parsed.previewHtml === "string" && typeof parsed.markdown === "string") {
        return { previewHtml: parsed.previewHtml as string, slideCount: parsed.slideCount as number };
      }
    } catch { /* ignore */ }
    return null;
  }, [artifact.content, artifact.kind]);

  return (
    <div style={artifactCardStyle}>
      <div style={artifactHeaderStyle} onClick={() => setExpanded((v) => !v)}>
        <span style={{ fontSize: 11, opacity: 0.7 }}>{expanded ? "▼" : "▶"}</span>
        <span style={{ fontSize: 12, fontWeight: 500 }}>{artifact.title}</span>
        <span style={artifactKindStyle}>{slidesPreview ? "slides" : artifact.kind}</span>
        {artifact.bytes !== undefined && (
          <span style={{ fontSize: 10, opacity: 0.6, marginLeft: "auto" }}>{artifact.bytes}B</span>
        )}
      </div>
      {expanded && (
        <div style={{ padding: "8px 12px 12px" }}>
          {slidesPreview ? (
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
                {slidesPreview.slideCount} 页 — 内置预览
              </div>
              <iframe
                srcDoc={slidesPreview.previewHtml}
                style={{ width: "100%", height: 360, border: "1px solid #334155", borderRadius: 6, background: "#0f172a" }}
                sandbox=""
                title="Slides preview"
              />
            </div>
          ) : artifact.kind === "image" && artifact.url ? (
            <img src={artifact.url} alt={artifact.title} style={{ maxWidth: "100%", borderRadius: 4 }} />
          ) : artifact.url ? (
            <a href={artifact.url} target="_blank" rel="noreferrer" style={{ color: "#60a5fa", fontSize: 12 }}>
              {artifact.url}
            </a>
          ) : (
            <pre style={preStyle}>{artifact.content ?? "(empty)"}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLORS[status as PlanStep["status"]] || "#64748b";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 10,
        fontSize: 10,
        background: color + "22",
        color,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      {status}
    </span>
  );
}

function Empty({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <div style={{ padding: 32, textAlign: "center", color: error ? "#fca5a5" : "#94a3b8" }}>{children}</div>
  );
}

function applyEvent(e: PlanEvent, setPlan: React.Dispatch<React.SetStateAction<Plan | null>>) {
  setPlan((prev) => {
    if (e.type === "plan.snapshot") return e.plan;
    if (!prev) return prev;
    const next: Plan = { ...prev, steps: prev.steps.map((s) => ({ ...s })) };
    switch (e.type) {
      case "plan.started":
        next.status = "running";
        if (!next.startedAt) next.startedAt = e.at;
        break;
      case "plan.step.started": {
        const s = next.steps[e.index];
        if (s) {
          s.status = "running";
          s.startedAtMs = e.at;
        }
        break;
      }
      case "plan.step.artifact": {
        const s = next.steps.find((x) => x.id === e.stepId);
        if (s) s.artifacts = [...(s.artifacts ?? []), e.artifact];
        break;
      }
      case "plan.step.done": {
        const s = next.steps.find((x) => x.id === e.stepId);
        if (s) {
          s.status = "done";
          s.result = e.result;
          s.finishedAtMs = e.at;
          if (s.startedAtMs) s.durationMs = e.at - s.startedAtMs;
        }
        break;
      }
      case "plan.step.failed": {
        const s = next.steps.find((x) => x.id === e.stepId);
        if (s) {
          s.status = "failed";
          s.error = e.error;
          s.finishedAtMs = e.at;
        }
        break;
      }
      case "plan.done":
        next.status = "done";
        next.finishedAt = e.at;
        break;
      case "plan.failed":
        next.status = "failed";
        next.finishedAt = e.at;
        break;
    }
    return next;
  });
}

// ── styles ──────────────────────────────────────────────
const containerStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  background: "#0f172a",
  color: "#e2e8f0",
  fontFamily: "system-ui, -apple-system, sans-serif",
};
const headerStyle: React.CSSProperties = {
  padding: "16px 20px",
  borderBottom: "1px solid #1e293b",
  display: "flex",
  alignItems: "flex-start",
  gap: 16,
};
const closeBtnStyle: React.CSSProperties = {
  background: "#1e293b",
  color: "#cbd5e1",
  border: "1px solid #334155",
  borderRadius: 6,
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: 12,
};
const timelineStyle: React.CSSProperties = {
  flex: 1,
  overflow: "auto",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const stepCardStyle: React.CSSProperties = {
  background: "#1e293b",
  borderRadius: 8,
  padding: 12,
  borderLeft: "4px solid #64748b",
};
const stepIndexStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  fontSize: 11,
  fontWeight: 700,
};
const kindStyle: React.CSSProperties = {
  background: "#0f172a",
  padding: "1px 6px",
  borderRadius: 3,
  fontFamily: "monospace",
  fontSize: 10,
};
const errorBoxStyle: React.CSSProperties = {
  background: "#7f1d1d33",
  color: "#fca5a5",
  padding: 8,
  borderRadius: 4,
  fontSize: 12,
  marginTop: 8,
  border: "1px solid #7f1d1d",
};
const artifactCardStyle: React.CSSProperties = {
  background: "#0f172a",
  borderRadius: 6,
  border: "1px solid #334155",
  overflow: "hidden",
};
const artifactHeaderStyle: React.CSSProperties = {
  padding: "6px 10px",
  display: "flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
  background: "#1e293b",
  userSelect: "none",
};
const artifactKindStyle: React.CSSProperties = {
  fontSize: 10,
  background: "#0f172a",
  padding: "1px 6px",
  borderRadius: 3,
  color: "#cbd5e1",
};
const preStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  color: "#cbd5e1",
  maxHeight: 240,
  overflow: "auto",
};
