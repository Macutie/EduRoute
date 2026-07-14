import { API_BASE_URL } from '../config';
import { encryptSensitivePayload } from './authPayloadEncryption';
import { decryptSensitiveResponseJson, getSensitiveResponseHeaders } from './responseEncryption';

const getToken = () => localStorage.getItem('token');

const request = async (endpoint, options = {}) => {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(await getSensitiveResponseHeaders()),
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await decryptSensitiveResponseJson(await response.json());

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

export const getPushNotificationStatus = () => request('/api/notifications/push-status');

export const sendPushTestNotification = () =>
  request('/api/notifications/push-test', { method: 'POST' });

export const markNotificationRead = (notificationId) =>
  request(`/api/notifications/${notificationId}/read`, { method: 'PATCH' });

export const markAllNotificationsRead = () =>
  request('/api/notifications/read-all', { method: 'PATCH' });

export const savePushToken = async (payload) =>
  request('/api/notifications/push-token', {
    method: 'POST',
    body: JSON.stringify(await encryptSensitivePayload(payload)),
  });

export const disablePushToken = async (fcmToken) =>
  request('/api/notifications/push-token/disable', {
    method: 'PATCH',
    body: JSON.stringify(await encryptSensitivePayload({ fcmToken })),
  });

export const deletePushToken = async (fcmToken) =>
  request('/api/notifications/push-token', {
    method: 'DELETE',
    body: JSON.stringify(await encryptSensitivePayload({ fcmToken })),
  });
