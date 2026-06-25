import { apiClient } from './client';

export interface SandboxExecuteRequest {
  code: string;
  language: 'typescript' | 'javascript' | 'python';
  apiKey?: string;
}

export interface SandboxExecuteResponse {
  success: boolean;
  output?: any;
  error?: string;
  executionTime?: number;
}

export const sandboxApi = {
  /**
   * 执行沙箱代码
   */
  execute: async (request: SandboxExecuteRequest): Promise<SandboxExecuteResponse> => {
    return apiClient.post<SandboxExecuteResponse>('/sandbox/execute', request);
  },
};

