import { useCallback, useEffect, useState } from 'react';
import {
  getNotifications,
  getNotificationUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationApi';
import { useNotificationSocket } from './useNotificationSocket';

export const useNotifications = ({ page = 1, limit = 20, unreadOnly = false } = {}) => {
  const [notifications, setNotifications] = useState([]);
  const [pagination, setPagination] = useState({ page, limit, total: 0 });
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getNotifications({ page, limit, unreadOnly });
      setNotifications(data.notifications || []);
      setPagination(data.pagination || { page, limit, total: 0 });
      setUnreadCount(Number(data.unreadCount || 0));
    } catch (requestError) {
      setError(requestError.message || 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, unreadOnly]);

  useEffect(() => {
    reload();
  }, [reload]);

  useNotificationSocket({
    onNotification: (payload) => {
      setNotifications((current) => [payload, ...current].slice(0, Math.max(limit, 20)));
    },
    onUnreadCount: (nextUnreadCount) => {
      setUnreadCount(Number(nextUnreadCount || 0));
    },
  });

  const refreshUnreadCount = useCallback(async () => {
    const data = await getNotificationUnreadCount();
    setUnreadCount(Number(data.unreadCount || 0));
  }, []);

  const markRead = useCallback(async (notificationId) => {
    await markNotificationRead(notificationId);
    setNotifications((current) =>
      current.map((notification) =>
        String(notification.id) === String(notificationId)
          ? { ...notification, isRead: true }
          : notification
      )
    );
    await refreshUnreadCount();
  }, [refreshUnreadCount]);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
    setUnreadCount(0);
  }, []);

  return {
    notifications,
    pagination,
    unreadCount,
    loading,
    error,
    reload,
    markRead,
    markAllRead,
  };
};
