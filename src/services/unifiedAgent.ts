/**
 * Unified Agent Service — 统一 Agent API
 *
 * 替代 agentPresenceAccount.ts，使用 /agents/unified 端点。
 * 每个 Agent = OpenClawInstance + AgentAccount（1:1 绑定）。
 */
import { apiFetch } from './api';
// world-growth-mobile-experience · task 8.2 (R6.1/6.6) —— 会话式创作结果解析的**单一来源**。
// unifiedAgent 与 openclaw.service 两条传输共用同一 `extractConversationalCreate`，
// 使 AgentChatScreen 无论结果来自哪条 chat 路径都以一致字段与渲染呈现（AGENTS.md 硬规则 2）。
export {
  extractConversationalCreate,
  toolNameToConversationalCreateKind,
  type ParsedConversationalCreate,
} from '../../shared/types/conversational-create';

export interface UnifiedAgent {
  id: string;              // OpenClawInstance.id
  name: string;
  description?: string;
  personality?: string;
  status: string;
  instanceType: string;

  // 运行时
  instanceUrl?: string;
  isPrimary: boolean;
  defaultModel?: string;
  capabilities?: Record<string, any>;
  delegationLevel?: string;
  channelBindings?: any[];
  systemPrompt?: string;

  // 经济身份
  agentAccountId?: string;
  agentUniqueId?: string;
  walletAddress?: string;
  balance?: number;
  balanceCurrency?: string;
  creditScore?: number;
  spendingLimits?: {
    singleTxLimit: number;
    dailyLimit: number;
    monthlyLimit: number;
    currency: string;
  };
  agentType?: string;
  preferredProvider?: string;
  preferredModel?: string;
  metadata?: Record<string, any>;
  permissions?: Record<string, any>;

  // 团队
  teamTemplateSlug?: string;
  codename?: string;
  modelTier?: string;

  createdAt: string;
  updatedAt: string;
}

export interface CreateUnifiedAgentDto {
  name: string;
  description?: string;
  personality?: string;
  defaultModel?: string;
  spendingLimits?: {
    singleTxLimit: number;
    dailyLimit: number;
    monthlyLimit: number;
    currency: string;
  };
}

const extractData = <T>(response: any): T => {
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

export async function fetchUnifiedAgents(): Promise<UnifiedAgent[]> {
  const res = await apiFetch<{ success: boolean; data: UnifiedAgent[] }>('/agents/unified');
  return extractData<UnifiedAgent[]>(res) ?? [];
}

export async function getUnifiedAgent(id: string): Promise<UnifiedAgent> {
  const res = await apiFetch<{ success: boolean; data: UnifiedAgent }>(`/agents/unified/${id}`);
  return extractData<UnifiedAgent>(res);
}

export async function createUnifiedAgent(dto: CreateUnifiedAgentDto): Promise<UnifiedAgent> {
  const res = await apiFetch<{ success: boolean; data: UnifiedAgent }>('/agents/create', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
  return extractData<UnifiedAgent>(res);
}

/**
 * 绑定已有 OpenClaw 实例到团队角色
 */
export async function bindInstanceToTeamRole(
  teamSlug: string,
  codename: string,
  instanceId: string,
): Promise<{ agentId: string; instanceId: string }> {
  const res = await apiFetch<{ success: boolean; data: { agentId: string; instanceId: string } }>(
    `/agent-teams/my-teams/${teamSlug}/roles/${codename}/bind-instance`,
    {
      method: 'POST',
      body: JSON.stringify({ instanceId }),
    },
  );
  return extractData<{ agentId: string; instanceId: string }>(res);
}
