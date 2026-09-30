/**
 * WorldCreatorPanel — Tier_C desktop creator (v6 AI World Creation).
 *
 * A modal workbench (same backdrop/shell visual language as CreatorStudioHub)
 * that runs only on the desktop surface — the off-device execution target for
 * Mobile-dispatched Tier_C creation tasks (R3.7 / R8.7). It surfaces:
 *   1. Optional Creation_Task status (when launched from a dispatched task, R8).
 *   2. Prompt-drive + co-edit continuum editing on the shared ECS_World (R3.4).
 *   3. Tier_C logic-module list + a `compute.run` L2 WASM试运行 (R6.3 / R6.4).
 *   4. Isolated experience window open/close (R5.6 sandbox isolation).
 *   5. Publish → share code (R10.1 / R11.1).
 *
 * Desktop convention: inline CSSProperties, no react-router, dark theme.
 * Copy is Chinese literal (desktop default語言); i18n keys 待补 — wire t(key)
 * once strings.ts gains the world-creator namespace.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { EcsWorld, SubstrateTier } from "../../../shared/types/world-creation.ts";
import type {
  CreationTaskDto,
  PublishPlotResponse,
} from "../../../shared/types/world-creation-api.ts";
import {
  closeIsolatedExperience,
  computeRun,
  continueEditing,
  getCreationTask,
  openIsolatedExperience,
  publishPlot,
} from "../services/worldCreationDesktop";

interface Props {
  visible: boolean;
  plotId: string;
  substrateTier?: SubstrateTier;
  taskId?: string;
  onClose: () => void;
}

/** Short hash preview (e.g. "sha256:abcd…"). */
function shortHash(hash: string): string {
  if (!hash) return "—";
  const [scheme, body] = hash.includes(":") ? hash.split(":") : ["", hash];
  const head = (body || hash).slice(0, 10);
  return scheme ? `${scheme}:${head}…` : `${head}…`;
}

/** Compact JSON summary, truncated for the inline output strip. */
function jsonPreview(value: unknown, max = 600): string {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  if (text.length > max) return `${text.slice(0, max)}…`;
  return text;
}

