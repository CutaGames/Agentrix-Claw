/**
 * Agent 预授权 UI 组件 (AP2 Mandate)
 * 
 * 允许用户设置自动购买额度，避免每次支付都需要跳转确认
 */

import { useState, useCallback, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { AIButton } from '../ui/AIButton';

export interface AgentMandate {
  agentId: string;
  agentName: string;
  maxAmount: number;
  currency: string;
  dailyLimit?: number;
  expiresAt?: Date;
  allowedCategories?: string[];
  isActive: boolean;
}

interface AgentPreauthorizationProps {
  agentId: string;
  agentName: string;
  agentIcon?: string;
  currentMandate?: AgentMandate | null;
  suggestedAmount?: number;
  onAuthorize: (mandate: Omit<AgentMandate, 'isActive'>) => Promise<void>;
  onRevoke?: (agentId: string) => Promise<void>;
  onClose?: () => void;
}

const PRESET_AMOUNTS = [10, 25, 50, 100, 250];

export function AgentPreauthorization({
  agentId,
  agentName,
  agentIcon,
  currentMandate,
  suggestedAmount = 50,
  onAuthorize,
  onRevoke,
  onClose,
}: AgentPreauthorizationProps) {
  const [maxAmount, setMaxAmount] = useState(suggestedAmount);
  const [dailyLimit, setDailyLimit] = useState<number | undefined>(undefined);
  const [enableDailyLimit, setEnableDailyLimit] = useState(false);
  const [expiresIn, setExpiresIn] = useState<'1h' | '24h' | '7d' | '30d' | 'never'>('24h');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (currentMandate) {
      setMaxAmount(currentMandate.maxAmount);
      if (currentMandate.dailyLimit) {
        setEnableDailyLimit(true);
        setDailyLimit(currentMandate.dailyLimit);
      }
    }
  }, [currentMandate]);

  const calculateExpiry = useCallback((): Date | undefined => {
    if (expiresIn === 'never') return undefined;
    
    const now = new Date();
    switch (expiresIn) {
      case '1h': return new Date(now.getTime() + 60 * 60 * 1000);
      case '24h': return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case '7d': return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      case '30d': return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      default: return undefined;
    }
  }, [expiresIn]);

  const handleAuthorize = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await onAuthorize({
        agentId,
        agentName,
        maxAmount,
        currency: 'USD',
        dailyLimit: enableDailyLimit ? dailyLimit : undefined,
        expiresAt: calculateExpiry(),
      });
      onClose?.();
    } catch (error) {
      console.error('Authorization failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [agentId, agentName, maxAmount, enableDailyLimit, dailyLimit, calculateExpiry, onAuthorize, onClose]);

  const handleRevoke = useCallback(async () => {
    if (!onRevoke) return;
    setIsSubmitting(true);
    try {
      await onRevoke(agentId);
      onClose?.();
    } catch (error) {
      console.error('Revoke failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [agentId, onRevoke, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <GlassCard className="w-full max-w-md mx-4 relative">
        {/* 关闭按钮 */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            ✕
          </button>
        )}

        {/* Agent 信息 */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-blue/30 to-primary-cyan/30 flex items-center justify-center text-2xl">
            {agentIcon || '🤖'}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-neutral-100">
              授权 Agent 自动购买
            </h3>
            <p className="text-sm text-neutral-400">
              {agentName}
            </p>
          </div>
        </div>

        {/* 授权说明 */}
        <div className="mb-6 p-3 rounded-lg bg-primary-blue/10 border border-primary-blue/20">
          <p className="text-sm text-neutral-300">
            授权后，此 Agent 可在您设定的额度内自动完成购买，无需每次手动确认。
          </p>
        </div>

        {/* 金额滑块 */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <label className="text-sm font-medium text-neutral-200">
              单次授权上限
            </label>
            <span className="text-xl font-bold text-primary-neon">
              ${maxAmount} USD
            </span>
          </div>
          
          {/* 滑块 */}
          <input
            type="range"
            min="5"
            max="500"
            step="5"
            value={maxAmount}
            onChange={(e) => setMaxAmount(Number(e.target.value))}
            className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer slider-thumb"
            style={{
              background: `linear-gradient(to right, #00F0FF 0%, #00F0FF ${(maxAmount / 500) * 100}%, #374151 ${(maxAmount / 500) * 100}%, #374151 100%)`
            }}
          />

          {/* 快捷金额按钮 */}
          <div className="flex gap-2 mt-3">
            {PRESET_AMOUNTS.map((amount) => (
              <button
                key={amount}
                onClick={() => setMaxAmount(amount)}
                className={`flex-1 py-1.5 text-sm rounded-lg transition-all ${
                  maxAmount === amount
                    ? 'bg-primary-cyan/30 text-primary-cyan border border-primary-cyan'
                    : 'bg-neutral-700/50 text-neutral-400 border border-transparent hover:bg-neutral-600/50'
                }`}
              >
                ${amount}
              </button>
            ))}
          </div>
        </div>

        {/* 高级设置 */}
        <div className="mb-6">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <span>{showAdvanced ? '▼' : '▶'}</span>
            高级设置
          </button>
          
          {showAdvanced && (
            <div className="mt-4 space-y-4 p-4 rounded-lg bg-neutral-800/30">
              {/* 有效期 */}
              <div>
                <label className="text-sm text-neutral-300 mb-2 block">授权有效期</label>
                <div className="flex gap-2 flex-wrap">
                  {(['1h', '24h', '7d', '30d', 'never'] as const).map((option) => (
                    <button
                      key={option}
                      onClick={() => setExpiresIn(option)}
                      className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                        expiresIn === option
                          ? 'bg-primary-blue/30 text-primary-cyan border border-primary-blue'
                          : 'bg-neutral-700/50 text-neutral-400 hover:bg-neutral-600/50'
                      }`}
                    >
                      {option === '1h' ? '1小时' : 
                       option === '24h' ? '24小时' : 
                       option === '7d' ? '7天' : 
                       option === '30d' ? '30天' : '永久'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 每日限额 */}
              <div>
                <label className="flex items-center gap-2 text-sm text-neutral-300 mb-2">
                  <input
                    type="checkbox"
                    checked={enableDailyLimit}
                    onChange={(e) => setEnableDailyLimit(e.target.checked)}
                    className="rounded bg-neutral-700 border-neutral-600"
                  />
                  启用每日消费限额
                </label>
                {enableDailyLimit && (
                  <input
                    type="number"
                    min="10"
                    max="10000"
                    value={dailyLimit || 100}
                    onChange={(e) => setDailyLimit(Number(e.target.value))}
                    className="w-full mt-2 px-3 py-2 bg-neutral-700/50 border border-neutral-600 rounded-lg text-neutral-200 focus:outline-none focus:border-primary-cyan"
                    placeholder="每日限额 (USD)"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* 当前授权状态 */}
        {currentMandate && currentMandate.isActive && (
          <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
            <div className="flex items-center justify-between">
              <span className="text-sm text-green-400">
                ✓ 当前已授权: ${currentMandate.maxAmount} USD
              </span>
              {onRevoke && (
                <button
                  onClick={handleRevoke}
                  disabled={isSubmitting}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  撤销授权
                </button>
              )}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-3">
          {onClose && (
            <AIButton
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={isSubmitting}
            >
              取消
            </AIButton>
          )}
          <AIButton
            className="flex-1"
            onClick={handleAuthorize}
            disabled={isSubmitting}
          >
            {isSubmitting ? '处理中...' : currentMandate?.isActive ? '更新授权' : '确认授权'}
          </AIButton>
        </div>

        {/* 安全提示 */}
        <p className="mt-4 text-xs text-neutral-500 text-center">
          🔒 您可以随时在设置中撤销此授权
        </p>
      </GlassCard>

      <style jsx>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #00F0FF;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(0, 240, 255, 0.5);
        }
      `}</style>
    </div>
  );
}

export default AgentPreauthorization;
