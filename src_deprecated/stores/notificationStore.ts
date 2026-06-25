/**
 * Notification store — tracks unread count, notification list, and push token.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AppNotification {
  id: string;
  type: 'agent_chat' | 'skill_install' | 'payment' | 'referral' | 'system';
  title: string;
  body: string;
  read: boolean;
  data?: Record<string, any>;
  createdAt: number;
}

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  pushToken: string | null;

  // Actions
  addNotification: (notification: Omit<AppNotification, 'id' | 'read' | 'createdAt'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearNotifications: () => void;
  setPushToken: (token: string | null) => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,
      pushToken: null,

      addNotification: (item) => {
        const notification: AppNotification = {
          ...item,
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          read: false,
          createdAt: Date.now(),
        };
        set((s) => ({
          notifications: [notification, ...s.notifications].slice(0, 100), // keep last 100
          unreadCount: s.unreadCount + 1,
        }));
      },

      markRead: (id) => {
        set((s) => {
          const updated = s.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n,
          );
          return {
            notifications: updated,
            unreadCount: updated.filter((n) => !n.read).length,
          };
        });
      },

      markAllRead: () => {
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        }));
      },

      clearNotifications: () => set({ notifications: [], unreadCount: 0 }),

      setPushToken: (token) => set({ pushToken: token }),
    }),
    {
      name: 'clawlink-notifications',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        notifications: s.notifications.slice(0, 50),
        pushToken: s.pushToken,
      }),
    },
  ),
);