export default function WorldCreatorPanel(props: Props) {
  const { visible, plotId, substrateTier, taskId, onClose } = props;

  // Editing state
  const [prompt, setPrompt] = useState("");
  const [instruction, setInstruction] = useState("");
  const [ecsWorld, setEcsWorld] = useState<EcsWorld | null>(null);

  // Async status
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Task / sandbox / publish state
  const [task, setTask] = useState<CreationTaskDto | null>(null);
  const [moduleOutput, setModuleOutput] = useState<Record<string, string>>({});
  const [moduleError, setModuleError] = useState<Record<string, string>>({});
  const [windowLabel, setWindowLabel] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<PublishPlotResponse | null>(null);

  // Load the dispatched Creation_Task (if any) on entry.
  useEffect(() => {
    if (!visible || !taskId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getCreationTask(taskId);
        if (!cancelled) setTask(res.task);
      } catch (err) {
        if (!cancelled) setError(`加载创作任务失败:${(err as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, taskId]);

  if (!visible) return null;

  const clearBanners = () => {
    setError(null);
    setNotice(null);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError("请先输入生成 prompt");
      return;
    }
    clearBanners();
    setBusy("generate");
    try {
      const res = await continueEditing(plotId, {
        mode: "promptDrive",
        surface: "desktop",
        prompt: prompt.trim(),
      });
      if (res.error) {
        setError(res.error.detail || res.error.error);
      } else if (res.ecsWorld) {
        setEcsWorld(res.ecsWorld);
        setNotice(
          res.outcome === "dispatched"
            ? "已派发为创作任务(off-surface)"
            : `生成完成 · 版本 ${res.versionId ?? "—"}`,
        );
      } else {
        setNotice(`已处理 · outcome=${res.outcome}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleApplyEdit = async () => {
    if (!instruction.trim()) {
      setError("请先输入编辑指令");
      return;
    }
    clearBanners();
    setBusy("edit");
    try {
      const res = await continueEditing(plotId, {
        mode: "coEdit",
        surface: "desktop",
        instruction: instruction.trim(),
      });
      if (res.error) {
        setError(res.error.detail || res.error.error);
      } else if (res.ecsWorld) {
        setEcsWorld(res.ecsWorld);
        setNotice(`编辑已应用 · 版本 ${res.versionId ?? "—"}`);
      } else {
        setNotice(`已处理 · outcome=${res.outcome}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleTryRunModule = async (moduleId: string, entry: string, capabilities: string[]) => {
    clearBanners();
    setBusy(`run:${moduleId}`);
    setModuleError((prev) => ({ ...prev, [moduleId]: "" }));
    try {
      const res = await computeRun({
        moduleId,
        entry,
        capabilities,
        wasmBytes: [], // demo: 空字节会触发 MODULE_COMPILE,需提供已审核字节码
        input: { dtMs: 16 },
      });
      setModuleOutput((prev) => ({ ...prev, [moduleId]: jsonPreview(res.output) }));
      setNotice(`模块 ${moduleId} 试运行返回`);
    } catch (err) {
      // 空字节预期失败(MODULE_COMPILE / CAP_DENIED 等)— 展示错误码即可。
      setModuleError((prev) => ({
        ...prev,
        [moduleId]: `${(err as Error).message} · 需提供已审核字节码`,
      }));
    } finally {
      setBusy(null);
    }
  };

  const handleOpenWindow = async () => {
    clearBanners();
    setBusy("open-window");
    try {
      const label = await openIsolatedExperience(plotId);
      setWindowLabel(label);
      setNotice(`已在独立窗口打开体验 · window=${label}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleCloseWindow = async () => {
    clearBanners();
    setBusy("close-window");
    try {
      await closeIsolatedExperience(plotId);
      setWindowLabel(null);
      setNotice("已关闭独立窗口");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handlePublish = async () => {
    clearBanners();
    setBusy("publish");
    try {
      const res = await publishPlot(plotId);
      setPublishResult(res);
      if (res.error) {
        setError(res.error.detail || res.error.error);
      } else if (res.published) {
        setNotice(`发布成功 · shareCode=${res.shareCode ?? "—"}`);
      } else {
        setNotice("发布未通过");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const logicModules = ecsWorld?.logicModules ?? [];

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={shellStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🌐</span>
            <div>
              <div style={titleStyle}>World 创作器 · Tier_C</div>
              <div style={subtitleStyle}>
                Plot {plotId}
                {substrateTier ? ` · 基底 Tier_${substrateTier}` : ""}
              </div>
            </div>
          </div>
          <button style={closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Banners */}
        {error && <div style={errorBar}>⚠ {error}</div>}
        {notice && <div style={noticeBar}>✓ {notice}</div>}

        <div style={bodyStyle}>
          {/* Task status */}
          {taskId && (
            <section style={cardStyle}>
              <div style={sectionTitle}>派发创作任务</div>
              {task ? (
                <div style={kvGrid}>
                  <span style={kvKey}>任务</span><span style={kvVal}>{task.taskId}</span>
                  <span style={kvKey}>状态</span><span style={kvVal}>{task.status}</span>
                  <span style={kvKey}>目标</span><span style={kvVal}>{task.target}</span>
                  <span style={kvKey}>基底</span><span style={kvVal}>Tier_{task.substrateTier}</span>
                  {task.failReason ? (
                    <>
                      <span style={kvKey}>失败原因</span>
                      <span style={kvVal}>{task.failReason}</span>
                    </>
                  ) : null}
                </div>
              ) : (
                <div style={mutedText}>加载任务状态中…(taskId={taskId})</div>
              )}
            </section>
          )}

          {/* Generate / edit */}
          <section style={cardStyle}>
            <div style={sectionTitle}>生成 / 编辑</div>
            <textarea
              style={textareaStyle}
              placeholder="输入生成 prompt,例如:一个赛博朋克便利店,带可结算货架…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <button
              style={busy === "generate" ? primaryBtnBusy : primaryBtn}
              disabled={!!busy}
              onClick={handleGenerate}
            >
              {busy === "generate" ? "生成中…" : "生成"}
            </button>

            <textarea
              style={{ ...textareaStyle, marginTop: 12 }}
              placeholder="输入自然语言编辑指令,例如:把货架价格调到 5 AXP…"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
            <button
              style={busy === "edit" ? secondaryBtnBusy : secondaryBtn}
              disabled={!!busy}
              onClick={handleApplyEdit}
            >
              {busy === "edit" ? "应用中…" : "应用编辑"}
            </button>

            {ecsWorld && (
              <div style={worldSummary}>
                <span style={chip}>标题:{ecsWorld.meta?.title ?? "—"}</span>
                <span style={chip}>实体:{ecsWorld.entities?.length ?? 0}</span>
                <span style={chip}>规则:{ecsWorld.rules?.length ?? 0}</span>
                <span style={chip}>逻辑模块:{ecsWorld.logicModules?.length ?? 0}</span>
              </div>
            )}
          </section>

          {/* Logic modules (Tier_C core) */}
          <section style={cardStyle}>
            <div style={sectionTitle}>逻辑模块(Tier_C)</div>
            {logicModules.length === 0 ? (
              <div style={mutedText}>当前 ECS_World 暂无逻辑模块。生成 / 编辑后在此试运行 compute.run。</div>
            ) : (
              logicModules.map((m) => (
                <div key={m.moduleId} style={moduleRow}>
                  <div style={kvGrid}>
                    <span style={kvKey}>moduleId</span><span style={kvVal}>{m.moduleId}</span>
                    <span style={kvKey}>runtime</span><span style={kvVal}>{m.runtime}</span>
                    <span style={kvKey}>entry</span><span style={kvVal}>{m.entry}</span>
                    <span style={kvKey}>review</span><span style={kvVal}>{m.reviewStatus}</span>
                    <span style={kvKey}>hash</span><span style={kvVal}>{shortHash(m.hash)}</span>
                  </div>
                  <button
                    style={busy === `run:${m.moduleId}` ? tinyBtnBusy : tinyBtn}
                    disabled={!!busy}
                    onClick={() => handleTryRunModule(m.moduleId, m.entry, m.capabilities)}
                  >
                    {busy === `run:${m.moduleId}` ? "运行中…" : "试运行 tick"}
                  </button>
                  {moduleOutput[m.moduleId] && (
                    <pre style={outputBox}>{moduleOutput[m.moduleId]}</pre>
                  )}
                  {moduleError[m.moduleId] && (
                    <div style={inlineError}>⚠ {moduleError[m.moduleId]}</div>
                  )}
                </div>
              ))
            )}
          </section>

          {/* Isolated window */}
          <section style={cardStyle}>
            <div style={sectionTitle}>隔离体验窗口</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                style={busy === "open-window" ? secondaryBtnBusy : secondaryBtn}
                disabled={!!busy}
                onClick={handleOpenWindow}
              >
                {busy === "open-window" ? "打开中…" : "在独立窗口打开体验"}
              </button>
              <button
                style={busy === "close-window" ? secondaryBtnBusy : secondaryBtn}
                disabled={!!busy}
                onClick={handleCloseWindow}
              >
                {busy === "close-window" ? "关闭中…" : "关闭独立窗口"}
              </button>
            </div>
            {windowLabel && <div style={mutedText}>当前窗口 label:{windowLabel}</div>}
          </section>
        </div>

        {/* Publish footer */}
        <div style={footerStyle}>
          <div style={mutedText}>
            {publishResult?.error
              ? `发布错误:${publishResult.error.detail || publishResult.error.error}`
              : publishResult?.published
                ? `已发布 · shareCode=${publishResult.shareCode ?? "—"}`
                : "通过审核后即可在 World_Map 上被发现"}
          </div>
          <button
            style={busy === "publish" ? primaryBtnBusy : primaryBtn}
            disabled={!!busy}
            onClick={handlePublish}
          >
            {busy === "publish" ? "发布中…" : "发布"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Inline styles (dark theme, aligned with CreatorStudioHub)
// ────────────────────────────────────────────────────────────────────────────

const ACCENT = "#00d4ff";

const backdropStyle: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9760,
  display: "flex", alignItems: "center", justifyContent: "center",
};

const shellStyle: CSSProperties = {
  width: "min(960px, 92vw)",
  height: "min(820px, 92vh)",
  background: "var(--bg-panel)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  color: "var(--text)",
};

const headerStyle: CSSProperties = {
  padding: "14px 18px",
  borderBottom: "1px solid var(--border-light)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const titleStyle: CSSProperties = { fontSize: 18, fontWeight: 800, letterSpacing: -0.3, color: "var(--text-strong)" };
const subtitleStyle: CSSProperties = { fontSize: 11, color: "var(--text-dim)", marginTop: 2 };

const closeBtn: CSSProperties = {
  background: "transparent", border: "1px solid var(--border-strong)", color: "var(--text-muted)",
  borderRadius: 8, padding: "4px 9px", cursor: "pointer", fontSize: 12,
};

const bodyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  padding: "14px 18px",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const cardStyle: CSSProperties = {
  background: "var(--bg-overlay-light)",
  border: "1px solid var(--border-light)",
  borderRadius: 12,
  padding: "12px 14px",
};

const sectionTitle: CSSProperties = {
  fontSize: 13, fontWeight: 700, color: ACCENT, marginBottom: 10,
};

const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 64,
  resize: "vertical",
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: 13,
  padding: "8px 10px",
  boxSizing: "border-box",
  outline: "none",
};

const primaryBtn: CSSProperties = {
  marginTop: 8,
  background: `linear-gradient(135deg, ${ACCENT}, #0096c7)`,
  border: "none",
  color: "#05121a",
  fontWeight: 700,
  fontSize: 13,
  padding: "8px 18px",
  borderRadius: 8,
  cursor: "pointer",
};

const primaryBtnBusy: CSSProperties = { ...primaryBtn, opacity: 0.6, cursor: "wait" };

const secondaryBtn: CSSProperties = {
  marginTop: 8,
  background: "rgba(0,212,255,0.1)",
  border: "1px solid rgba(0,212,255,0.4)",
  color: ACCENT,
  fontWeight: 600,
  fontSize: 13,
  padding: "8px 16px",
  borderRadius: 8,
  cursor: "pointer",
};

const secondaryBtnBusy: CSSProperties = { ...secondaryBtn, opacity: 0.6, cursor: "wait" };

const tinyBtn: CSSProperties = {
  marginTop: 8,
  background: "rgba(0,212,255,0.1)",
  border: "1px solid rgba(0,212,255,0.4)",
  color: ACCENT,
  fontWeight: 600,
  fontSize: 12,
  padding: "5px 12px",
  borderRadius: 7,
  cursor: "pointer",
};

const tinyBtnBusy: CSSProperties = { ...tinyBtn, opacity: 0.6, cursor: "wait" };

const worldSummary: CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12,
};

const chip: CSSProperties = {
  background: "rgba(0,212,255,0.08)",
  border: "1px solid rgba(0,212,255,0.25)",
  borderRadius: 999,
  padding: "3px 10px",
  fontSize: 11,
  color: "#bfe9f7",
};

const moduleRow: CSSProperties = {
  borderTop: "1px solid var(--border-light)",
  paddingTop: 10,
  marginTop: 10,
};

const kvGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: "4px 12px",
  fontSize: 12,
};

const kvKey: CSSProperties = { color: "var(--text-dim)" };
const kvVal: CSSProperties = { color: "var(--text)", wordBreak: "break-all" };

const outputBox: CSSProperties = {
  marginTop: 8,
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 11,
  color: "#a9e8c7",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  maxHeight: 180,
  overflow: "auto",
};

const mutedText: CSSProperties = { fontSize: 12, color: "var(--text-dim)", marginTop: 6 };

const errorBar: CSSProperties = {
  background: "rgba(255,77,79,0.12)",
  borderBottom: "1px solid rgba(255,77,79,0.4)",
  color: "#ff8a8c",
  fontSize: 12,
  padding: "8px 18px",
};

const inlineError: CSSProperties = {
  marginTop: 8,
  background: "rgba(255,77,79,0.1)",
  border: "1px solid rgba(255,77,79,0.35)",
  borderRadius: 8,
  color: "#ff8a8c",
  fontSize: 11,
  padding: "6px 10px",
};

const noticeBar: CSSProperties = {
  background: "rgba(0,212,255,0.1)",
  borderBottom: "1px solid rgba(0,212,255,0.3)",
  color: ACCENT,
  fontSize: 12,
  padding: "8px 18px",
};

const footerStyle: CSSProperties = {
  padding: "12px 18px",
  borderTop: "1px solid var(--border-light)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};
