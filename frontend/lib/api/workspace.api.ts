import { apiClient } from './client';

/**
 * Workspace 类型
 */
export enum WorkspaceType {
  PERSONAL = 'personal',
  TEAM = 'team',
  ENTERPRISE = 'enterprise',
}

/**
 * 成员角色
 */
export enum MemberRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

/**
 * Workspace 信息
 */
export interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  description?: string;
  type: WorkspaceType;
  ownerId: string;
  logoUrl?: string;
  settings?: Record<string, any>;
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Workspace 成员信息
 */
export interface WorkspaceMemberInfo {
  id: string;
  workspaceId: string;
  userId: string;
  role: MemberRole;
  joinedAt: string;
  user?: {
    id: string;
    nickname?: string;
    email?: string;
    avatarUrl?: string;
  };
}

/**
 * 创建 Workspace DTO
 */
export interface CreateWorkspaceDto {
  name: string;
  slug?: string;
  description?: string;
  type?: WorkspaceType;
  logoUrl?: string;
}

/**
 * 更新 Workspace DTO
 */
export interface UpdateWorkspaceDto {
  name?: string;
  description?: string;
  logoUrl?: string;
  settings?: Record<string, any>;
}

/**
 * 邀请成员 DTO
 */
export interface InviteMemberDto {
  email: string;
  role?: MemberRole;
}

export const workspaceApi = {
  /**
   * 创建 Workspace
   */
  create: async (dto: CreateWorkspaceDto): Promise<WorkspaceInfo> => {
    return apiClient.post<WorkspaceInfo>('/workspaces', dto);
  },

  /**
   * 获取我的 Workspace 列表
   */
  getMyWorkspaces: async (): Promise<WorkspaceInfo[]> => {
    return apiClient.get<WorkspaceInfo[]>('/workspaces/my');
  },

  /**
   * 获取 Workspace 详情
   */
  getById: async (id: string): Promise<WorkspaceInfo> => {
    return apiClient.get<WorkspaceInfo>(`/workspaces/${id}`);
  },

  /**
   * 通过 slug 获取 Workspace
   */
  getBySlug: async (slug: string): Promise<WorkspaceInfo> => {
    return apiClient.get<WorkspaceInfo>(`/workspaces/slug/${slug}`);
  },

  /**
   * 更新 Workspace
   */
  update: async (id: string, dto: UpdateWorkspaceDto): Promise<WorkspaceInfo> => {
    return apiClient.put<WorkspaceInfo>(`/workspaces/${id}`, dto);
  },

  /**
   * 删除 Workspace
   */
  delete: async (id: string): Promise<void> => {
    return apiClient.delete(`/workspaces/${id}`);
  },

  /**
   * 获取 Workspace 成员列表
   */
  getMembers: async (workspaceId: string): Promise<WorkspaceMemberInfo[]> => {
    return apiClient.get<WorkspaceMemberInfo[]>(`/workspaces/${workspaceId}/members`);
  },

  /**
   * 邀请成员
   */
  inviteMember: async (workspaceId: string, dto: InviteMemberDto): Promise<WorkspaceMemberInfo> => {
    return apiClient.post<WorkspaceMemberInfo>(`/workspaces/${workspaceId}/members/invite`, dto);
  },

  /**
   * 更新成员角色
   */
  updateMemberRole: async (
    workspaceId: string,
    memberId: string,
    role: MemberRole
  ): Promise<WorkspaceMemberInfo> => {
    return apiClient.put<WorkspaceMemberInfo>(`/workspaces/${workspaceId}/members/${memberId}`, { role });
  },

  /**
   * 移除成员
   */
  removeMember: async (workspaceId: string, memberId: string): Promise<void> => {
    return apiClient.delete(`/workspaces/${workspaceId}/members/${memberId}`);
  },

  /**
   * 离开 Workspace
   */
  leave: async (workspaceId: string): Promise<void> => {
    return apiClient.post(`/workspaces/${workspaceId}/leave`, {});
  },

  /**
   * 转让所有权
   */
  transferOwnership: async (workspaceId: string, newOwnerId: string): Promise<WorkspaceInfo> => {
    return apiClient.post<WorkspaceInfo>(`/workspaces/${workspaceId}/transfer`, { newOwnerId });
  },
};
