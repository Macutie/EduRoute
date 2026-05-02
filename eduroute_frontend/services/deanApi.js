import { API_BASE_URL } from '../config';

const getToken = () => localStorage.getItem('token');

export const deanApiRequest = async (endpoint, options = {}) => {
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
    throw new Error(data.message || 'Dean request failed');
  }

  return data.data;
};

export const getDeanSummary = () => deanApiRequest('/api/dean/dashboard/summary');

export const getDeanNotifications = ({ page = 1, limit = 10 } = {}) =>
  deanApiRequest(`/api/dean/notifications?page=${page}&limit=${limit}`);

export const markDeanNotificationRead = (notificationId) =>
  deanApiRequest(`/api/dean/notifications/${notificationId}/read`, {
    method: 'PATCH',
  });

export const getDeanPendingApprovals = ({ limit = 5 } = {}) =>
  deanApiRequest(`/api/dean/pending-approvals?limit=${limit}`);

export const getDeanLocatorSlips = ({ status = 'all', search = '', page = 1, limit = 20 } = {}) => {
  const params = new URLSearchParams({
    status,
    search,
    page: String(page),
    limit: String(limit),
  });

  return deanApiRequest(`/api/dean/locator-slips?${params.toString()}`);
};

export const getDeanFacultyOverview = ({ search = '' } = {}) => {
  const params = new URLSearchParams({ search });
  return deanApiRequest(`/api/dean/faculty?${params.toString()}`);
};

export const getDeanPendingRequestsPage = () =>
  deanApiRequest('/api/dean/requests/pending');

export const getDeanRegistryPage = () =>
  deanApiRequest('/api/dean/registry');

export const approveDeanLocatorSlipRequest = (locatorSlipId) =>
  deanApiRequest(`/api/dean/requests/${locatorSlipId}/approve`, {
    method: 'PATCH',
  });

export const rejectDeanLocatorSlipRequest = (locatorSlipId, remarks = '') =>
  deanApiRequest(`/api/dean/requests/${locatorSlipId}/reject`, {
    method: 'PATCH',
    body: JSON.stringify({ remarks }),
  });
