'use client';

import React from 'react';

interface Step {
  number: number;
  title: string;
  description: string;
  status: 'completed' | 'current' | 'upcoming';
  icon: string;
}

interface Props {
  hasAgent: boolean;
  hasWallet: boolean;
  isOnChain: boolean;
  onCreateAgent: () => void;
  onRegisterOnchain: () => void;
}

export const AgentOnboardingGuide: React.FC<Props> = ({
  hasAgent,
  hasWallet,
  isOnChain,
  onCreateAgent,
  onRegisterOnchain,
}) => {
  const steps: Step[] = [
    {
      number: 1,
      title: '创建 AI Agent',
      description: '选择 Agent 类型，设置名称、能力和支出限额',
      status: hasAgent ? 'completed' : 'current',
      icon: '🤖',
    },
    {
      number: 2,
      title: '自动配置钱包',
      description: 'Agent 创建时自动生成 MPC 托管钱包，无需手动操作',
      status: hasAgent ? (hasWallet ? 'completed' : 'current') : 'upcoming',
      icon: '💰',
    },
    {
      number: 3,
      title: '链上注册（可选）',
      description: '获取 EAS 链上身份证书，Gas 费由平台承担，完全免费',
      status: isOnChain ? 'completed' : hasAgent ? 'current' : 'upcoming',
      icon: '🔗',
    },
    {
      number: 4,
      title: '开始使用',
      description: '让 Agent 代你执行任务、管理资金、参与 Agent 经济体',
      status: isOnChain ? 'current' : 'upcoming',
      icon: '🚀',
    },
  ];

  // 不显示已完成所有步骤后的引导
  const allDone = hasAgent && hasWallet && isOnChain;
  if (allDone) return null;

  return (
    <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 rounded-2xl border border-blue-100 p-6 mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">快速上手指南</h3>
          <p className="text-sm text-gray-500">几步即可启动你的 AI Agent</p>
        </div>
      </div>

      <div className="relative">
        {/* Progress line */}
        <div className="absolute left-[22px] top-8 bottom-8 w-0.5 bg-gray-200" />

        <div className="space-y-4">
          {steps.map((step) => (
            <div key={step.number} className="flex items-start gap-4 relative">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                step.status === 'completed' ? 'bg-green-500 text-white' :
                step.status === 'current' ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
                'bg-gray-200 text-gray-500'
              }`}>
                {step.status === 'completed' ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                ) : (
                  <span className="text-base">{step.icon}</span>
                )}
              </div>
              <div className="flex-1 pt-1">
                <div className="flex items-center gap-2">
                  <h4 className={`text-sm font-semibold ${step.status === 'upcoming' ? 'text-gray-400' : 'text-gray-900'}`}>
                    {step.title}
                  </h4>
                  {step.status === 'current' && step.number === 3 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">免费</span>
                  )}
                </div>
                <p className={`text-xs mt-0.5 ${step.status === 'upcoming' ? 'text-gray-400' : 'text-gray-500'}`}>
                  {step.description}
                </p>
                {/* Action buttons */}
                {step.status === 'current' && step.number === 1 && !hasAgent && (
                  <button
                    onClick={onCreateAgent}
                    className="mt-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
                  >
                    创建 Agent
                  </button>
                )}
                {step.status === 'current' && step.number === 3 && hasAgent && !isOnChain && (
                  <button
                    onClick={onRegisterOnchain}
                    className="mt-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
                  >
                    🔗 链上注册 (Gas 平台代付)
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info banner */}
      <div className="mt-4 flex items-start gap-2 p-3 bg-white/60 rounded-lg border border-blue-100">
        <span className="text-sm">💡</span>
        <div className="text-xs text-gray-600">
          <p className="font-medium text-gray-700 mb-0.5">链上注册是可选的</p>
          <p>不注册也可以正常使用 Agent 所有功能。链上注册能让其他 Agent 和用户验证你的 Agent 身份，提升信任度。Gas 费由平台承担，你不需要在钱包中持有任何代币。</p>
        </div>
      </div>
    </div>
  );
};
