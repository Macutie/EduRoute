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

const postRequest = async (endpoint, params = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value);
    }
  });

  const token = getToken();
  const queryString = searchParams.toString();
  const response = await fetch(`${API_BASE_URL}${endpoint}${queryString ? `?${queryString}` : ''}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'HRMU smart analytics request failed');
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

export const getHrmuSmartAnalyticsSummary = (params = {}) =>
  request('/api/hrmu/analytics/summary', params);

export const getHrmuSmartAnalyticsRiskTrips = (params = {}) =>
  request('/api/hrmu/analytics/risk-trips', params);

export const getHrmuSmartAnalyticsIncidents = (params = {}) =>
  request('/api/hrmu/analytics/incidents', params);

export const getHrmuSmartAnalyticsCollegeSummary = (params = {}) =>
  request('/api/hrmu/analytics/college-summary', params);

export const generateHrmuSmartAnalytics = (params = {}) =>
  postRequest('/api/hrmu/analytics/generate', params);

export const exportHrmuAnalyticsCsvPlaceholder = (params = {}) =>
  request('/api/hrmu/analytics/export-csv', params);

export const downloadHrmuAnalyticsPdf = async (params = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value);
    }
  });

  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/api/hrmu/analytics/export-pdf?${searchParams.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    let message = 'HRMU analytics PDF export failed';
    try {
      const data = await response.json();
      message = data.message || message;
    } catch (error) {
      // ignore JSON parsing failure for binary responses
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/i);

  return {
    blob,
    filename: match?.[1] || 'eduroute-hrmu-analytics.pdf',
  };
};
