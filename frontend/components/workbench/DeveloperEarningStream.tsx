/**
 * 开发者收益实时看板组件 (Earning Stream)
 * 
 * - 实时滚动显示收益流
 * - 链路跟踪
 * - 收益统计图表
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { AIButton } from '../ui/AIButton';

export interface EarningEvent {
  id: string;
  skillId: string;
  skillName: string;
  amount: number;
  currency: string;
  callerType: 'user' | 'agent' | 'platform';
  callerId?: string;
  callerName?: string;
  platform: 'chatgpt' | 'claude' | 'gemini' | 'internal' | 'api';
  timestamp: Date;
  chain?: {
    user?: string;
    agent?: string;
    skill: string;
    product?: string;
  };
}

export interface EarningSummary {
  today: number;
  thisWeek: number;
  thisMonth: number;
  totalCalls: number;
  avgPerCall: number;
  topSkill?: {
    id: string;
    name: string;
    earnings: number;
  };
}

interface DeveloperEarningStreamProps {
  developerId: string;
  onFetchEvents?: () => Promise<EarningEvent[]>;
  onFetchSummary?: () => Promise<EarningSummary>;
  pollInterval?: number; // ms
  maxDisplayEvents?: number;
}

const PLATFORM_COLORS: Record<string, string> = {
  chatgpt: 'text-green-400',
  claude: 'text-orange-400',
  gemini: 'text-blue-400',
  internal: 'text-primary-cyan',
  api: 'text-purple-400',
};

const PLATFORM_ICONS: Record<string, string> = {
  chatgpt: '🟢',
  claude: '🟠',
  gemini: '🔵',
  internal: '⚡',
  api: '🔌',
};

export function DeveloperEarningStream({
  developerId,
  onFetchEvents,
  onFetchSummary,
  pollInterval = 10000,
  maxDisplayEvents = 20,
}: DeveloperEarningStreamProps) {
  const [events, setEvents] = useState<EarningEvent[]>([]);
  const [summary, setSummary] = useState<EarningSummary | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<EarningEvent | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  // 获取收益事件
  const fetchEvents = useCallback(async () => {
    if (!onFetchEvents) {
      // 模拟数据
      const mockEvents: EarningEvent[] = [
        {
          id: `evt-${Date.now()}`,
          skillId: 'skill-1',
          skillName: 'Weather Query',
          amount: 0.05,
          currency: 'USDC',
          callerType: 'agent',
          callerName: 'Shopping Assistant',
          platform: 'chatgpt',
          timestamp: new Date(),
          chain: {
            user: 'User A',
            agent: 'Shopping Assistant',
            skill: 'Weather Query',
          },
        },
      ];
      return mockEvents;
    }
    return await onFetchEvents();
  }, [onFetchEvents]);

  // 获取汇总数据
  const fetchSummary = useCallback(async () => {
    if (!onFetchSummary) {
      // 模拟数据
      return {
        today: 12.50,
        thisWeek: 87.30,
        thisMonth: 342.15,
        totalCalls: 6842,
        avgPerCall: 0.05,
        topSkill: {
          id: 'skill-1',
          name: 'Weather Query',
          earnings: 156.20,
        },
      };
    }
    return await onFetchSummary();
  }, [onFetchSummary]);

  // 轮询更新
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    const update = async () => {
      try {
        const [newEvents, newSummary] = await Promise.all([
          fetchEvents(),
          fetchSummary(),
        ]);
        
        setEvents(prev => {
          const combined = [...newEvents, ...prev];
          // 去重并限制数量
          const seen = new Set<string>();
          const unique = combined.filter(e => {
            if (seen.has(e.id)) return false;
            seen.add(e.id);
            return true;
          });
          return unique.slice(0, maxDisplayEvents);
        });
        
        setSummary(newSummary);
      } catch (error) {
        console.error('Failed to fetch earning data:', error);
      }
    };

    update(); // 初始加载

    if (isLive) {
      intervalId = setInterval(update, pollInterval);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isLive, pollInterval, fetchEvents, fetchSummary, maxDisplayEvents]);

  // 格式化时间
  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      {/* 汇总卡片 */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <GlassCard className="p-4">
            <div className="text-xs text-neutral-400 mb-1">今日收益</div>
            <div className="text-xl font-bold text-primary-neon">
              ${summary.today.toFixed(2)}
            </div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="text-xs text-neutral-400 mb-1">本周收益</div>
            <div className="text-xl font-bold text-primary-cyan">
              ${summary.thisWeek.toFixed(2)}
            </div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="text-xs text-neutral-400 mb-1">本月收益</div>
            <div className="text-xl font-bold text-neutral-100">
              ${summary.thisMonth.toFixed(2)}
            </div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="text-xs text-neutral-400 mb-1">总调用次数</div>
            <div className="text-xl font-bold text-neutral-100">
              {summary.totalCalls.toLocaleString()}
            </div>
          </GlassCard>
        </div>
      )}

      {/* 实时流 */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-neutral-100">收益实时流</h3>
            {isLive && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-green-400">LIVE</span>
              </div>
            )}
          </div>
          <AIButton
            variant="ghost"
            className="text-sm"
            onClick={() => setIsLive(!isLive)}
          >
            {isLive ? '暂停' : '恢复'}
          </AIButton>
        </div>

        {/* 事件流列表 */}
        <div 
          ref={streamRef}
          className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar"
        >
          {events.length === 0 ? (
            <div className="text-center py-8 text-neutral-400">
              <p className="text-2xl mb-2">📊</p>
              <p className="text-sm">等待收益数据...</p>
            </div>
          ) : (
            events.map((event, idx) => (
              <div
                key={event.id}
                className={`p-3 rounded-lg bg-neutral-800/30 border border-transparent hover:border-primary-blue/30 transition-all cursor-pointer ${
                  idx === 0 ? 'animate-slide-in' : ''
                }`}
                onClick={() => setSelectedEvent(event)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* 平台图标 */}
                    <span className="text-lg">{PLATFORM_ICONS[event.platform]}</span>
                    
                    {/* Skill 信息 */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-neutral-200">
                          {event.skillName}
                        </span>
                        <span className={`text-xs ${PLATFORM_COLORS[event.platform]}`}>
                          {event.platform}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-500">
                        {event.callerType === 'agent' ? (
                          <>Agent: {event.callerName || event.callerId}</>
                        ) : event.callerType === 'user' ? (
                          <>用户直接调用</>
                        ) : (
                          <>平台调用</>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 金额和时间 */}
                  <div className="text-right">
                    <div className="text-lg font-bold text-primary-neon">
                      +${event.amount.toFixed(4)}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {formatTime(event.timestamp)}
                    </div>
                  </div>
                </div>

                {/* 简化链路显示 */}
                {event.chain && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-neutral-400 overflow-x-auto">
                    {event.chain.user && (
                      <>
                        <span className="px-1.5 py-0.5 rounded bg-neutral-700/50">
                          👤 {event.chain.user}
                        </span>
                        <span>→</span>
                      </>
                    )}
                    {event.chain.agent && (
                      <>
                        <span className="px-1.5 py-0.5 rounded bg-primary-blue/20 text-primary-cyan">
                          🤖 {event.chain.agent}
                        </span>
                        <span>→</span>
                      </>
                    )}
                    <span className="px-1.5 py-0.5 rounded bg-primary-cyan/20 text-primary-neon">
                      🔧 {event.chain.skill}
                    </span>
                    {event.chain.product && (
                      <>
                        <span>→</span>
                        <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                          📦 {event.chain.product}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </GlassCard>

      {/* 事件详情弹窗 */}
      {selectedEvent && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setSelectedEvent(null)}
        >
          <div onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <GlassCard className="w-full max-w-md mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-neutral-100">收益详情</h3>
                <button 
                  onClick={() => setSelectedEvent(null)}
                  className="text-neutral-400 hover:text-neutral-200"
                >
                  ✕
                </button>
              </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-neutral-400">Skill</span>
                <span className="text-neutral-200">{selectedEvent.skillName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">收益</span>
                <span className="text-primary-neon font-bold">
                  +${selectedEvent.amount.toFixed(4)} {selectedEvent.currency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">平台</span>
                <span className={PLATFORM_COLORS[selectedEvent.platform]}>
                  {PLATFORM_ICONS[selectedEvent.platform]} {selectedEvent.platform}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">调用者类型</span>
                <span className="text-neutral-200">
                  {selectedEvent.callerType === 'agent' ? 'AI Agent' : 
                   selectedEvent.callerType === 'user' ? '用户' : '平台'}
                </span>
              </div>
              {selectedEvent.callerName && (
                <div className="flex justify-between">
                  <span className="text-neutral-400">调用者</span>
                  <span className="text-neutral-200">{selectedEvent.callerName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-neutral-400">时间</span>
                <span className="text-neutral-200">
                  {selectedEvent.timestamp.toLocaleString()}
                </span>
              </div>

              {/* 完整链路 */}
              {selectedEvent.chain && (
                <div className="pt-3 border-t border-neutral-700/50">
                  <div className="text-sm text-neutral-400 mb-2">收益链路</div>
                  <div className="flex flex-col gap-2">
                    {selectedEvent.chain.user && (
                      <div className="flex items-center gap-2">
                        <span className="w-6 text-center">👤</span>
                        <span className="text-neutral-300">{selectedEvent.chain.user}</span>
                      </div>
                    )}
                    {selectedEvent.chain.agent && (
                      <div className="flex items-center gap-2">
                        <span className="w-6 text-center">🤖</span>
                        <span className="text-primary-cyan">{selectedEvent.chain.agent}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-center">🔧</span>
                      <span className="text-primary-neon">{selectedEvent.chain.skill}</span>
                    </div>
                    {selectedEvent.chain.product && (
                      <div className="flex items-center gap-2">
                        <span className="w-6 text-center">📦</span>
                        <span className="text-green-400">{selectedEvent.chain.product}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </GlassCard>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.1);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 240, 255, 0.3);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 240, 255, 0.5);
        }
      `}</style>
    </div>
  );
}

export default DeveloperEarningStream;
