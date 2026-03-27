import { create } from "zustand";

export type NotificationType = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  timestamp: number;
  read: boolean;
}

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  add: (type: NotificationType, title: string, message?: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useNotifications = create<NotificationStore>((set) => ({
  notifications: [],
  unreadCount: 0,
  add: (type, title, message) => {
    const n: Notification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      title,
      message,
      timestamp: Date.now(),
      read: false,
    };
    set((s) => ({
      notifications: [n, ...s.notifications].slice(0, 50),
      unreadCount: s.unreadCount + 1,
    }));
  },
  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),
  dismiss: (id) =>
    set((s) => {
      const n = s.notifications.find((x) => x.id === id);
      return {
        notifications: s.notifications.filter((x) => x.id !== id),
        unreadCount: n && !n.read ? s.unreadCount - 1 : s.unreadCount,
      };
    }),
  clear: () => set({ notifications: [], unreadCount: 0 }),
}));
