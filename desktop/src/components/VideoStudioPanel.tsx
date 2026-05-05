/**
 * VideoStudioPanel — desktop UI for generating promo / explainer videos.
 *
 * Two modes:
 *   - "Single Clip" (video_generate)  → one prompt, one short video
 *   - "Multi-Scene" (video_compose)   → array of {visualPrompt, narration}
 *                                        → narrated, subtitled, transitions
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "../services/store";
import {
  type VideoAspect,
  type VideoComposeScene,
  type VideoMode,
  type VideoTaskSummary,
  getVideoTask,
  listVideoTasks,
  submitComposeJob,
  submitVideoTask,
} from "../services/videoStudio";

interface Props {
  onClose: () => void;
}

type StudioMode = "single" | "compose";

const ASPECT_OPTIONS: VideoAspect[] = ["9:16", "16:9", "1:1"];

export default function VideoStudioPanel({ onClose }: Props) {
  const { activeInstanceId } = useAuthStore();
  const [studioMode, setStudioMode] = useState<StudioMode>("single");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<VideoTaskSummary[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Single-clip form state
  const [videoMode, setVideoMode] = useState<VideoMode>("text_to_video");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<VideoAspect>("9:16");
  const [duration, setDuration] = useState<"5" | "10">("5");
  const [referenceImageUrl, setReferenceImageUrl] = useState("");

  // Compose form state
  const [composeTitle, setComposeTitle] = useState("");
  const [composeLanguage, setComposeLanguage] = useState<"zh" | "en">("zh");
  const [composeScenes, setComposeScenes] = useState<VideoComposeScene[]>([
    { visualPrompt: "", narration: "", duration: 5 },
  ]);
  const [composeJob, setComposeJob] = useState<any>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listVideoTasks(30);
      setTasks(list);
    } catch (err: any) {
      console.warn("[VideoStudio] list failed:", err?.message || err);
    }
  }, []);

  useEffect(() => {
    refresh();
    pollTimer.current = setInterval(refresh, 8000);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [refresh]);

  const submitSingle = async () => {
    setError(null);
    if (videoMode === "text_to_video" && !prompt.trim()) {
      setError("请填写 prompt 描述视频内容");
      return;
    }
    if (videoMode !== "text_to_video" && !referenceImageUrl.trim()) {
      setError("此模式需要参考图片 URL");
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitVideoTask({
        mode: videoMode,
        prompt: prompt.trim() || undefined,
        aspectRatio: aspect,
        duration,
        referenceImageUrl: referenceImageUrl.trim() || undefined,
      });
      const tid: string | undefined = result?.taskId || result?.task?.taskId;
      if (tid) setActiveTaskId(tid);
      await refresh();
    } catch (err: any) {
      setError(err?.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const submitCompose = async () => {
    setError(null);
    if (!activeInstanceId) {
      setError("Compose 需要一个活跃的 OpenClaw 实例 — 请先在登录后选择实例");
      return;
    }
    const valid = composeScenes.filter((s) => s.visualPrompt.trim());
    if (valid.length === 0) {
      setError("至少需要 1 个有 visualPrompt 的场景");
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitComposeJob(activeInstanceId, {
        scenes: valid,
        title: composeTitle.trim() || undefined,
        language: composeLanguage,
        aspectRatio: aspect,
      });
      setComposeJob(result);
    } catch (err: any) {
      setError(err?.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const updateScene = (idx: number, patch: Partial<VideoComposeScene>) => {
    setComposeScenes((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  };

  const addScene = () => {
    if (composeScenes.length >= 12) return;
    setComposeScenes((prev) => [
      ...prev,
      { visualPrompt: "", narration: "", duration: 5 },
    ]);
  };

  const removeScene = (idx: number) => {
    setComposeScenes((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePollOne = async (taskId: string) => {
    try {
      await getVideoTask(taskId);
      await refresh();
    } catch (err: any) {
      console.warn("[VideoStudio] poll failed:", err?.message || err);
    }
  };

  const activeTask = tasks.find((t) => t.taskId === activeTaskId) || tasks[0];

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(15, 15, 30, 0.92)",
        zIndex: 9998,
        display: "flex",
        flexDirection: "column",
        color: "var(--text, #eee)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600 }}>🎬 视频工作室 · Video Studio</div>
        <button onClick={onClose} style={btnStyle}>关闭</button>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: form */}
        <div
          style={{
            flex: "0 0 420px",
            padding: 20,
            overflowY: "auto",
            borderRight: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <Section title="模式">
            <Tabs<StudioMode>
              value={studioMode}
              onChange={setStudioMode}
              options={[
                { value: "single", label: "单段视频" },
                { value: "compose", label: "多场景宣传片" },
              ]}
            />
          </Section>

          <Section title="画幅">
            <div style={{ display: "flex", gap: 6 }}>
              {ASPECT_OPTIONS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAspect(a)}
                  style={{
                    ...btnStyle,
                    flex: 1,
                    background: aspect === a ? "#6C5CE7" : "rgba(255,255,255,0.05)",
                    color: aspect === a ? "white" : "var(--text, #eee)",
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          </Section>

          {studioMode === "single" ? (
            <>
              <Section title="生成模式">
                <Tabs<VideoMode>
                  value={videoMode}
                  onChange={setVideoMode}
                  options={[
                    { value: "text_to_video", label: "文生视频" },
                    { value: "image_to_video", label: "图生视频" },
                    { value: "video_to_video", label: "视频转视频" },
                  ]}
                />
              </Section>
              <Section title="时长">
                <Tabs<"5" | "10">
                  value={duration}
                  onChange={setDuration}
                  options={[
                    { value: "5", label: "5 秒" },
                    { value: "10", label: "10 秒" },
                  ]}
                />
              </Section>
              <Section title="Prompt">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  placeholder="描述要生成的视频内容..."
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                />
              </Section>
              {videoMode !== "text_to_video" && (
                <Section title="参考图片 URL">
                  <input
                    type="url"
                    value={referenceImageUrl}
                    onChange={(e) => setReferenceImageUrl(e.target.value)}
                    placeholder="https://..."
                    style={inputStyle}
                  />
                </Section>
              )}
              {error && <div style={errStyle}>{error}</div>}
              <button
                onClick={submitSingle}
                disabled={submitting}
                style={primaryBtn(submitting)}
              >
                {submitting ? "提交中..." : "🚀 生成视频"}
              </button>
            </>
          ) : (
            <>
              <Section title="标题">
                <input
                  value={composeTitle}
                  onChange={(e) => setComposeTitle(e.target.value)}
                  placeholder="例如：Agentrix 30 秒宣传片"
                  style={inputStyle}
                />
              </Section>
              <Section title="旁白语言">
                <Tabs<"zh" | "en">
                  value={composeLanguage}
                  onChange={setComposeLanguage}
                  options={[
                    { value: "zh", label: "中文" },
                    { value: "en", label: "English" },
                  ]}
                />
              </Section>
              <Section title={`场景 ${composeScenes.length}/12`}>
                {composeScenes.map((s, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 8,
                      padding: 10,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, opacity: 0.7 }}>场景 #{idx + 1}</span>
                      {composeScenes.length > 1 && (
                        <button onClick={() => removeScene(idx)} style={{ ...btnStyle, fontSize: 10, padding: "2px 6px" }}>
                          ✕
                        </button>
                      )}
                    </div>
                    <textarea
                      value={s.visualPrompt}
                      onChange={(e) => updateScene(idx, { visualPrompt: e.target.value })}
                      placeholder="画面描述（visual prompt）"
                      rows={2}
                      style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", fontSize: 12 }}
                    />
                    <textarea
                      value={s.narration || ""}
                      onChange={(e) => updateScene(idx, { narration: e.target.value })}
                      placeholder="旁白文本（可选）"
                      rows={2}
                      style={{ ...inputStyle, marginTop: 6, resize: "vertical", fontFamily: "inherit", fontSize: 12 }}
                    />
                    <div style={{ marginTop: 6, fontSize: 11, opacity: 0.6 }}>
                      时长 (秒):{" "}
                      <input
                        type="number"
                        min={2}
                        max={15}
                        value={s.duration ?? 5}
                        onChange={(e) => updateScene(idx, { duration: Number(e.target.value) || 5 })}
                        style={{ ...inputStyle, width: 60, padding: "2px 6px", display: "inline-block" }}
                      />
                    </div>
                  </div>
                ))}
                <button onClick={addScene} disabled={composeScenes.length >= 12} style={{ ...btnStyle, width: "100%" }}>
                  + 添加场景
                </button>
              </Section>
              {error && <div style={errStyle}>{error}</div>}
              <button onClick={submitCompose} disabled={submitting} style={primaryBtn(submitting)}>
                {submitting ? "提交中..." : "🎬 开始合成"}
              </button>
              {composeJob && (
                <div style={{ marginTop: 12, padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 6, fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>Compose Job</div>
                  <pre style={{ margin: 0, fontSize: 10, opacity: 0.7, maxHeight: 200, overflow: "auto" }}>
                    {JSON.stringify(composeJob, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: tasks */}
        <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
          <div style={{ marginBottom: 16, fontSize: 13, opacity: 0.7 }}>
            最近任务 {tasks.length} 条 · 每 8 秒自动刷新
            <button onClick={refresh} style={{ ...btnStyle, marginLeft: 12 }}>立即刷新</button>
          </div>

          {activeTask && (
            <div
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                padding: 16,
                marginBottom: 20,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
                {activeTask.title || activeTask.prompt || activeTask.taskId}
              </div>
              <StatusBadge status={activeTask.status} />
              {activeTask.outputUrl ? (
                <div style={{ marginTop: 12 }}>
                  <video
                    src={activeTask.outputUrl}
                    controls
                    style={{ maxWidth: "100%", maxHeight: 480, borderRadius: 8, background: "black" }}
                  />
                  <div style={{ marginTop: 8 }}>
                    <a href={activeTask.outputUrl} target="_blank" rel="noreferrer" style={{ ...btnStyle, textDecoration: "none", display: "inline-block" }}>
                      下载视频
                    </a>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 12, padding: 40, textAlign: "center", opacity: 0.5, background: "rgba(0,0,0,0.3)", borderRadius: 8 }}>
                  视频尚未生成完成
                </div>
              )}
              {activeTask.error && (
                <div style={{ color: "#f87171", fontSize: 12, marginTop: 8 }}>
                  错误: {activeTask.error}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {tasks.map((t) => (
              <div
                key={t.taskId}
                onClick={() => setActiveTaskId(t.taskId)}
                style={{
                  cursor: "pointer",
                  background: t.taskId === activeTask?.taskId ? "rgba(108,92,231,0.18)" : "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 8,
                  padding: 10,
                }}
              >
                {t.thumbnailUrl ? (
                  <img src={t.thumbnailUrl} alt="" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 6 }} />
                ) : (
                  <div style={{ height: 120, borderRadius: 6, background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
                    🎞️
                  </div>
                )}
                <div style={{ fontSize: 12, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.title || t.prompt || t.taskId}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <StatusBadge status={t.status} small />
                  {(t.status === "queued" || t.status === "submitting" || t.status === "processing") && (
                    <button onClick={(e) => { e.stopPropagation(); handlePollOne(t.taskId); }} style={{ ...btnStyle, fontSize: 10, padding: "2px 6px" }}>
                      poll
                    </button>
                  )}
                </div>
              </div>
            ))}
            {tasks.length === 0 && (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40, opacity: 0.5 }}>
                还没有视频任务 — 在左侧填写描述开始创作
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            ...btnStyle,
            flex: 1,
            background: value === o.value ? "#6C5CE7" : "rgba(255,255,255,0.05)",
            color: value === o.value ? "white" : "var(--text, #eee)",
            fontWeight: value === o.value ? 600 : 400,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StatusBadge({ status, small }: { status: string; small?: boolean }) {
  const color: Record<string, string> = {
    completed: "#10b981",
    failed: "#ef4444",
    cancelled: "#64748b",
    queued: "#f59e0b",
    submitting: "#f59e0b",
    processing: "#3b82f6",
  };
  return (
    <span
      style={{
        display: "inline-block",
        padding: small ? "1px 6px" : "2px 8px",
        borderRadius: 4,
        background: (color[status] || "#64748b") + "33",
        color: color[status] || "#64748b",
        fontSize: small ? 10 : 11,
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
  color: "var(--text, #eee)",
  cursor: "pointer",
  fontSize: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(0,0,0,0.3)",
  color: "var(--text, #eee)",
  fontSize: 13,
  boxSizing: "border-box",
};

const errStyle: React.CSSProperties = {
  color: "#f87171",
  padding: "8px 0",
  fontSize: 13,
};

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    ...btnStyle,
    width: "100%",
    padding: "12px",
    background: disabled ? "rgba(108,92,231,0.4)" : "#6C5CE7",
    color: "white",
    fontSize: 14,
    fontWeight: 600,
    marginTop: 12,
    cursor: disabled ? "wait" : "pointer",
  };
}
