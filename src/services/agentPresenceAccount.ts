import { apiFetch } from './api';

export interface MobileAgentSpendingLimits {
  singleTxLimit: number;
  dailyLimit: number;
  monthlyLimit: number;
  currency: string;
}

export interface MobileAgentAccount {
  id: string;
  name: string;
  description?: string;
  agentUniqueId: string;
  agentType: string;
  status: string;
  walletAddress?: string;
  preferredModel?: string;
  preferredProvider?: string;
  metadata?: any;
  permissions?: Record<string, any>;
  spendingLimits?: MobileAgentSpendingLimits;
  creditScore?: number;
  balance?: number;
  balanceCurrency?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateMobileAgentAccountDto {
  name: string;
  description?: string;
  agentType: string;
  spendingLimits: MobileAgentSpendingLimits;
}

export interface UpdateMobileAgentAccountDto {
  name?: string;
  description?: string;
  preferredModel?: string;
  preferredProvider?: string;
  permissions?: Record<string, any>;
  metadata?: Record<string, any>;
  spendingLimits?: MobileAgentSpendingLimits;
  walletAddress?: string;
}

interface AgentPresenceAgent {
  id: string;
  name: string;
  description?: string;
  slug?: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  defaultModel?: string;
  settings?: Record<string, any>;
  metadata?: {
    permissions?: Record<string, any>;
    voice_id?: string;
    accountCompatibility?: {
      agentType?: string;
      spendingLimits?: Partial<MobileAgentSpendingLimits>;
      linkedWalletAddress?: string;
      creditScore?: number;
      balance?: number;
      balanceCurrency?: string;
      statusReason?: string;
    };
    [key: string]: any;
  };
  createdAt: string;
  updatedAt?: string;
}

const DEFAULT_LIMITS: MobileAgentSpendingLimits = {
  singleTxLimit: 100,
  dailyLimit: 500,
  monthlyLimit: 2000,
  currency: 'USD',
};

const extractData = <T>(response: any): T => {
  if (response?.data !== undefined) {
    return response.data as T;
  }
  return response as T;
};

const mapStatusToLegacy = (status: AgentPresenceAgent['status']): string => {
  switch (status) {
    case 'paused':
      return 'suspended';
    case 'archived':
      return 'terminated';
    default:
      return status;
  }
};

const mapStatusToPresence = (status: string): AgentPresenceAgent['status'] => {
  switch (status) {
    case 'suspended':
      return 'paused';
    case 'terminated':
    case 'revoked':
      return 'archived';
    default:
      return status as AgentPresenceAgent['status'];
  }
};

const normalizeLimits = (limits?: Partial<MobileAgentSpendingLimits>): MobileAgentSpendingLimits => ({
  singleTxLimit: limits?.singleTxLimit ?? DEFAULT_LIMITS.singleTxLimit,
  dailyLimit: limits?.dailyLimit ?? DEFAULT_LIMITS.dailyLimit,
  monthlyLimit: limits?.monthlyLimit ?? DEFAULT_LIMITS.monthlyLimit,
  currency: limits?.currency ?? DEFAULT_LIMITS.currency,
});

const mapAgent = (agent: AgentPresenceAgent): MobileAgentAccount => {
  const compatibility = agent.metadata?.accountCompatibility ?? {};
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    agentUniqueId: agent.slug || `presence-${agent.id.slice(0, 8)}`,
    agentType: compatibility.agentType ?? 'personal',
    status: mapStatusToLegacy(agent.status),
    walletAddress: compatibility.linkedWalletAddress,
    preferredModel: agent.defaultModel,
    preferredProvider: agent.settings?.preferredProvider,
    metadata: agent.metadata,
    permissions: agent.metadata?.permissions,
    spendingLimits: normalizeLimits(compatibility.spendingLimits),
    creditScore: compatibility.creditScore ?? 720,
    balance: compatibility.balance ?? 0,
    balanceCurrency: compatibility.balanceCurrency ?? 'USD',
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
};

export async function fetchAgentPresenceAccounts(): Promise<MobileAgentAccount[]> {
  const res = await apiFetch<{ success: boolean; data: AgentPresenceAgent[] }>('/agent-presence/agents');
  return (extractData<AgentPresenceAgent[]>(res) ?? []).map(mapAgent);
}

export async function getAgentPresenceAccount(id: string): Promise<MobileAgentAccount> {
  const res = await apiFetch<{ success: boolean; data: AgentPresenceAgent }>(`/agent-presence/agents/${id}`);
  return mapAgent(extractData<AgentPresenceAgent>(res));
}

export async function createAgentPresenceAccount(dto: CreateMobileAgentAccountDto): Promise<MobileAgentAccount> {
  const res = await apiFetch<{ success: boolean; data: AgentPresenceAgent }>('/agent-presence/agents', {
    method: 'POST',
    body: JSON.stringify({
      name: dto.name,
      description: dto.description,
      metadata: {
        accountCompatibility: {
          agentType: dto.agentType,
          spendingLimits: normalizeLimits(dto.spendingLimits),
          balance: 0,
          balanceCurrency: 'USD',
        },
      },
    }),
  });
  return mapAgent(extractData<AgentPresenceAgent>(res));
}

export async function updateAgentPresenceAccount(
  id: string,
  dto: UpdateMobileAgentAccountDto,
): Promise<MobileAgentAccount> {
  const res = await apiFetch<{ success: boolean; data: AgentPresenceAgent }>(`/agent-presence/agents/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: dto.name,
      description: dto.description,
      defaultModel: dto.preferredModel,
      settings: dto.preferredProvider ? { preferredProvider: dto.preferredProvider } : undefined,
      metadata: {
        ...(dto.metadata ?? {}),
        ...(dto.permissions ? { permissions: dto.permissions } : {}),
        accountCompatibility: {
          ...(dto.spendingLimits ? { spendingLimits: normalizeLimits(dto.spendingLimits) } : {}),
          ...(dto.walletAddress ? { linkedWalletAddress: dto.walletAddress } : {}),
        },
      },
    }),
  });
  return mapAgent(extractData<AgentPresenceAgent>(res));
}

export async function setAgentPresenceAccountStatus(
  id: string,
  status: string,
  reason?: string,
): Promise<MobileAgentAccount> {
  const res = await apiFetch<{ success: boolean; data: AgentPresenceAgent }>(`/agent-presence/agents/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      status: mapStatusToPresence(status),
      metadata: reason
        ? {
            accountCompatibility: {
              statusReason: reason,
            },
          }
        : undefined,
    }),
  });
  return mapAgent(extractData<AgentPresenceAgent>(res));
}