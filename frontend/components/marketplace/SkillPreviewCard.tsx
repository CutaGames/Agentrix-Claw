/**
 * Skill 预览卡片组件 (Magic Preview)
 * 
 * 支持:
 * - 快速试用对话框
 * - AI 决策摘要（推荐理由）
 * - UCP 源标识
 */

import { useState, useCallback } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { AIButton } from '../ui/AIButton';

export type SkillSource = 'internal' | 'external_ucp' | 'partner' | 'mcp_registry';

export interface SkillPreviewData {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  icon?: string;
  category?: string;
  price?: number;
  pricePerCall?: number;
  currency?: string;
  rating?: number;
  callCount?: number;
  source: SkillSource;
  sourceUrl?: string;
  sourceName?: string;
  ucpCompatible?: boolean;
  x402Compatible?: boolean;
  // AI 生成的推荐理由
  aiReasons?: string[];
  tags?: string[];
}

interface SkillPreviewCardProps {
  skill: SkillPreviewData;
  onTrySkill?: (skillId: string, message: string) => Promise<string>;
  onInstall?: (skillId: string) => void;
  onViewDetails?: (skillId: string) => void;
  showQuickTry?: boolean;
}

const SOURCE_LABELS: Record<SkillSource, { label: string; color: string; icon: string }> = {
  internal: { label: '自营', color: 'text-primary-neon bg-primary-neon/20', icon: '✅' },
  external_ucp: { label: 'UCP 外部', color: 'text-amber-400 bg-amber-400/20', icon: '🌐' },
  partner: { label: '合作伙伴', color: 'text-primary-cyan bg-primary-cyan/20', icon: '🤝' },
  mcp_registry: { label: 'MCP 注册', color: 'text-purple-400 bg-purple-400/20', icon: '🔌' },
};

