import { apiClient } from './client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentPresence {
  id: string;
  name: string;
  personality?: string;
  delegationLevel: 'observer' | 'assistant' | 'representative' | 'autonomous';
  status: string;
  channelBindings?: ChannelBinding[];
  settings?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelBinding {
  platform: string;
  channelId: string;
  metadata?: Record<string, any>;
}

export interface ConversationEvent {
  id: string;
  userId: string;
  agentId: string;
  sessionId?: string;
  channel: string;
  channelMessageId?: string;
  direction: 'inbound' | 'outbound';
  role: 'user' | 'agent' | 'system';
  contentType: string;
  content: string;
  externalSenderId?: string;
  externalSenderName?: string;
  metadata?: Record<string, any>;
  deliveryStatus?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approvedAt?: string;
  createdAt: string;
}

export interface TimelineStats {
  totalEvents: number;
  channelBreakdown: Record<string, number>;
  lastEventAt: string | null;
}

export interface ChannelHealth {
  [platform: string]: {
    connected: boolean;
    details?: Record<string, any>;
  };
}

export interface AgentMemory {
  id: string;
  agentId: string;
  scope: string;
  key: string;
  value: any;
  createdAt: string;
}

export interface SharePolicy {
  id: string;
  sourceAgentId: string;
  targetAgentId: string;
  shareType: string;
  shareMode: string;
  createdAt: string;
}

export interface DeviceInfo {
  id: string;
  deviceId: string;
  deviceType: string;
  deviceName?: string;
  lastSeen: string;
  isOnline: boolean;
}

export interface UnifiedDevice extends DeviceInfo {
  platform?: string;
  appVersion?: string;
  source: 'agent-presence' | 'desktop-sync';
  capabilities?: string[];
  context?: Record<string, any>;
}

export interface DeviceStats {
  total: number;
  online: number;
  offline: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
}

export interface DashboardOverview {
  totalAgents: number;
  totalEvents: number;
  activeChannels: number;
  pendingApprovals: number;
  recentEvents: ConversationEvent[];
  channelVolume?: Record<string, number>;
}

// ── API ──────────────────────────────────────────────────────────────────────

