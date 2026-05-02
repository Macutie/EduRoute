import { API_BASE_URL } from '../config';

const getToken = () => localStorage.getItem('token');

const request = async (endpoint, options = {}) => {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Notification request failed');
  }

  return data.data;
};

export const getNotifications = ({ page = 1, limit = 20, unreadOnly = false } = {}) => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (unreadOnly) params.set('unreadOnly', 'true');
  return request(`/api/notifications?${params.toString()}`);
};

export const getNotificationUnreadCount = () => request('/api/notifications/unread-count');

export const markNotificationRead = (notificationId) =>
  request(`/api/notifications/${notificationId}/read`, { method: 'PATCH' });

export const markAllNotificationsRead = () =>
  request('/api/notifications/read-all', { method: 'PATCH' });

export const savePushToken = (payload) =>
  request('/api/notifications/push-token', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const disablePushToken = (fcmToken) =>
  request('/api/notifications/push-token/disable', {
    method: 'PATCH',
    body: JSON.stringify({ fcmToken }),
  });

export const deletePushToken = (fcmToken) =>
  request('/api/notifications/push-token', {
    method: 'DELETE',
    body: JSON.stringify({ fcmToken }),
  });