export function SkillPreviewCard({
  skill,
  onTrySkill,
  onInstall,
  onViewDetails,
  showQuickTry = true,
}: SkillPreviewCardProps) {
  const [tryMessage, setTryMessage] = useState('');
  const [tryResult, setTryResult] = useState<string | null>(null);
  const [isTrying, setIsTrying] = useState(false);
  const [showTryPanel, setShowTryPanel] = useState(false);

  const handleTry = useCallback(async () => {
    if (!tryMessage.trim() || !onTrySkill) return;
    
    setIsTrying(true);
    try {
      const result = await onTrySkill(skill.id, tryMessage);
      setTryResult(result);
    } catch (error) {
      setTryResult(`错误: ${error instanceof Error ? error.message : '试用失败'}`);
    } finally {
      setIsTrying(false);
    }
  }, [tryMessage, onTrySkill, skill.id]);

  const sourceInfo = SOURCE_LABELS[skill.source];

  return (
    <GlassCard className="relative overflow-hidden" hover>
      {/* 来源标识徽章 */}
      <div className="absolute top-3 right-3 z-10">
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${sourceInfo.color}`}>
          <span>{sourceInfo.icon}</span>
          <span>{sourceInfo.label}</span>
        </div>
      </div>

      {/* 协议兼容性标识 */}
      <div className="absolute top-3 left-3 z-10 flex gap-1">
        {skill.ucpCompatible && (
          <div className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-xs">
            UCP
          </div>
        )}
        {skill.x402Compatible && (
          <div className="px-2 py-0.5 rounded bg-green-500/20 text-green-400 text-xs">
            X402
          </div>
        )}
      </div>

      <div className="flex gap-4">
        {/* 左侧：Skill 信息 */}
        <div className="flex-1 min-w-0">
          {/* Icon 和标题 */}
          <div className="flex items-center gap-3 mt-6 mb-3">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary-blue/30 to-primary-cyan/30 flex items-center justify-center text-2xl flex-shrink-0">
              {skill.icon || '🔧'}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-neutral-100 truncate">
                {skill.displayName || skill.name}
              </h3>
              {skill.category && (
                <p className="text-xs text-primary-cyan">{skill.category}</p>
              )}
            </div>
          </div>

          {/* 描述 */}
          {skill.description && (
            <p className="text-sm text-neutral-400 line-clamp-2 mb-3">
              {skill.description}
            </p>
          )}

          {/* AI 推荐理由 (决策摘要) */}
          {skill.aiReasons && skill.aiReasons.length > 0 && (
            <div className="mb-3 p-3 rounded-lg bg-primary-blue/10 border border-primary-blue/20">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-primary-cyan">🤖</span>
                <span className="text-xs font-medium text-primary-cyan">AI 推荐理由</span>
              </div>
              <ul className="space-y-1">
                {skill.aiReasons.slice(0, 3).map((reason, idx) => (
                  <li key={idx} className="text-xs text-neutral-300 flex items-start gap-2">
                    <span className="text-primary-neon mt-0.5">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 价格和统计 */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-baseline gap-2">
              {skill.pricePerCall !== undefined && skill.pricePerCall > 0 ? (
                <>
                  <span className="text-xl font-bold text-primary-neon">
                    ${skill.pricePerCall.toFixed(4)}
                  </span>
                  <span className="text-xs text-neutral-500">/调用</span>
                </>
              ) : (
                <span className="text-lg font-semibold text-green-400">免费</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-neutral-400">
              {skill.rating !== undefined && (
                <span>⭐ {skill.rating.toFixed(1)}</span>
              )}
              {skill.callCount !== undefined && (
                <span>📊 {skill.callCount.toLocaleString()} 次调用</span>
              )}
            </div>
          </div>

          {/* 来源信息 */}
          {skill.source === 'external_ucp' && skill.sourceName && (
            <div className="text-xs text-neutral-500 mb-3">
              来源: {skill.sourceName}
              {skill.sourceUrl && (
                <a 
                  href={skill.sourceUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="ml-2 text-primary-cyan hover:underline"
                >
                  查看原站 →
                </a>
              )}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-2">
            <AIButton
              variant="outline"
              className="flex-1 text-sm py-2"
              onClick={() => onViewDetails?.(skill.id)}
            >
              详情
            </AIButton>
            <AIButton
              className="flex-1 text-sm py-2"
              onClick={() => onInstall?.(skill.id)}
            >
              安装
            </AIButton>
            {showQuickTry && onTrySkill && (
              <AIButton
                variant="ghost"
                className="text-sm py-2 px-3"
                onClick={() => setShowTryPanel(!showTryPanel)}
              >
                {showTryPanel ? '收起' : '试用'}
              </AIButton>
            )}
          </div>
        </div>

        {/* 右侧：快速试用面板 */}
        {showTryPanel && showQuickTry && onTrySkill && (
          <div className="w-64 flex-shrink-0 border-l border-neutral-700/50 pl-4">
            <div className="text-sm font-medium text-neutral-200 mb-2">
              快速试用
            </div>
            <textarea
              value={tryMessage}
              onChange={(e) => setTryMessage(e.target.value)}
              placeholder="输入测试消息..."
              className="w-full h-20 bg-neutral-800/50 border border-neutral-600 rounded-lg p-2 text-sm text-neutral-200 placeholder-neutral-500 resize-none focus:outline-none focus:border-primary-cyan"
            />
            <AIButton
              className="w-full mt-2 text-sm py-1.5"
              onClick={handleTry}
              disabled={isTrying || !tryMessage.trim()}
            >
              {isTrying ? '处理中...' : '发送'}
            </AIButton>
            
            {/* 试用结果 */}
            {tryResult && (
              <div className="mt-3 p-2 rounded-lg bg-neutral-800/50 border border-neutral-600">
                <div className="text-xs text-neutral-400 mb-1">响应:</div>
                <div className="text-sm text-neutral-200 max-h-32 overflow-y-auto">
                  {tryResult}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tags */}
      {skill.tags && skill.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-neutral-700/30">
          {skill.tags.slice(0, 5).map((tag, idx) => (
            <span 
              key={idx}
              className="px-2 py-0.5 text-xs rounded bg-neutral-700/50 text-neutral-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

export default SkillPreviewCard;