export const agentPresenceApi = {
  // ── Agent CRUD ──

  createAgent: async (dto: {
    name: string;
    personality?: string;
    delegationLevel?: string;
  }): Promise<AgentPresence> => {
    const result = await apiClient.post<AgentPresence>('/agent-presence/agents', dto);
    if (!result) throw new Error('Failed to create agent');
    return result;
  },

  listAgents: async (): Promise<AgentPresence[]> => {
    const result = await apiClient.get<AgentPresence[]>('/agent-presence/agents');
    return result ?? [];
  },

  getAgent: async (agentId: string): Promise<AgentPresence> => {
    const result = await apiClient.get<AgentPresence>(`/agent-presence/agents/${agentId}`);
    if (!result) throw new Error('Agent not found');
    return result;
  },

  updateAgent: async (agentId: string, dto: Partial<AgentPresence>): Promise<AgentPresence> => {
    const result = await apiClient.put<AgentPresence>(`/agent-presence/agents/${agentId}`, dto);
    if (!result) throw new Error('Failed to update agent');
    return result;
  },

  archiveAgent: async (agentId: string): Promise<void> => {
    await apiClient.delete(`/agent-presence/agents/${agentId}`);
  },

  // ── Channel Binding ──

  bindChannel: async (agentId: string, dto: { platform: string; channelId: string }): Promise<AgentPresence> => {
    const result = await apiClient.post<AgentPresence>(`/agent-presence/agents/${agentId}/channels`, dto);
    if (!result) throw new Error('Failed to bind channel');
    return result;
  },

  unbindChannel: async (agentId: string, platform: string): Promise<void> => {
    await apiClient.delete(`/agent-presence/agents/${agentId}/channels/${platform}`);
  },

  // ── Timeline ──

  getTimeline: async (agentId: string, query?: {
    channel?: string;
    limit?: number;
    before?: string;
  }): Promise<ConversationEvent[]> => {
    const params = new URLSearchParams();
    if (query?.channel) params.append('channel', query.channel);
    if (query?.limit) params.append('limit', query.limit.toString());
    if (query?.before) params.append('before', query.before);
    const qs = params.toString();
    const result = await apiClient.get<ConversationEvent[]>(
      `/agent-presence/agents/${agentId}/timeline${qs ? `?${qs}` : ''}`
    );
    return result ?? [];
  },

  getTimelineStats: async (agentId: string): Promise<TimelineStats> => {
    const result = await apiClient.get<TimelineStats>(`/agent-presence/agents/${agentId}/timeline/stats`);
    if (!result) throw new Error('Failed to get timeline stats');
    return result;
  },

  createEvent: async (agentId: string, dto: {
    channel: string;
    direction: 'inbound' | 'outbound';
    role: 'user' | 'agent' | 'system';
    content: string;
    contentType?: string;
    sessionId?: string;
    metadata?: Record<string, any>;
  }): Promise<ConversationEvent> => {
    const result = await apiClient.post<ConversationEvent>(
      `/agent-presence/agents/${agentId}/events`,
      { ...dto, agentId }
    );
    if (!result) throw new Error('Failed to create event');
    return result;
  },

  // ── Approvals ──

  approveReply: async (eventId: string, text: string): Promise<{ success: boolean; event?: ConversationEvent }> => {
    const result = await apiClient.post<{ success: boolean; event?: ConversationEvent }>(
      `/agent-presence/approvals/${eventId}/approve`,
      { text }
    );
    return result ?? { success: false };
  },

  rejectReply: async (eventId: string): Promise<{ success: boolean }> => {
    const result = await apiClient.post<{ success: boolean }>(
      `/agent-presence/approvals/${eventId}/reject`,
      {}
    );
    return result ?? { success: false };
  },

  // ── Channel Health ──

  getChannelHealth: async (): Promise<ChannelHealth> => {
    const result = await apiClient.get<ChannelHealth>('/agent-presence/channels/health');
    return result ?? {};
  },

  // ── Memories ──

  getAgentMemories: async (agentId: string, opts?: { scope?: string; limit?: number }): Promise<AgentMemory[]> => {
    const params = new URLSearchParams();
    if (opts?.scope) params.append('scope', opts.scope);
    if (opts?.limit) params.append('limit', opts.limit.toString());
    const qs = params.toString();
    const result = await apiClient.get<AgentMemory[]>(
      `/agent-presence/agents/${agentId}/memories${qs ? `?${qs}` : ''}`
    );
    return result ?? [];
  },

  // ── Share Policies ──

  getSharePolicies: async (agentId?: string): Promise<SharePolicy[]> => {
    const qs = agentId ? `?agentId=${agentId}` : '';
    const result = await apiClient.get<SharePolicy[]>(`/agent-presence/share-policies${qs}`);
    return result ?? [];
  },

  createSharePolicy: async (dto: {
    sourceAgentId: string;
    targetAgentId: string;
    shareType: string;
    shareMode: string;
  }): Promise<SharePolicy> => {
    const result = await apiClient.post<SharePolicy>('/agent-presence/share-policies', dto);
    if (!result) throw new Error('Failed to create share policy');
    return result;
  },

  deleteSharePolicy: async (policyId: string): Promise<void> => {
    await apiClient.delete(`/agent-presence/share-policies/${policyId}`);
  },

  // ── Devices ──

  getAllDevices: async (): Promise<DeviceInfo[]> => {
    const result = await apiClient.get<DeviceInfo[]>('/agent-presence/devices');
    return result ?? [];
  },

  getOnlineDevices: async (): Promise<DeviceInfo[]> => {
    const result = await apiClient.get<DeviceInfo[]>('/agent-presence/devices/online');
    return result ?? [];
  },

  // ── Unified Devices (cross-module) ──

  getUnifiedDevices: async (): Promise<UnifiedDevice[]> => {
    const result = await apiClient.get<UnifiedDevice[]>('/agent-presence/devices/unified');
    return result ?? [];
  },

  getUnifiedOnlineDevices: async (): Promise<UnifiedDevice[]> => {
    const result = await apiClient.get<UnifiedDevice[]>('/agent-presence/devices/unified/online');
    return result ?? [];
  },

  getDeviceStats: async (): Promise<DeviceStats> => {
    const result = await apiClient.get<DeviceStats>('/agent-presence/devices/unified/stats');
    return result ?? { total: 0, online: 0, offline: 0, byType: {}, bySource: {} };
  },

  // ── Dashboard ──

  getDashboard: async (): Promise<DashboardOverview> => {
    const result = await apiClient.get<DashboardOverview>('/agent-presence/dashboard');
    if (!result) throw new Error('Failed to load dashboard');
    return result;
  },

  getChannelVolume: async (): Promise<Record<string, number>> => {
    const result = await apiClient.get<Record<string, number>>('/agent-presence/dashboard/channels');
    return result ?? {};
  },

  getResponseTime: async (agentId: string, days?: number): Promise<any> => {
    const qs = days ? `?days=${days}` : '';
    return apiClient.get(`/agent-presence/dashboard/agents/${agentId}/response-time${qs}`);
  },

  // ── Session Handoff ──

  initiateHandoff: async (dto: any): Promise<any> => {
    return apiClient.post('/agent-presence/handoffs', dto);
  },

  acceptHandoff: async (handoffId: string, deviceId: string): Promise<any> => {
    return apiClient.post(`/agent-presence/handoffs/${handoffId}/accept`, { deviceId });
  },

  // ── Scheduled Tasks ──

  getTasks: async (agentId?: string): Promise<any[]> => {
    const qs = agentId ? `?agentId=${agentId}` : '';
    const result = await apiClient.get<any[]>(`/agent-presence/tasks${qs}`);
    return result ?? [];
  },

  createTask: async (dto: any): Promise<any> => {
    return apiClient.post('/agent-presence/tasks', dto);
  },

  pauseTask: async (taskId: string): Promise<any> => {
    return apiClient.post(`/agent-presence/tasks/${taskId}/pause`, {});
  },

  resumeTask: async (taskId: string): Promise<any> => {
    return apiClient.post(`/agent-presence/tasks/${taskId}/resume`, {});
  },

  deleteTask: async (taskId: string): Promise<void> => {
    await apiClient.delete(`/agent-presence/tasks/${taskId}`);
  },
};
