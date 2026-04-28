import { API_BASE_URL } from '../config';

const getToken = () => localStorage.getItem('token');

const request = async (endpoint, params = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value);
    }
  });

  const token = getToken();
  const queryString = searchParams.toString();
  const response = await fetch(`${API_BASE_URL}${endpoint}${queryString ? `?${queryString}` : ''}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'HRMU analytics request failed');
  }

  return data.data;
};

export const getHrmuAnalyticsOverview = (params = {}) =>
  request('/api/hrmu/analytics/overview', params);

export const getHrmuAnalyticsDailyMovement = (params = {}) =>
  request('/api/hrmu/analytics/daily-movement', params);

export const getHrmuAnalyticsApprovalRate = (params = {}) =>
  request('/api/hrmu/analytics/approval-rate', params);

export const getHrmuAnalyticsFrequentDestinations = (params = {}) =>
  request('/api/hrmu/analytics/frequent-destinations', params);

export const getHrmuAnalyticsMonthlySummary = (params = {}) =>
  request('/api/hrmu/analytics/monthly-summary', params);

export const exportHrmuAnalyticsCsvPlaceholder = (params = {}) =>
  request('/api/hrmu/analytics/export-csv', params);

export const exportHrmuAnalyticsPdfPlaceholder = (params = {}) =>
  request('/api/hrmu/analytics/export-pdf', params);
