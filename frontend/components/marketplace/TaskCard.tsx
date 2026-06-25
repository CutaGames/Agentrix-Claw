/**
 * TaskCard — 任务市场卡片组件
 *
 * 展示单个任务的核心信息：title, description (truncated), rewardAmount + currency,
 * taskType badge, requiredSkills as tags, deadline (formatted), axpBonus (if > 0)。
 * 点击时触发 onSelect 回调以展开详情面板。
 *
 * Requirements: 5.2, 10.3
 */

import { Briefcase, Clock, DollarSign, Zap, Tag } from 'lucide-react';
import type { TaskListItem } from '../../services/marketplaceApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskCardProps {
  task: TaskListItem;
  onSelect?: (task: TaskListItem) => void;
  isSelected?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDeadline(deadline: string | null): string | null {
  if (!deadline) return null;
  try {
    const date = new Date(deadline);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TaskCard({ task, onSelect, isSelected }: TaskCardProps) {
  const formattedDeadline = formatDeadline(task.deadline);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(task)}
      className={`group flex w-full flex-col rounded-xl border p-4 text-left transition-all hover:border-purple-500/40 hover:shadow-lg ${
        isSelected
          ? 'border-purple-500 bg-gray-800/80 shadow-lg shadow-purple-500/10'
          : 'border-gray-700 bg-gray-800/50'
      }`}
      aria-expanded={isSelected}
      aria-label={`${task.title} - ${task.taskType}`}
    >
      {/* Header: Task type badge + Reward */}
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-400">
          <Briefcase size={11} />
          {task.taskType}
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-bold text-green-400">
          <DollarSign size={13} />
          {task.rewardAmount.toFixed(2)} {task.currency || 'USD'}
        </span>
      </div>

      {/* Title */}
      <h3 className="mb-1.5 text-sm font-semibold text-white group-hover:text-purple-300 transition-colors line-clamp-1">
        {task.title}
      </h3>

      {/* Description (truncated) */}
      <p className="mb-3 flex-1 text-xs text-gray-400 line-clamp-2">
        {task.description}
      </p>

      {/* Required Skills Tags */}
      {task.requiredSkills.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {task.requiredSkills.slice(0, 4).map((skill) => (
            <span
              key={skill}
              className="inline-flex items-center gap-0.5 rounded-md bg-gray-700/60 px-2 py-0.5 text-[10px] font-medium text-gray-300"
            >
              <Tag size={9} className="text-gray-500" />
              {skill}
            </span>
          ))}
          {task.requiredSkills.length > 4 && (
            <span className="rounded-md bg-gray-700/60 px-2 py-0.5 text-[10px] text-gray-500">
              +{task.requiredSkills.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Footer: Deadline + AXP Bonus */}
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-700/50 pt-3 text-[11px] text-gray-500">
        {/* Deadline */}
        {formattedDeadline && (
          <span className="inline-flex items-center gap-1">
            <Clock size={11} />
            {formattedDeadline}
          </span>
        )}

        {/* AXP Bonus */}
        {task.axpBonus > 0 && (
          <span className="inline-flex items-center gap-1 text-yellow-400">
            <Zap size={11} />
            +{task.axpBonus} AXP
          </span>
        )}
      </div>
    </button>
  );
}

export default TaskCard;
