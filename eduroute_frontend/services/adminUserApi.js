import { API_BASE_URL } from '../config';

const request = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const validation = Array.isArray(data.errors) ? data.errors.map(item => item.message || item).join('\n') : '';
    throw new Error(validation || data.message || 'Admin account request failed.');
  }
  return data.data;
};

export const getAdminUsers = filters => {
  const params = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => { if (value) params.set(key, value); });
  return request(`/api/admin/users${params.toString() ? `?${params}` : ''}`);
};
export const getAdminDashboard = () => request('/api/admin/dashboard');
export const createAdminUser = payload => request('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) });
export const updateAdminUser = (id, payload) => request(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
export const updateAdminUserStatus = (id, status) => request(`/api/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
export const resetAdminUserPassword = (id, payload) => request(`/api/admin/users/${id}/password`, { method: 'PATCH', body: JSON.stringify(payload) });
