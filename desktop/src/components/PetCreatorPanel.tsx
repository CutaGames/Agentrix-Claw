/**
 * PetCreatorPanel — desktop UI for generating a custom 3D pet (萌宠).
 *
 * Flow:
 *   1. User picks mode (text or image), provider, style, prompt / reference image
 *   2. Submit → backend returns taskId → we poll every 5s
 *   3. When status=completed: show .glb URL + render preview via PetVRM
 *   4. "Set as my pet" writes localStorage so FloatingBall picks it up
 */
import { useCallback, useEffect, useRef, useState } from "react";
import PetVRM from "./PetVRM";
import ProviderPicker from "./ProviderPicker";
import {
  type PetMode,
  type PetProvider,
  type PetStyle,
  type PetTaskSummary,
  getPetTask,
  listPetTasks,
  setActivePet,
  submitPetTask,
} from "../services/petCreator";

interface Props {
  onClose: () => void;
}

const STYLE_OPTIONS: { value: PetStyle; label: string }[] = [
  { value: "anime", label: "动漫 Anime" },
  { value: "chibi", label: "Q版 Chibi" },
  { value: "cartoon", label: "卡通 Cartoon" },
  { value: "realistic", label: "写实 Realistic" },
  { value: "pbr", label: "PBR 材质" },
  { value: "sculpture", label: "雕塑 Sculpture" },
];

