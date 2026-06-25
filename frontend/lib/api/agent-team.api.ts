/**
 * Agent Team API — 团队模板与一键组队
 */
import { apiClient } from './client';

// ========== 类型 ==========

export interface AgentRoleDefinition {
  codename: string;
  name: string;
  description: string;
  avatarUrl?: string;
  preferredModel?: string;
  preferredProvider?: string;
  modelTier?: string;
  capabilities?: string[];
  approvalLevel?: 'auto' | 'timeout-auto' | 'manual';
  spendingLimits?: {
    singleTxLimit: number;
    dailyLimit: number;
    monthlyLimit: number;
    currency: string;
  };
  initialCreditScore?: number;
}

export interface TeamTemplate {
  id: string;
  slug: string;
  name: string;
  description?: string;
  iconUrl?: string;
  visibility: 'public' | 'private' | 'official';
  tags?: string[];
  roles: AgentRoleDefinition[];
  teamSize: number;
  usageCount: number;
  createdAt: string;
}

export interface ProvisionedAgent {
  codename: string;
  name: string;
  agentId: string;
  agentUniqueId: string;
  status: string;
}

export interface ProvisionedTeamResult {
  templateName: string;
  teamSize: number;
  agents: ProvisionedAgent[];
}

export interface MyTeam {
  templateSlug: string;
  templateName: string;
  agents: Array<{
    id: string;
    codename: string;
    name: string;
    agentUniqueId: string;
    status: string;
    creditScore: number;
    modelTier?: string;
  }>;
}

// ========== API ==========

export const agentTeamApi = {
  /** 获取所有可用模板 */
  listTemplates: async (): Promise<TeamTemplate[]> => {
    const res = await apiClient.get<{ success: boolean; data: TeamTemplate[] }>('/agent-teams/templates');
    return (res as any)?.data || [];
  },

  /** 获取模板详情 */
  getTemplate: async (slug: string): Promise<TeamTemplate | null> => {
    const res = await apiClient.get<{ success: boolean; data: TeamTemplate }>(`/agent-teams/templates/${slug}`);
    return (res as any)?.data || null;
  },

  /** 一键创建团队 */
  provisionTeam: async (
    templateId: string,
    teamNamePrefix?: string,
  ): Promise<ProvisionedTeamResult | null> => {
    const res = await apiClient.post<{ success: boolean; data: ProvisionedTeamResult }>(
      '/agent-teams/provision',
      { templateId, teamNamePrefix },
    );
    return (res as any)?.data || null;
  },

  /** 获取我的团队列表 */
  getMyTeams: async (): Promise<MyTeam[]> => {
    const res = await apiClient.get<{ success: boolean; data: MyTeam[] }>('/agent-teams/my-teams');
    return (res as any)?.data || [];
  },

  /** 解散团队 */
  disbandTeam: async (slug: string): Promise<{ disbanded: number }> => {
    const res = await apiClient.delete<{ success: boolean; data: { disbanded: number } }>(
      `/agent-teams/my-teams/${slug}`,
    );
    return (res as any)?.data || { disbanded: 0 };
  },
};
