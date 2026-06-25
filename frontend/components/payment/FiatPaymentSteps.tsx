'use client';

import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

export type FiatPaymentStep = 'price' | 'email' | 'kyc' | 'payment' | 'complete';

interface FiatPaymentStepsProps {
  currentStep: FiatPaymentStep;
  kycCompleted?: boolean;
  className?: string;
}

const STEPS: { id: FiatPaymentStep; label: string; labelZh: string }[] = [
  { id: 'price', label: 'Price', labelZh: '确认价格' },
  { id: 'email', label: 'Email', labelZh: '邮箱验证' },
  { id: 'kyc', label: 'KYC', labelZh: '身份认证' },
  { id: 'payment', label: 'Pay', labelZh: '支付' },
  { id: 'complete', label: 'Done', labelZh: '完成' },
];

function getStepIndex(step: FiatPaymentStep): number {
  return STEPS.findIndex(s => s.id === step);
}

export function FiatPaymentSteps({ currentStep, kycCompleted, className = '' }: FiatPaymentStepsProps) {
  const currentIndex = getStepIndex(currentStep);

  return (
    <div className={`flex items-center gap-0.5 sm:gap-1 ${className}`}>
      {STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isSkipped = step.id === 'kyc' && kycCompleted && currentIndex > getStepIndex('kyc');
        
        // Skip KYC step display if already completed
        if (step.id === 'kyc' && kycCompleted && !isCurrent) {
          return (
            <div key={step.id} className="flex items-center">
              {index > 0 && (
                <div className="w-2 sm:w-4 h-0.5 bg-emerald-400 mx-0.5" />
              )}
              <div className="flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 size={10} className="sm:w-3 sm:h-3" />
                <span className="text-[8px] sm:text-[10px] font-medium line-through opacity-60 hidden sm:inline">{step.labelZh}</span>
              </div>
            </div>
          );
        }

        return (
          <div key={step.id} className="flex items-center">
            {index > 0 && (
              <div 
                className={`w-2 sm:w-4 h-0.5 mx-0.5 transition-colors ${
                  isCompleted || isSkipped ? 'bg-emerald-400' : 'bg-slate-200'
                }`}
              />
            )}
            <div 
              className={`flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-[8px] sm:text-[10px] font-medium transition-all ${
                isCompleted
                  ? 'bg-emerald-100 text-emerald-700'
                  : isCurrent
                    ? 'bg-indigo-100 text-indigo-700 ring-1 sm:ring-2 ring-indigo-200'
                    : 'bg-slate-100 text-slate-400'
              }`}
            >
              {isCompleted ? (
                <CheckCircle2 size={10} className="sm:w-3 sm:h-3" />
              ) : isCurrent ? (
                <Loader2 size={10} className="sm:w-3 sm:h-3 animate-spin" />
              ) : (
                <Circle size={10} className="sm:w-3 sm:h-3" />
              )}
              <span className="hidden xs:inline sm:inline">{step.labelZh}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
