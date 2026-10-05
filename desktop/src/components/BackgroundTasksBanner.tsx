// Sprint Pre-launch P-4 (2026-05-23) — Background tasks banner.
//
// Shows when at least one task is pending/queued/running on the server.
// Sources truth from the `agent-tasks` REST API via subscribeBackgroundTasks
// (which polls and pushes events on the runtime store + window event bus).

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useAuthStore } from "../services/store";
import {
  cancelBackgroundTask,
  getRunningTasksCached,
  refreshBackgroundTasks,
  subscribeBackgroundTasks,
  type BackgroundTask,
} from "../services/backgroundTasks";

export default function BackgroundTasksBanner() {
  const token = useAuthStore((s) => s.token);
  const [running, setRunning] = useState<BackgroundTask[]>(getRunningTasksCached);

  const refresh = useCallback(() => {
    setRunning(getRunningTasksCached());
  }, []);

  // Keep banner in sync with the cache.
  useEffect(() => {
    const onUpdate = () => refresh();
    window.addEventListener("agentrix:background-tasks-updated", onUpdate);
    return () => window.removeEventListener("agentrix:background-tasks-updated", onUpdate);
  }, [refresh]);

  // Periodically poll the server. Adaptive interval (6 s when active, 30 s
  // when idle) is implemented inside `subscribeBackgroundTasks`.
  useEffect(() => {
    if (!token) return;
    // Kick a one-shot refresh first so we hide the banner faster when the
    // server says all done while we were offline.
    void refreshBackgroundTasks(token).catch(() => {});
    const teardown = subscribeBackgroundTasks(token);
    return teardown;
  }, [token]);

  if (running.length === 0) return null;

  const onCancel = async (id: string) => {
    if (!token) return;
    await cancelBackgroundTask(token, id);
    refresh();
  };

  return (
    <div style={bannerStyle} role="status" aria-label="后台任务">
      <span style={{ fontWeight: 700 }}>
        ⏳ 后台还有 {running.length} 个任务
      </span>
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
        关闭桌面端不会中断,完成后会从手机/桌面通知你
      </span>
      <div style={{ flex: 1 }} />
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("agentrix:open-background-tasks"))}
        style={ghostBtnStyle}
      >
        查看
      </button>
      {running.length === 1 && (
        <button onClick={() => void onCancel(running[0].id)} style={cancelBtnStyle}>
          取消
        </button>
      )}
    </div>
  );
}

const bannerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 14px",
  margin: "8px 16px 0",
  borderRadius: 12,
  background: "var(--tone-info-bg)",
  border: "1px solid var(--tone-info-border)",
  color: "var(--tone-info-text)",
  fontSize: 12,
};

const ghostBtnStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 11,
  cursor: "pointer",
};

const cancelBtnStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--danger)",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 11,
  cursor: "pointer",
};
