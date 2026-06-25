import { apiClient } from './client';

export interface AgentTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  persona?: string;
  tags: string[];
  visibility: 'public' | 'private';
  isFeatured: boolean;
  usageCount: number;
  config?: Record<string, any>;
  prompts?: Record<string, any>;
  metadata?: {
    isPremium?: boolean;
    price?: number;
    [key: string]: any;
  };
}

export interface UserAgentInstance {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'paused';
  isPublished: boolean;
  slug?: string;
  settings?: Record<string, any>;
  templateId?: string;
}

export interface CreateAgentTemplatePayload {
  name: string;
  description?: string;
  category: string;
  persona?: string;
  tags?: string[];
  config?: Record<string, any>;
  prompts?: Record<string, any>;
  visibility?: 'public' | 'private';
  isFeatured?: boolean;
}

export interface InstantiateAgentPayload {
  name: string;
  description?: string;
  settings?: Record<string, any>;
  publish?: boolean;
}

export const agentTemplateApi = {
  getTemplates: async (params?: {
    search?: string;
    category?: string;
    tag?: string;
    visibility?: 'public' | 'private';
  }): Promise<AgentTemplate[] | null> => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.category) query.set('category', params.category);
    if (params?.tag) query.set('tag', params.tag);
    if (params?.visibility) query.set('visibility', params.visibility);

    const qs = query.toString();
    return apiClient.get<AgentTemplate[]>(`/agent/templates${qs ? `?${qs}` : ''}`);
  },

  getMyTemplates: async (): Promise<AgentTemplate[] | null> => {
    return apiClient.get<AgentTemplate[]>('/agent/templates/mine');
  },

  createTemplate: async (payload: CreateAgentTemplatePayload): Promise<AgentTemplate | null> => {
    return apiClient.post<AgentTemplate>('/agent/templates', payload);
  },

  updateTemplate: async (
    templateId: string,
    payload: Partial<CreateAgentTemplatePayload>,
  ): Promise<AgentTemplate | null> => {
    return apiClient.put<AgentTemplate>(`/agent/templates/${templateId}`, payload);
  },

  publishTemplate: async (templateId: string): Promise<AgentTemplate | null> => {
    return apiClient.post<AgentTemplate>(`/agent/templates/${templateId}/publish`);
  },

  instantiateTemplate: async (
    templateId: string,
    payload: InstantiateAgentPayload,
  ): Promise<UserAgentInstance | null> => {
    return apiClient.post<UserAgentInstance>(
      `/agent/templates/${templateId}/instantiate`,
      payload,
    );
  },

  getMyAgents: async (): Promise<UserAgentInstance[] | null> => {
    return apiClient.get<UserAgentInstance[]>('/agent/my-agents');
  },
};

