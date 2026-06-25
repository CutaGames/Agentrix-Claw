import { useState, useEffect } from 'react';
import { UnifiedAgentChat, AgentMode } from './UnifiedAgentChat';

interface StandaloneAgentProps {
  agentId?: string;
  agentType?: 'user' | 'merchant' | 'developer';
  apiKey?: string;
  config?: {
    title?: string;
    theme?: 'light' | 'dark';
    showModeSwitcher?: boolean;
  };
}

/**
 * 独立Agent组件
 * 可以在任何网站中嵌入使用，不依赖Agentrix官网
 */
export function StandaloneAgent({
  agentId,
  agentType = 'user',
  apiKey,
  config = {},
}: StandaloneAgentProps) {
  const [mode, setMode] = useState<AgentMode>(agentType);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // 初始化独立Agent
    // 可以在这里加载Agent配置、验证API密钥等
    setIsReady(true);
  }, [agentId, apiKey]);

  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-full bg-neutral-900">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-neutral-400">正在加载Agent...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      {config.title && (
        <div className="p-4 border-b border-neutral-800 bg-neutral-900">
          <h2 className="text-lg font-semibold text-white">{config.title}</h2>
        </div>
      )}
      <UnifiedAgentChat
        mode={mode}
        onModeChange={setMode}
        standalone={!config.showModeSwitcher}
      />
    </div>
  );
}

