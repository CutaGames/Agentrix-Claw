import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { PersonalAgentApp } from '../../components/agent/standalone/PersonalAgentApp';
import { MerchantAgentApp } from '../../components/agent/standalone/MerchantAgentApp';
import { DeveloperAgentApp } from '../../components/agent/standalone/DeveloperAgentApp';

/**
 * 独立Agent页面
 * 根据Agent ID和类型加载对应的独立界面
 * 访问路径：/agent-standalone/[agentId]
 */
export default function StandaloneAgentPage() {
  const router = useRouter();
  const { agentId } = router.query;
  const [agentType, setAgentType] = useState<'user' | 'merchant' | 'developer'>('user');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 从URL参数或Agent配置中获取类型
    if (router.isReady && agentId) {
      // 这里可以从API获取Agent配置
      // 暂时从URL参数获取
      const type = router.query.type as string;
      if (type === 'merchant' || type === 'developer') {
        setAgentType(type);
      }
      setLoading(false);
    }
  }, [router.isReady, agentId, router.query]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-900">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-neutral-400">正在加载Agent...</p>
        </div>
      </div>
    );
  }

  const commonProps = {
    agentId: agentId as string,
    apiKey: router.query.apiKey as string | undefined,
    config: {
      title: router.query.title as string | undefined,
      theme: (router.query.theme as 'light' | 'dark') || 'dark',
      showSidebar: router.query.sidebar !== 'false',
    },
  };

  if (agentType === 'merchant') {
    return <MerchantAgentApp {...commonProps} />;
  }

  if (agentType === 'developer') {
    return <DeveloperAgentApp {...commonProps} />;
  }

  return <PersonalAgentApp {...commonProps} />;
}

