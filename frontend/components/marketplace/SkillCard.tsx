/**
 * SkillCard — 技能市场卡片组件
 *
 * 展示单个技能的核心信息：name, description, category, price,
 * installCount, developerName, axpEarningEstimate。
 * 点击时触发 onSelect 回调以展开详情面板。
 *
 * Requirements: 4.2, 10.2
 */

import { Zap, Download, Code, Tag } from 'lucide-react';
import type { SkillListItem } from '../../services/marketplaceApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillCardProps {
  skill: SkillListItem;
  onSelect?: (skill: SkillListItem) => void;
  isSelected?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SkillCard({ skill, onSelect, isSelected }: SkillCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(skill)}
      className={`group flex w-full flex-col rounded-xl border p-4 text-left transition-all hover:border-purple-500/40 hover:shadow-lg ${
        isSelected
          ? 'border-purple-500 bg-gray-800/80 shadow-lg shadow-purple-500/10'
          : 'border-gray-700 bg-gray-800/50'
      }`}
      aria-expanded={isSelected}
      aria-label={`${skill.title} - ${skill.category}`}
    >
      {/* Header: Category badge + Price */}
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-700/60 px-2.5 py-1 text-[11px] font-medium text-gray-300">
          <Tag size={11} className="text-gray-400" />
          {skill.category}
        </span>
        <span className="text-sm font-bold text-green-400">
          {skill.price > 0 ? `$${skill.price.toFixed(2)}` : 'Free'}
        </span>
      </div>

      {/* Title */}
      <h3 className="mb-1.5 text-sm font-semibold text-white group-hover:text-purple-300 transition-colors line-clamp-1">
        {skill.title}
      </h3>

      {/* Description */}
      <p className="mb-3 flex-1 text-xs text-gray-400 line-clamp-2">
        {skill.description}
      </p>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-700/50 pt-3 text-[11px] text-gray-500">
        {/* Developer */}
        <span className="inline-flex items-center gap-1">
          <Code size={11} />
          {skill.developerName}
        </span>

        {/* Install count */}
        <span className="inline-flex items-center gap-1">
          <Download size={11} />
          {skill.installCount.toLocaleString()}
        </span>

        {/* AXP earning estimate */}
        {skill.axpEarningEstimate > 0 && (
          <span className="inline-flex items-center gap-1 text-yellow-400">
            <Zap size={11} />
            ~{skill.axpEarningEstimate} AXP
          </span>
        )}
      </div>
    </button>
  );
}

export default SkillCard;
