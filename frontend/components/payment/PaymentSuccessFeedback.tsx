/**
 * 支付成功动态反馈组件
 * 
 * 支付完成后显示 AI 后续操作状态
 */

import { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { AIButton } from '../ui/AIButton';

export type PaymentStatus = 'processing' | 'completed' | 'ai_continuing' | 'task_done' | 'error';

export interface PaymentResult {
  transactionId: string;
  amount: number;
  currency: string;
  paymentMethod: 'x402' | 'stripe' | 'transak' | 'wallet';
  timestamp: Date;
  txHash?: string; // 链上交易哈希
}

export interface AITaskStatus {
  taskId: string;
  description: string;
  progress: number; // 0-100
  steps: Array<{
    name: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    message?: string;
  }>;
}

interface PaymentSuccessFeedbackProps {
  paymentResult: PaymentResult;
  aiTask?: AITaskStatus;
  agentName?: string;
  onViewTransaction?: (txId: string) => void;
  onReturnToTask?: () => void;
  onClose?: () => void;
}

export function PaymentSuccessFeedback({
  paymentResult,
  aiTask,
  agentName = 'AI Agent',
  onViewTransaction,
  onReturnToTask,
  onClose,
}: PaymentSuccessFeedbackProps) {
  const [status, setStatus] = useState<PaymentStatus>('completed');
  const [showDetails, setShowDetails] = useState(false);

  // 模拟 AI 继续任务的状态
  useEffect(() => {
    if (aiTask) {
      setStatus('ai_continuing');
      
      // 检查任务是否完成
      const allCompleted = aiTask.steps.every(s => s.status === 'completed');
      if (allCompleted) {
        setTimeout(() => setStatus('task_done'), 500);
      }
    }
  }, [aiTask]);

  const getPaymentMethodLabel = useCallback((method: string) => {
    switch (method) {
      case 'x402': return 'X402 (AUSDC)';
      case 'stripe': return '信用卡';
      case 'transak': return 'Transak';
      case 'wallet': return '钱包';
      default: return method;
    }
  }, []);

  const getStatusIcon = useCallback(() => {
    switch (status) {
      case 'processing': return '⏳';
      case 'completed': return '✅';
      case 'ai_continuing': return '🤖';
      case 'task_done': return '🎉';
      case 'error': return '❌';
      default: return '✅';
    }
  }, [status]);

  const getStatusMessage = useCallback(() => {
    switch (status) {
      case 'processing': return '支付处理中...';
      case 'completed': return '支付成功！';
      case 'ai_continuing': return `${agentName} 已获得权限，正在继续您的任务...`;
      case 'task_done': return '任务完成！';
      case 'error': return '支付遇到问题';
      default: return '支付成功';
    }
  }, [status, agentName]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <GlassCard className="w-full max-w-md mx-4 relative overflow-hidden">
        {/* 顶部装饰动效 */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-blue via-primary-cyan to-primary-neon animate-gradient-x" />
        
        {/* 关闭按钮 */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-200 transition-colors z-10"
          >
            ✕
          </button>
        )}

        {/* 主要状态 */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary-blue/30 to-primary-cyan/30 flex items-center justify-center text-4xl animate-pulse-glow">
            {getStatusIcon()}
          </div>
          <h2 className="text-xl font-semibold text-neutral-100 mb-2">
            {getStatusMessage()}
          </h2>
          
          {/* 交易金额 */}
          <div className="text-3xl font-bold text-primary-neon">
            {paymentResult.currency === 'USD' ? '$' : ''}{paymentResult.amount.toFixed(2)}
            <span className="text-sm text-neutral-400 ml-2">
              {paymentResult.currency}
            </span>
          </div>
        </div>

        {/* AI 任务进度（如果有） */}
        {aiTask && status === 'ai_continuing' && (
          <div className="mb-6 p-4 rounded-lg bg-primary-blue/10 border border-primary-blue/20">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-primary-cyan animate-ping" />
              <span className="text-sm font-medium text-primary-cyan">
                {agentName} 正在执行任务
              </span>
            </div>
            
            {/* 进度条 */}
            <div className="h-2 bg-neutral-700 rounded-full overflow-hidden mb-3">
              <div 
                className="h-full bg-gradient-to-r from-primary-blue to-primary-cyan transition-all duration-500"
                style={{ width: `${aiTask.progress}%` }}
              />
            </div>

            {/* 步骤列表 */}
            <div className="space-y-2">
              {aiTask.steps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <span className={`w-4 h-4 flex items-center justify-center rounded-full text-xs ${
                    step.status === 'completed' ? 'bg-green-500/30 text-green-400' :
                    step.status === 'running' ? 'bg-primary-cyan/30 text-primary-cyan animate-pulse' :
                    step.status === 'error' ? 'bg-red-500/30 text-red-400' :
                    'bg-neutral-700/50 text-neutral-500'
                  }`}>
                    {step.status === 'completed' ? '✓' : 
                     step.status === 'running' ? '●' : 
                     step.status === 'error' ? '!' : '○'}
                  </span>
                  <span className={`${
                    step.status === 'running' ? 'text-neutral-200' : 'text-neutral-400'
                  }`}>
                    {step.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 任务完成状态 */}
        {status === 'task_done' && (
          <div className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-green-400">✓</span>
              <span className="text-sm font-medium text-green-400">
                任务已完成
              </span>
            </div>
            <p className="text-sm text-neutral-300">
              {aiTask?.description || '您的任务已成功完成'}
            </p>
          </div>
        )}

        {/* 交易详情 */}
        <div className="mb-6">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors w-full"
          >
            <span>{showDetails ? '▼' : '▶'}</span>
            交易详情
          </button>
          
          {showDetails && (
            <div className="mt-3 p-3 rounded-lg bg-neutral-800/30 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-400">交易 ID</span>
                <span className="text-neutral-200 font-mono text-xs">
                  {paymentResult.transactionId.slice(0, 16)}...
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">支付方式</span>
                <span className="text-neutral-200">
                  {getPaymentMethodLabel(paymentResult.paymentMethod)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">时间</span>
                <span className="text-neutral-200">
                  {paymentResult.timestamp.toLocaleString()}
                </span>
              </div>
              {paymentResult.txHash && (
                <div className="flex justify-between">
                  <span className="text-neutral-400">链上交易</span>
                  <a 
                    href={`https://etherscan.io/tx/${paymentResult.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-cyan hover:underline font-mono text-xs"
                  >
                    {paymentResult.txHash.slice(0, 10)}...
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3">
          {onViewTransaction && (
            <AIButton
              variant="outline"
              className="flex-1"
              onClick={() => onViewTransaction(paymentResult.transactionId)}
            >
              查看交易
            </AIButton>
          )}
          <AIButton
            className="flex-1"
            onClick={onReturnToTask || onClose}
          >
            {status === 'ai_continuing' ? '返回查看' : '完成'}
          </AIButton>
        </div>

        {/* 契约合成动效（支付成功时） */}
        {status === 'completed' && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full border border-primary-cyan/30 animate-ping-slow" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full border border-primary-blue/20 animate-ping-slow animation-delay-200" />
          </div>
        )}

        <style jsx>{`
          @keyframes gradient-x {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
          }
          .animate-gradient-x {
            background-size: 200% 200%;
            animation: gradient-x 3s ease infinite;
          }
          @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 20px rgba(0, 240, 255, 0.3); }
            50% { box-shadow: 0 0 40px rgba(0, 240, 255, 0.6); }
          }
          .animate-pulse-glow {
            animation: pulse-glow 2s ease-in-out infinite;
          }
          @keyframes ping-slow {
            0% { transform: translate(-50%, -50%) scale(1); opacity: 0.5; }
            100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
          }
          .animate-ping-slow {
            animation: ping-slow 2s cubic-bezier(0, 0, 0.2, 1) infinite;
          }
          .animation-delay-200 {
            animation-delay: 200ms;
          }
        `}</style>
      </GlassCard>
    </div>
  );
}

export default PaymentSuccessFeedback;
