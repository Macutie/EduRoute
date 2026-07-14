import { API_BASE_URL } from '../config';
import { clearAuthPayloadPublicKeyCache, encryptSensitivePayload } from './authPayloadEncryption';
import { decryptSensitiveResponseJson, getSensitiveResponseHeaders } from './responseEncryption';

const getToken = () => localStorage.getItem('token');

const isPayloadDecryptError = (error) =>
  /encrypted (sensitive|multipart) payload could not be decrypted/i.test(String(error?.message || ''));

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
      ...(await getSensitiveResponseHeaders()),
    },
  });

  const data = await decryptSensitiveResponseJson(await response.json());

  if (!response.ok) {
    throw new Error(data.message || 'HRMU reports request failed');
  }

  return data.data;
};

export const getHrmuMonthlyReport = (params = {}) =>
  request('/api/hrmu/reports/monthly', params);

export const getHrmuMonthlyReportSummary = (params = {}) =>
  request('/api/hrmu/reports/monthly/summary', params);

export const getHrmuMonthlyReportLogs = (params = {}) =>
  request('/api/hrmu/reports/monthly/logs', params);

export const getHrmuMonthlyReportDetails = (locatorSlipId) =>
  request(`/api/hrmu/reports/monthly/${locatorSlipId}/details`);

export const getHrmuFlaggedTrips = () =>
  request('/api/hrmu/verification/flagged-trips');

export const getHrmuVerificationIncidentSummary = () =>
  request('/api/hrmu/verification/summary');

export const getHrmuVerificationTrips = () =>
  request('/api/hrmu/verification/trips');

export const reviewHrmuArrivalVerification = async (verificationId, payload) => {
  const token = getToken();
  const sendReview = async () => {
    const encryptedPayload = await encryptSensitivePayload(payload);
    return fetch(`${API_BASE_URL}/api/hrmu/verification/arrival/${verificationId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(await getSensitiveResponseHeaders()),
      },
      body: JSON.stringify(encryptedPayload),
    });
  };

  let response = await sendReview();
  let data = await decryptSensitiveResponseJson(await response.json());

  if (!response.ok && isPayloadDecryptError(new Error(data.message))) {
    clearAuthPayloadPublicKeyCache();
    response = await sendReview();
    data = await decryptSensitiveResponseJson(await response.json());
  }

  if (!response.ok) {
    throw new Error(data.message || 'HRMU verification review failed');
  }

  return data.data;
};

export const flagHrmuTripWithoutProof = async (tripId, locatorSlipId = null) => {
  const token = getToken();
  const sendFlag = async () => {
    const encryptedPayload = await encryptSensitivePayload({ locatorSlipId });
    return fetch(`${API_BASE_URL}/api/hrmu/verification/trips/${tripId}/flag-unverified`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(await getSensitiveResponseHeaders()),
      },
      body: JSON.stringify(encryptedPayload),
    });
  };

  let response = await sendFlag();
  let data = await decryptSensitiveResponseJson(await response.json());

  if (!response.ok && isPayloadDecryptError(new Error(data.message))) {
    clearAuthPayloadPublicKeyCache();
    response = await sendFlag();
    data = await decryptSensitiveResponseJson(await response.json());
  }

  if (!response.ok) {
    throw new Error(data.message || 'HRMU trip flagging failed');
  }

  return data.data;
};

export const downloadHrmuMonthlyReportPdf = async ({ monthIndex, baseYear }) => {
  const searchParams = new URLSearchParams();
  if (monthIndex !== undefined && monthIndex !== null) searchParams.set('monthIndex', monthIndex);
  if (baseYear !== undefined && baseYear !== null) searchParams.set('baseYear', baseYear);

  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/api/hrmu/reports/monthly/download?${searchParams.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    let message = 'HRMU report download failed';
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
    filename: match?.[1] || 'eduroute-hrmu-report.pdf',
  };
};

export const downloadHrmuNotificationMonthlyLogPdf = async () => {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/api/hrmu/reports/monthly/log-download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    let message = 'HRMU monthly log report download failed';
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
    filename: match?.[1] || 'eduroute-hrmu-monthly-log-report.pdf',
  };
};
