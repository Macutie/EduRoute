import { API_BASE_URL } from '../config';
import { encryptSensitivePayload, withFreshAuthPayloadKeyRetry } from './authPayloadEncryption';
import { decryptSensitiveResponseJson, getSensitiveResponseHeaders } from './responseEncryption';

const getToken = () => localStorage.getItem('token');

export const deanApiRequest = async (endpoint, options = {}) => {
  const token = getToken();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const { headers: optionHeaders = {}, ...requestOptions } = options;
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...requestOptions,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(await getSensitiveResponseHeaders()),
      ...optionHeaders,
    },
  });

  const data = await decryptSensitiveResponseJson(await response.json());

  if (!response.ok) {
    throw new Error(data.message || 'Dean request failed');
  }

  return data.data;
};

export const getDeanSummary = () => deanApiRequest('/api/dean/dashboard/summary');
export const getDeanSignatureSettings = () => deanApiRequest('/api/dean/signature');

export const uploadDeanSignatureFile = async ({ file, consentAccepted }) => {
  const formData = new FormData();
  formData.append('signature_file', file);
  formData.append('consentAccepted', String(Boolean(consentAccepted)));

  return deanApiRequest('/api/dean/signature', {
    method: 'POST',
    body: formData,
  });
};

export const getDeanNotifications = ({ page = 1, limit = 10 } = {}) =>
  deanApiRequest(`/api/dean/notifications?page=${page}&limit=${limit}`);

export const markDeanNotificationRead = (notificationId) =>
  deanApiRequest(`/api/dean/notifications/${notificationId}/read`, {
    method: 'PATCH',
  });

export const getDeanProofComplianceList = () =>
  deanApiRequest('/api/dean/proof-of-compliance');

export const getDeanProofComplianceDetails = (proofId) =>
  deanApiRequest(`/api/dean/proof-of-compliance/${proofId}`);

export const getDeanProofComplianceByLocatorSlip = (locatorSlipId) =>
  deanApiRequest(`/api/dean/proof-of-compliance/locator-slip/${locatorSlipId}`);

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

export const getDeanPendingRequestsPage = ({ search = '', priority = 'all' } = {}) => {
  const params = new URLSearchParams({ search, priority });
  return deanApiRequest(`/api/dean/requests/pending?${params.toString()}`);
};

export const getDeanRequestInsights = (locatorSlipId) =>
  deanApiRequest(`/api/dean/requests/${locatorSlipId}/insights`);

export const bulkApproveDeanLocatorSlips = async (locatorSlipIds) =>
  withFreshAuthPayloadKeyRetry(async () => deanApiRequest('/api/dean/requests/bulk-approve', {
    method: 'POST',
    body: JSON.stringify(await encryptSensitivePayload({ locatorSlipIds })),
  }));

export const getDeanRegistryPage = () =>
  deanApiRequest('/api/dean/registry');

export const approveDeanLocatorSlipRequest = (locatorSlipId) =>
  deanApiRequest(`/api/dean/requests/${locatorSlipId}/approve`, {
    method: 'PATCH',
  });

export const rejectDeanLocatorSlipRequest = async (locatorSlipId, remarks = '') =>
  withFreshAuthPayloadKeyRetry(async () => deanApiRequest(`/api/dean/requests/${locatorSlipId}/reject`, {
    method: 'PATCH',
    body: JSON.stringify(await encryptSensitivePayload({ remarks })),
  }));
