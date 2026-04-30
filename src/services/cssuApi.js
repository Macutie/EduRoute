import { API_BASE_URL } from '../config';

const getToken = () => localStorage.getItem('token');

const request = async (endpoint, params = null) => {
  const token = getToken();
  const queryString = params ? new URLSearchParams(params).toString() : '';
  const response = await fetch(`${API_BASE_URL}${endpoint}${queryString ? `?${queryString}` : ''}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data.data;
};

export const getCssuDashboardSummary = () => request('/api/cssu/dashboard/summary');

export const getCssuLiveExitMonitoring = (params = {}) => request('/api/cssu/dashboard/live-exits', params);

export const lookupCssuExitCandidate = (params = {}) => request('/api/cssu/exit-clearance/lookup', params);

export const updateCssuExitStatus = async (locatorSlipId, payload = {}) => {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/api/cssu/dashboard/locator-slips/${locatorSlipId}/exit-status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data.data;
};
