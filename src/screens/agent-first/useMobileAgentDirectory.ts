import React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SoulCoreRefV1 } from '../../../shared/types/soul-core';
import { useAuthStore } from '../../stores/authStore';
import { useMobileAgentSelectionStore } from '../../stores/mobileAgentSelectionStore';
import { buildMobileAgentDirectoryModel } from '../../services/mobileAgentEconomyModel';
import { createMobileV6QueryFacade } from '../../services/mobileV6Runtime';
import { isMobileV6FeatureEnabled } from '../../services/mobileV6FeatureFlags';
import type { MobileReadState } from '../../services/mobileReadState';

export function useMobileAgentDirectory(explicitAgentId?: string) {
  const user = useAuthStore((state) => state.user);
  const activeInstance = useAuthStore((state) => state.activeInstance);
  const setActiveInstance = useAuthStore((state) => state.setActiveInstance);
  const selectedAgentId = useMobileAgentSelectionStore((state) => state.selectedAgentId);
  const selectAgentInSession = useMobileAgentSelectionStore((state) => state.selectAgent);
  const enabled = isMobileV6FeatureEnabled('mobile.agent_first_ia');
  const facade = React.useMemo(() => createMobileV6QueryFacade(), []);

  const query = useQuery({
    queryKey: ['mobile-v7', 'soul-core-directory', user?.id ?? 'guest'],
    queryFn: () => facade.listSoulCoreRefs({ enabled }),
    enabled: !!user && enabled,
    retry: 0,
  });

  const state: MobileReadState<SoulCoreRefV1[]> = query.data ?? (
    !enabled
      ? { kind: 'unavailable', capability: 'soul_core.directory_v1', reason: 'feature_disabled' }
      : query.isLoading
        ? { kind: 'unknown', reason: 'loading' }
        : { kind: 'unavailable', capability: 'soul_core.directory_v1', reason: 'not_loaded' }
  );
  const refs = state.kind === 'ready' ? state.data : [];
  const model = React.useMemo(() => buildMobileAgentDirectoryModel({
    refs,
    instances: user?.openClawInstances,
    explicitAgentId,
    selectedAgentId,
    activeInstanceId: activeInstance?.id,
  }), [refs, user?.openClawInstances, explicitAgentId, selectedAgentId, activeInstance?.id]);

  const selectAgent = React.useCallback((agentId: string) => {
    const option = model.agents.find((agent) => agent.agentId === agentId);
    if (!option || !selectAgentInSession(agentId)) return false;
    if (option.instanceId) setActiveInstance(option.instanceId);
    return true;
  }, [model.agents, selectAgentInSession, setActiveInstance]);

  return {
    facade,
    model,
    state,
    loading: query.isLoading,
    refetch: query.refetch,
    selectAgent,
  };
}
