import { GlassCard } from '../ui/GlassCard';

interface PaymentProgressCardProps {
  steps: Array<{
    label: string;
    status: 'completed' | 'active' | 'pending';
  }>;
}

/**
 * 支付进度卡片组件（Agentrix V3.0设计规范）
 * 显示从推荐 → 创建订单 → 结算 → 支付成功的流程
 */
export function PaymentProgressCard({ steps }: PaymentProgressCardProps) {
  return (
    <GlassCard className="ai-glow">
      <div className="text-sm font-semibold text-neutral-100 mb-4 flex items-center gap-2">
        <span>💳</span>
        <span>支付进度</span>
      </div>

      <div className="space-y-4">
        {steps.map((step, index) => (
          <div key={index} className="flex items-start gap-3">
            {/* 步骤指示器 */}
            <div className="flex flex-col items-center">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold
                  ${
                    step.status === 'completed'
                      ? 'bg-accent-green text-white'
                      : step.status === 'active'
                      ? 'bg-primary-neon text-neutral-900 animate-pulse-glow'
                      : 'bg-neutral-700 text-neutral-400'
                  }
                `}
              >
                {step.status === 'completed' ? '✓' : index + 1}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`
                    w-0.5 h-8 mt-2
                    ${step.status === 'completed' ? 'bg-accent-green' : 'bg-neutral-700'}
                  `}
                />
              )}
            </div>

            {/* 步骤内容 */}
            <div className="flex-1 pt-1">
              <div
                className={`
                  text-sm
                  ${
                    step.status === 'completed'
                      ? 'text-neutral-300'
                      : step.status === 'active'
                      ? 'text-primary-neon font-semibold'
                      : 'text-neutral-500'
                  }
                `}
              >
                {step.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

