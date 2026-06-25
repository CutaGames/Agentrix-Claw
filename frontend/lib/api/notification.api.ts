import { apiClient } from './client';

export type NotificationType = 'payment' | 'system' | 'security' | 'promotion';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
}

export interface CreateNotificationDto {
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
}

export const notificationApi = {
  /**
   * 获取通知列表
   */
  getNotifications: async (params?: {
    read?: boolean;
    type?: string;
    limit?: number;
  }): Promise<Notification[]> => {
    const queryParams = new URLSearchParams();
    if (params?.read !== undefined) {
      queryParams.append('read', params.read.toString());
    }
    if (params?.type) {
      queryParams.append('type', params.type);
    }
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }

    const query = queryParams.toString();
    return apiClient.get<Notification[]>(`/notifications${query ? `?${query}` : ''}`);
  },

  /**
   * 获取未读通知数量
   */
  getUnreadCount: async (): Promise<{ count: number }> => {
    return apiClient.get<{ count: number }>('/notifications/unread-count');
  },

  /**
   * 创建通知
   */
  createNotification: async (dto: CreateNotificationDto): Promise<Notification> => {
    return apiClient.post<Notification>('/notifications', dto);
  },

  /**
   * 标记通知为已读
   */
  markAsRead: async (id: string): Promise<{ message: string }> => {
    return apiClient.put<{ message: string }>(`/notifications/${id}/read`);
  },

  /**
   * 标记所有通知为已读
   */
  markAllAsRead: async (): Promise<{ message: string }> => {
    return apiClient.put<{ message: string }>('/notifications/mark-all-read');
  },

  /**
   * 删除通知
   */
  deleteNotification: async (id: string): Promise<{ message: string }> => {
    return apiClient.delete<{ message: string }>(`/notifications/${id}`);
  },
};

