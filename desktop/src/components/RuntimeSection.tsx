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
  isTechnicalRuntimeReason,
  LOCAL_RUNTIME_UNCERTIFIED,
  projectRuntimeStatus,
  projectVendorProbe,
  runtimeStateLabel,
  runtimeStateText,
  type RuntimePresentation,
  type RuntimeStatusProjection,
} from "../services/developerRuntime";
import { getKillSwitchState, onKillSwitchChange } from "../services/executionFence";
import { useI18n } from "../i18n/I18nProvider";
import { fill } from "../i18n/strings";

type Busy = "refresh" | "probe" | "trust" | "revoke" | null;

export default function RuntimeSection() {
  const { t } = useI18n();
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
      <div id="developer-runtime-title" style={sectionTitle}>{t("runtime.title")}</div>
      <div role="status" aria-live="polite" style={label === "revoked" || label === "stopped" ? alertBox : box}>
        <div style={{ fontSize: 13, fontWeight: 600 }} data-testid="runtime-state">
          {status ? runtimeStateText(label, t) : t("runtime.loading")}
        </div>
        {status && status.reasonCode && label === "unknown" && !isTechnicalRuntimeReason(status.reasonCode) && (
          <div style={hint}>{fill(t("runtime.reasonLine"), { reason: describeRuntimeReason(status.reasonCode, t) })}</div>
        )}
        {status && label === "bound" && (
          <div style={hint} data-testid="runtime-identity">
            {fill(t("runtime.identity"), { device: status.deviceId, binding: status.bindingId, version: String(status.bindingVersion) })}
          </div>
        )}
        <div style={hint}>
          {!presentation || presentation.resultClass === LOCAL_RUNTIME_UNCERTIFIED || presentation.resultClass === "unknown"
            ? t("runtime.uncertified")
            : fill(t("runtime.resultClass"), { class: presentation.resultClass })}
        </div>
        {label === "off" && <div style={hint}>{t("runtime.offHint")}</div>}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          style={button}
          disabled={busy !== null}
          onClick={() =>
            void run("probe", developerRuntime.probeVendor, (result) => {
              const probe = projectVendorProbe(result);
              return isTechnicalRuntimeReason(probe.reasonCode) || probe.reasonCode === "unknown"
                ? t("common.unknown")
                : describeRuntimeReason(probe.reasonCode, t);
            })
          }
        >
          {t("runtime.btn.probe")}
        </button>
        <button
          type="button"
          style={button}
          disabled={!canTrust}
          aria-describedby="runtime-trust-desc"
          onClick={() =>
            void run("trust", developerRuntime.trustSelectedWorkspace, (result) =>
              result.outcome === "ok" && result.payload?.trusted === true
                ? t("runtime.msg.trusted")
                : fill(t("runtime.msg.notTrusted"), { reason: describeRuntimeReason(result.reasonCode, t) || t("common.unknown") }),
            )
          }
        >
          {t("runtime.btn.trust")}
        </button>
        <button
          type="button"
          style={dangerButton}
          disabled={!canRevoke}
          aria-describedby="runtime-revoke-desc"
          onClick={() =>
            void run("revoke", developerRuntime.revoke, (result) =>
              result.outcome === "ok"
                ? t("runtime.msg.revoked")
                : fill(t("runtime.msg.revokeResult"), { reason: describeRuntimeReason(result.reasonCode, t) || t("common.unknown") }),
            )
          }
        >
          {t("runtime.btn.revoke")}
        </button>
      </div>
      <div id="runtime-trust-desc" style={hint}>
        {t("runtime.trustDesc")}
      </div>
      <div id="runtime-revoke-desc" style={hint}>
        {t("runtime.revokeDesc")}
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
  color: "var(--tone-danger-text)",
};
