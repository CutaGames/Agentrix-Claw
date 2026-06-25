/**
 * SaaS 部署 API
 * 用于 Agent 的一键部署到 Agentrix 云端
 */

export interface DeploymentRequest {
  agentId: string;
  deploymentType: 'saas' | 'docker';
  config?: {
    region?: string;
    autoScale?: boolean;
    resources?: {
      memory?: number;
      cpu?: number;
    };
  };
}

export interface DeploymentStatus {
  id: string;
  agentId: string;
  status: 'pending' | 'deploying' | 'active' | 'failed' | 'paused';
  url?: string;
  region?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

const apiClient = {
  get: async <T>(url: string): Promise<T> => {
    const response = await fetch(`/api${url}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }
    return response.json();
  },
  post: async <T>(url: string, data?: any): Promise<T> => {
    const response = await fetch(`/api${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }
    return response.json();
  },
  delete: async <T>(url: string): Promise<T> => {
    const response = await fetch(`/api${url}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }
    return response.json();
  },
};

export const saasDeploymentApi = {
  /**
   * 部署 Agent 到 SaaS 平台
   */
  deploy: async (request: DeploymentRequest): Promise<DeploymentStatus> => {
    return apiClient.post<DeploymentStatus>('/agent/deploy', request);
  },

  /**
   * 获取部署状态
   */
  getDeploymentStatus: async (deploymentId: string): Promise<DeploymentStatus> => {
    return apiClient.get<DeploymentStatus>(`/agent/deployments/${deploymentId}`);
  },

  /**
   * 获取 Agent 的所有部署
   */
  getAgentDeployments: async (agentId: string): Promise<DeploymentStatus[]> => {
    return apiClient.get<DeploymentStatus[]>(`/agent/${agentId}/deployments`);
  },

  /**
   * 暂停部署
   */
  pauseDeployment: async (deploymentId: string): Promise<DeploymentStatus> => {
    return apiClient.post<DeploymentStatus>(`/agent/deployments/${deploymentId}/pause`);
  },

  /**
   * 恢复部署
   */
  resumeDeployment: async (deploymentId: string): Promise<DeploymentStatus> => {
    return apiClient.post<DeploymentStatus>(`/agent/deployments/${deploymentId}/resume`);
  },

  /**
   * 删除部署
   */
  deleteDeployment: async (deploymentId: string): Promise<void> => {
    return apiClient.delete(`/agent/deployments/${deploymentId}`);
  },
};