export default function PetCreatorPanel({ onClose }: Props) {
  const [mode, setMode] = useState<PetMode>("text");
  const [provider, setProvider] = useState<PetProvider>("meshy");
  const [style, setStyle] = useState<PetStyle>("chibi");
  const [prompt, setPrompt] = useState("");
  const [referenceImageUrl, setReferenceImageUrl] = useState("");
  const [parentAUrl, setParentAUrl] = useState("");
  const [parentBUrl, setParentBUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<PetTaskSummary[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listPetTasks(30);
      setTasks(list);
    } catch (err: any) {
      console.warn("[PetCreator] list failed:", err?.message || err);
    }
  }, []);

  useEffect(() => {
    refresh();
    pollTimer.current = setInterval(refresh, 8000);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [refresh]);

  const handleSubmit = async () => {
    setError(null);
    if (mode === "text" && !prompt.trim()) {
      setError("请填写 prompt 描述你想要的萌宠形象");
      return;
    }
    if (mode === "image" && !referenceImageUrl.trim()) {
      setError("图生 3D 需要一张参考图片 URL");
      return;
    }
    if (mode === "breed" && (!parentAUrl.trim() || !parentBUrl.trim())) {
      setError("双图融合 (繁殖) 需要两只父母皆肤的参考图 URL");
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitPetTask({
        mode,
        provider,
        style,
        prompt: prompt.trim() || undefined,
        referenceImageUrl: referenceImageUrl.trim() || undefined,
        parentSkinUrls:
          mode === "breed" && parentAUrl.trim() && parentBUrl.trim()
            ? [parentAUrl.trim(), parentBUrl.trim()]
            : undefined,
        enableAnimation: true,
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

  const handlePollOne = async (taskId: string) => {
    try {
      await getPetTask(taskId);
      await refresh();
    } catch (err: any) {
      console.warn("[PetCreator] poll failed:", err?.message || err);
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
        <div style={{ fontSize: 16, fontWeight: 600 }}>🐾 创建专属萌宠 · Pet Creator</div>
        <button onClick={onClose} style={btnStyle}>关闭</button>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: input form */}
        <div style={{ flex: "0 0 360px", padding: 20, overflowY: "auto", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <Section title="生成模式">
            <Tabs<PetMode>
              value={mode}
              onChange={setMode}
              options={[
                { value: "text", label: "文字 → 3D" },
                { value: "image", label: "图片 → 3D" },
                { value: "breed", label: "双图繁殖 🧬" },
              ]}
            />
          </Section>

          <Section title="服务商 Provider">
            <ProviderPicker
              modality="3d"
              value={provider}
              onChange={(id) => setProvider(id as PetProvider)}
            />
            <p style={hintStyle}>
              不同 Provider 质量 / 价格 / 延迟不同；Coming Soon 项会逐步接入。
            </p>
          </Section>

          <Section title="风格">
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as PetStyle)}
              style={inputStyle}
            >
              {STYLE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Section>

          {mode === "text" ? (
            <Section title="描述 Prompt">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：一只蓝色发光的赛博朋克小狐狸，戴着耳机"
                rows={5}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              />
            </Section>
          ) : mode === "image" ? (
            <Section title="参考图片 URL">
              <input
                type="url"
                value={referenceImageUrl}
                onChange={(e) => setReferenceImageUrl(e.target.value)}
                placeholder="https://..."
                style={inputStyle}
              />
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="可选：附加描述（材质、姿势...）"
                rows={3}
                style={{ ...inputStyle, marginTop: 8, resize: "vertical", fontFamily: "inherit" }}
              />
            </Section>
          ) : (
            <Section title="双图繁殖 (Breed)">
              <input
                type="url"
                value={parentAUrl}
                onChange={(e) => setParentAUrl(e.target.value)}
                placeholder="父母 A 参考图 URL"
                style={inputStyle}
              />
              <input
                type="url"
                value={parentBUrl}
                onChange={(e) => setParentBUrl(e.target.value)}
                placeholder="父母 B 参考图 URL"
                style={{ ...inputStyle, marginTop: 8 }}
              />
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="可选：融合偏好（例如 “多保留 A 的颜色 + B 的耳朵”）"
                rows={3}
                style={{ ...inputStyle, marginTop: 8, resize: "vertical", fontFamily: "inherit" }}
              />
              <p style={hintStyle}>
                V4 实验：后端还未上线原生 /breed，当前由前端合成 prompt 与参考 URL 提交。
              </p>
            </Section>
          )}

          {error && (
            <div style={{ color: "#f87171", padding: "8px 0", fontSize: 13 }}>{error}</div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              ...btnStyle,
              width: "100%",
              padding: "12px",
              background: submitting ? "rgba(108,92,231,0.4)" : "#6C5CE7",
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              marginTop: 12,
              cursor: submitting ? "wait" : "pointer",
            }}
          >
            {submitting ? "提交中..." : "🚀 开始生成"}
          </button>
        </div>

        {/* Right: tasks + preview */}
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
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div>
                  {activeTask.vrmUrl || activeTask.outputUrl ? (
                    <PetVRM
                      url={activeTask.vrmUrl || activeTask.outputUrl || ""}
                      size={200}
                      showLevelBadge={false}
                    />
                  ) : activeTask.thumbnailUrl ? (
                    <img
                      src={activeTask.thumbnailUrl}
                      alt={activeTask.title || "preview"}
                      style={{ width: 200, height: 200, borderRadius: 8, objectFit: "cover" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 200,
                        height: 200,
                        borderRadius: 8,
                        background: "rgba(255,255,255,0.05)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "rgba(255,255,255,0.4)",
                        fontSize: 48,
                      }}
                    >
                      ⏳
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                    {activeTask.title || activeTask.prompt || activeTask.taskId}
                  </div>
                  <StatusBadge status={activeTask.status} />
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 8, wordBreak: "break-all" }}>
                    {activeTask.taskId} · {activeTask.provider} · {activeTask.mode}
                  </div>
                  {activeTask.error && (
                    <div style={{ color: "#f87171", fontSize: 12, marginTop: 8 }}>
                      错误: {activeTask.error}
                    </div>
                  )}
                  {(activeTask.vrmUrl || activeTask.outputUrl) && (
                    <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        onClick={() =>
                          setActivePet(
                            activeTask.vrmUrl || activeTask.outputUrl || "",
                            activeTask.title || activeTask.prompt || undefined,
                          )
                        }
                        style={{
                          ...btnStyle,
                          background: "#10b981",
                          color: "white",
                          fontWeight: 600,
                        }}
                      >
                        ✨ 设为我的萌宠
                      </button>
                      <a
                        href={activeTask.vrmUrl || activeTask.outputUrl || "#"}
                        target="_blank"
                        rel="noreferrer"
                        style={{ ...btnStyle, textDecoration: "none", display: "inline-block" }}
                      >
                        下载 .glb
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
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
                  <img
                    src={t.thumbnailUrl}
                    alt={t.title || ""}
                    style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 6 }}
                  />
                ) : (
                  <div
                    style={{
                      height: 120,
                      borderRadius: 6,
                      background: "rgba(255,255,255,0.04)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 32,
                    }}
                  >
                    🐾
                  </div>
                )}
                <div style={{ fontSize: 12, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.title || t.prompt || t.taskId}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <StatusBadge status={t.status} small />
                  {(t.status === "queued" || t.status === "submitting" || t.status === "processing" || t.status === "refining") && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePollOne(t.taskId); }}
                      style={{ ...btnStyle, fontSize: 10, padding: "2px 6px" }}
                    >
                      poll
                    </button>
                  )}
                </div>
              </div>
            ))}
            {tasks.length === 0 && (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40, opacity: 0.5 }}>
                还没有生成过萌宠 — 在左侧填写描述开始创作
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
    <div style={{ display: "flex", gap: 6 }}>
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
    refining: "#3b82f6",
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

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.5,
  marginTop: 4,
};
