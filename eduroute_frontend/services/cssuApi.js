import { API_BASE_URL } from '../config';
import { encryptSensitivePayload, withFreshAuthPayloadKeyRetry } from './authPayloadEncryption';
import { decryptSensitiveResponseJson, getSensitiveResponseHeaders } from './responseEncryption';

const getToken = () => localStorage.getItem('token');

const request = async (endpoint, params = null) => {
  const token = getToken();
  const queryString = params ? new URLSearchParams(params).toString() : '';
  const response = await fetch(`${API_BASE_URL}${endpoint}${queryString ? `?${queryString}` : ''}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(await getSensitiveResponseHeaders()),
    },
  });

  const data = await decryptSensitiveResponseJson(await response.json());

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data.data;
};

export const getCssuDashboardSummary = () => request('/api/cssu/dashboard/summary');

export const getCssuLiveExitMonitoring = (params = {}) => request('/api/cssu/dashboard/live-exits', params);

export const getCssuActivityTimeline = (params = {}) => request('/api/cssu/dashboard/activity-timeline', params);

export const getCssuFacultyExitHistory = (facultyUserId, params = {}) =>
  request(`/api/cssu/dashboard/faculty/${facultyUserId}/exit-history`, params);

export const getCssuIncidentsOverview = () => request('/api/cssu/incidents/overview');
export const getCssuNotificationsOverview = (params = {}) => request('/api/cssu/notifications/overview', params);

export const getCssuReportsOverview = (params = {}) => request('/api/cssu/reports/overview', params);

export const downloadCssuReportsPdf = async (params = {}) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value);
    }
  });

  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/api/cssu/reports/download?${searchParams.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    let message = 'CSSU report download failed';
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
    filename: match?.[1] || 'eduroute-cssu-report.pdf',
  };
};

export const sendCssuReportToHrmu = async (payload = {}) => {
  return withFreshAuthPayloadKeyRetry(async () => {
    const token = getToken();
    const encryptedPayload = await encryptSensitivePayload(payload);
    const response = await fetch(`${API_BASE_URL}/api/cssu/reports/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(encryptedPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'CSSU report send failed');
    }

    return data.data;
  });
};

export const lookupCssuExitCandidate = (params = {}) => request('/api/cssu/exit-clearance/lookup', params);

export const updateCssuExitStatus = async (locatorSlipId, payload = {}) => {
  return withFreshAuthPayloadKeyRetry(async () => {
    const token = getToken();
    const encryptedPayload = await encryptSensitivePayload(payload);
    const response = await fetch(`${API_BASE_URL}/api/cssu/dashboard/locator-slips/${locatorSlipId}/exit-status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(encryptedPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Request failed');
    }

    return data.data;
  });
};
