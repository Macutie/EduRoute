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

export const exportHrmuRecentActivityCsvPlaceholder = () =>
  request('/api/hrmu/recent-activity/export-csv');
