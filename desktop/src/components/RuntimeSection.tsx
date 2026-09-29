/**
 * RuntimeSection — 桌面 D2 切片 3："这台电脑 → 本机开发运行时"。
 *
 * 显示 Developer Runtime Host（Cursor ACP）的真实状态，提供三个操作：
 * - 检查 Cursor agent CLI（只探测，不启动进程）；
 * - 信任工作区：文件夹选择框在 Rust 侧弹出，只在已绑定、未撤销、没急停时可用；
 * - 撤销：结束 agent 进程、删除通道凭据，到应用重启为止。
 *
 * 状态只来自 `developer_runtime_presentation`；看不清的显示"未知"。绑定入口
 * 等 backend 的绑定流程，这里不提供。
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  describeRuntimeReason,
  developerRuntime,
  LOCAL_RUNTIME_UNCERTIFIED,
  projectRuntimeStatus,
  projectVendorProbe,
  runtimeStateLabel,
  RUNTIME_STATE_TEXT,
  type RuntimePresentation,
  type RuntimeStatusProjection,
} from "../services/developerRuntime";
import { getKillSwitchState, onKillSwitchChange } from "../services/executionFence";

type Busy = "refresh" | "probe" | "trust" | "revoke" | null;

export default function RuntimeSection() {
  const [presentation, setPresentation] = useState<RuntimePresentation | null>(null);
  const [killSwitchEngaged, setKillSwitchEngaged] = useState(() => getKillSwitchState().engaged);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const next = await developerRuntime.presentation();
    setPresentation(next);
    return next;
  }, []);

  useEffect(() => {
    let alive = true;
    void developerRuntime.presentation().then((next) => {
      if (alive) setPresentation(next);
    });
    const off = onKillSwitchChange((state) => {
      setKillSwitchEngaged(state.engaged);
      // 急停在 Rust 侧另起线程撤销运行时，稍后再读一次。
      void developerRuntime.presentation().then((next) => {
        if (alive) setPresentation(next);
      });
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  const status: RuntimeStatusProjection | null = presentation ? projectRuntimeStatus(presentation) : null;
  const label = status ? runtimeStateLabel(status, killSwitchEngaged) : "unknown";
  const canTrust = label === "bound" && busy === null;
  const canRevoke = label !== "revoked" && busy === null;

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<RuntimePresentation>, done: (result: RuntimePresentation) => string) => {
    setBusy(kind);
    setMessage("");
    try {
      const result = await action();
      setMessage(done(result));
    } finally {
      await refresh();
      setBusy(null);
    }
  };

  return (
    <div style={section} aria-labelledby="developer-runtime-title">
      <div id="developer-runtime-title" style={sectionTitle}>本机开发运行时（Cursor ACP）</div>
      <div role="status" aria-live="polite" style={label === "revoked" || label === "stopped" ? alertBox : box}>
        <div style={{ fontSize: 13, fontWeight: 600 }} data-testid="runtime-state">
          {status ? RUNTIME_STATE_TEXT[label] : "读取中…"}
        </div>
        {status && status.reasonCode && label === "unknown" && (
          <div style={hint}>原因：{describeRuntimeReason(status.reasonCode)}</div>
        )}
        {status && label === "bound" && (
          <div style={hint} data-testid="runtime-identity">
            设备 {status.deviceId} · 绑定 {status.bindingId} · 版本 {String(status.bindingVersion)}
          </div>
        )}
        <div style={hint}>
          {presentation?.resultClass === LOCAL_RUNTIME_UNCERTIFIED || !presentation
            ? "本机运行时的结果未经认证：不产生回执，不算正式完成。"
            : `结果类别：${presentation.resultClass}（未认证）`}
        </div>
        {label === "off" && (
          <div style={hint}>需要开发者开关打开并完成绑定后才能使用。绑定入口会放在网页版的"绑定这台电脑"里（规划中）。</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          style={button}
          disabled={busy !== null}
          onClick={() =>
            void run("probe", developerRuntime.probeVendor, (result) => {
              const probe = projectVendorProbe(result);
              return describeRuntimeReason(probe.reasonCode) || "未知";
            })
          }
        >
          检查 Cursor agent CLI
        </button>
        <button
          type="button"
          style={button}
          disabled={!canTrust}
          aria-describedby="runtime-trust-desc"
          onClick={() =>
            void run("trust", developerRuntime.trustSelectedWorkspace, (result) =>
              result.outcome === "ok" && result.payload?.trusted === true
                ? "已信任所选工作区"
                : `没有信任：${describeRuntimeReason(result.reasonCode) || "未知"}`,
            )
          }
        >
          信任工作区…
        </button>
        <button
          type="button"
          style={dangerButton}
          disabled={!canRevoke}
          aria-describedby="runtime-revoke-desc"
          onClick={() =>
            void run("revoke", developerRuntime.revoke, (result) =>
              result.outcome === "ok" ? "已撤销" : `撤销结果：${describeRuntimeReason(result.reasonCode) || "未知"}`,
            )
          }
        >
          撤销本机运行时
        </button>
      </div>
      <div id="runtime-trust-desc" style={hint}>
        信任工作区：在系统的文件夹选择框里选，必须和绑定时的工作区一致。只有已绑定时可用。
      </div>
      <div id="runtime-revoke-desc" style={hint}>
        撤销：结束 agent 进程、删除这台电脑上的通道凭据；正在执行的只查询结果，不会重放。拉下急停也会撤销。
      </div>
      {message && (
        <div role="status" style={hint} data-testid="runtime-message">
          {message}
        </div>
      )}
    </div>
  );
}

const section: CSSProperties = {
  padding: "10px 0",
  borderBottom: "1px solid var(--border)",
};

const sectionTitle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-dim)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 8,
};

const hint: CSSProperties = {
  fontSize: 11,
  color: "var(--text-dim)",
  marginTop: 4,
  lineHeight: 1.5,
};

const box: CSSProperties = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid var(--border)",
  marginBottom: 8,
};

const alertBox: CSSProperties = {
  ...box,
  border: "1px solid #dc2626",
  background: "rgba(220, 38, 38, 0.08)",
};

const button: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
  fontSize: 12,
  cursor: "pointer",
};

const dangerButton: CSSProperties = {
  ...button,
  border: "1px solid #dc2626",
  color: "#dc2626",
};
