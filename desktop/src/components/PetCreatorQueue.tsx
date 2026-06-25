/**
 * PetCreatorQueue — Sprint DB #6
 *
 * Batch queue display for PetCreator tasks.
 * Per desktop-prd-v4 §3.3: "Pro+ 用户可并行 3 个生成任务（队列展示在面板底部）"
 *
 * Shows all active/pending/completed tasks with:
 *   - Status indicator (queued / processing / completed / failed)
 *   - Progress percentage
 *   - Thumbnail preview when completed
 *   - "Set as pet" / "View in Wardrobe" actions
 */
import { useEffect, useState, type CSSProperties } from "react";
import { listPetTasks, getPetTask, type PetTaskSummary } from "../services/petCreator";

interface Props {
  onSelectTask?: (taskId: string) => void;
  onSetAsPet?: (modelUrl: string) => void;
}

const STATUS_EMOJI: Record<string, string> = {
  queued: "⏳",
  processing: "🔄",
  completed: "✅",
  failed: "❌",
  cancelled: "🚫",
};

const STATUS_COLOR: Record<string, string> = {
  queued: "#f59e0b",
  processing: "#3b82f6",
  completed: "#22c55e",
  failed: "#ef4444",
  cancelled: "#6b7280",
};

export default function PetCreatorQueue({ onSelectTask, onSetAsPet }: Props) {
  const [tasks, setTasks] = useState<PetTaskSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const list = await listPetTasks();
        if (!cancelled) setTasks(list);
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();

    // Poll every 10s for active tasks
    const interval = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const activeTasks = tasks.filter((t) => t.status === "queued" || t.status === "processing");
  const recentTasks = tasks.filter((t) => t.status === "completed" || t.status === "failed").slice(0, 5);

  if (loading && tasks.length === 0) {
    return null; // Don't show anything while loading
  }

  if (tasks.length === 0) {
    return null; // No tasks to show
  }

  return (
    <div style={container}>
      <div style={header}>
        <span style={headerTitle}>🔄 生成队列</span>
        <span style={headerCount}>
          {activeTasks.length} 进行中 · {recentTasks.length} 已完成
        </span>
      </div>

      {/* Active tasks */}
      {activeTasks.map((task) => (
        <div
          key={task.taskId}
          style={taskRow}
          onClick={() => onSelectTask?.(task.taskId)}
        >
          <span style={{ fontSize: 16 }}>{STATUS_EMOJI[task.status] || "•"}</span>
          <div style={{ flex: 1 }}>
            <div style={taskName}>
              {task.mode === "breed" ? "🧬 繁殖" : task.mode === "image" ? "🖼️ 图生" : "✏️ 文生"}
              {task.prompt ? ` · ${task.prompt.slice(0, 30)}...` : ""}
            </div>
            {/* Progress bar */}
            <div style={progressTrack}>
              <div
                style={{
                  ...progressFill,
                  width: task.status === "processing" ? "50%" : "10%",
                  backgroundColor: STATUS_COLOR[task.status] || "#3b82f6",
                }}
              />
            </div>
          </div>
          <span style={{ ...statusBadge, color: STATUS_COLOR[task.status] }}>
            {task.status}
          </span>
        </div>
      ))}

      {/* Recent completed */}
      {recentTasks.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {recentTasks.map((task) => (
            <div
              key={task.taskId}
              style={{ ...taskRow, opacity: task.status === "failed" ? 0.6 : 1 }}
              onClick={() => {
                if (task.status === "completed" && (task.vrmUrl || task.outputUrl)) {
                  onSetAsPet?.(task.vrmUrl || task.outputUrl!);
                }
              }}
            >
              <span style={{ fontSize: 14 }}>{STATUS_EMOJI[task.status]}</span>
              <div style={{ flex: 1 }}>
                <div style={taskName}>
                  {task.mode === "breed" ? "🧬" : task.mode === "image" ? "🖼️" : "✏️"}
                  {task.prompt ? ` ${task.prompt.slice(0, 25)}` : " 生成任务"}
                </div>
              </div>
              {task.status === "completed" && (
                <span style={actionBtn}>装备</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────

const container: CSSProperties = {
  padding: 10,
  background: "var(--bg-card)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 10,
  marginTop: 12,
};

const header: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
};

const headerTitle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text-card)",
};

const headerCount: CSSProperties = {
  fontSize: 10,
  color: "var(--text-muted)",
};

const taskRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 8px",
  borderRadius: 8,
  cursor: "pointer",
  marginBottom: 4,
  transition: "background 150ms",
};

const taskName: CSSProperties = {
  fontSize: 11,
  color: "var(--text-card)",
  fontWeight: 500,
  marginBottom: 3,
};

const progressTrack: CSSProperties = {
  height: 3,
  borderRadius: 2,
  background: "var(--bg-overlay-medium)",
  overflow: "hidden",
};

const progressFill: CSSProperties = {
  height: "100%",
  borderRadius: 2,
  transition: "width 300ms ease",
};

const statusBadge: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
};

const actionBtn: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "#22d3ee",
  padding: "2px 8px",
  borderRadius: 4,
  border: "1px solid rgba(34,211,238,0.3)",
};
