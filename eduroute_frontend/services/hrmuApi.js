import { API_BASE_URL } from '../config';
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
    throw new Error(data.message || 'HRMU request failed');
  }

  return data.data;
};

export const getHrmuDashboardSummary = () => request('/api/hrmu/dashboard/summary');

export const getHrmuLiveFaculty = () => request('/api/hrmu/live-faculty');

export const getHrmuLiveTracking = () => request('/api/hrmu/live-tracking');

export const getHrmuNotifications = (params = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value);
    }
  });

  const queryString = searchParams.toString();
  return request(`/api/hrmu/notifications${queryString ? `?${queryString}` : ''}`);
};

export const getHrmuReportInbox = (params = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value);
    }
  });

  const queryString = searchParams.toString();
  return request(`/api/hrmu/report-inbox${queryString ? `?${queryString}` : ''}`);
};

export const downloadHrmuReportInboxAttachment = async (inboxId) => {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/api/hrmu/report-inbox/${inboxId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    let message = 'HRMU inbox report download failed';
    try {
      const data = await response.json();
      message = data.message || message;
    } catch (error) {
      // Ignore non-JSON binary failure path.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/i);

  return {
    blob,
    filename: match?.[1] || 'hrmu-inbox-report.pdf',
  };
};

export const getHrmuRecentActivity = (params = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value);
    }
  });

  const queryString = searchParams.toString();
  return request(`/api/hrmu/recent-activity${queryString ? `?${queryString}` : ''}`);
};
