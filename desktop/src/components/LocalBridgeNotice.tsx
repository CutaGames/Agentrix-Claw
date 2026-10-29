/**
 * LocalBridgeNotice — "这台电脑"页在本机桥没连上时的空状态（polish P3）。
 *
 * 本机桥不在时，页面上依赖它的块什么也读不到。与其摆出好几块"没检测到"，不如说一句话：
 * 桥没连上、怎么启动，再给一个重试按钮。能读到数据的块（执行安全、自带订阅等）照常显示。
 * 探测只调用只读的 `developer_runtime_presentation`，不启动任何进程。
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { developerRuntime, isLocalBridgeAbsent } from "../services/developerRuntime";
import { useI18n } from "../i18n/I18nProvider";

/** `retrying`: the owner pressed Retry and the answer has not come back yet (the notice stays, its button waits). */
export type LocalBridgeState = "checking" | "up" | "absent" | "retrying";

export function useLocalBridge(): { state: LocalBridgeState; retry: () => void } {
  const [state, setState] = useState<LocalBridgeState>("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    void developerRuntime.presentation().then((presentation) => {
      if (alive) setState(isLocalBridgeAbsent(presentation) ? "absent" : "up");
    });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState("retrying");
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}

export default function LocalBridgeNotice({ checking, onRetry }: { checking: boolean; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite" style={box} data-testid="local-bridge-empty">
      <div style={{ fontSize: 13, fontWeight: 600 }}>{t("bridge.absent.title")}</div>
      <div style={hint}>{checking ? t("bridge.checking") : t("bridge.absent.body")}</div>
      <button type="button" style={button} disabled={checking} onClick={onRetry}>
        {t("bridge.absent.retry")}
      </button>
    </div>
  );
}

const box: CSSProperties = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid var(--border)",
  margin: "10px 0",
};

const hint: CSSProperties = {
  fontSize: 11,
  color: "var(--text-dim)",
  marginTop: 4,
  lineHeight: 1.5,
};

const button: CSSProperties = {
  marginTop: 8,
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
  fontSize: 12,
  cursor: "pointer",
};
