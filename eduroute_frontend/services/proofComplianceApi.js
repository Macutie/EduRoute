import { API_BASE_URL } from '../config';

const getToken = () => localStorage.getItem('token') || '';

const parseResponse = async (response, fallbackMessage) => {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || fallbackMessage);
  }

  return data.data;
};

export const getFacultyProofOfCompliance = async (tripId) => {
  const response = await fetch(`${API_BASE_URL}/api/faculty/trips/${tripId}/proof-of-compliance`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  });

  return parseResponse(response, 'Failed to load proof of compliance.');
};

export const submitFacultyProofOfCompliance = async (tripId, payload) => {
  const formData = new FormData();
  formData.append('focalPersonName', payload.focalPersonName);
  formData.append('focalPersonPosition', payload.focalPersonPosition);
  formData.append('signatureDataUrl', payload.signatureDataUrl);

  if (payload.arrivalPhotoFile) {
    formData.append('arrival_photo', payload.arrivalPhotoFile);
  }

  const response = await fetch(`${API_BASE_URL}/api/faculty/trips/${tripId}/proof-of-compliance`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
    body: formData,
  });

  return parseResponse(response, 'Failed to submit proof of compliance.');
};

export const getHrmuProofComplianceList = async () => {
  const response = await fetch(`${API_BASE_URL}/api/hrmu/proof-of-compliance`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  });

  return parseResponse(response, 'Failed to load proof of compliance list.');
};

export const getHrmuProofComplianceDetails = async (proofId) => {
  const response = await fetch(`${API_BASE_URL}/api/hrmu/proof-of-compliance/${proofId}`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  });

  return parseResponse(response, 'Failed to load proof of compliance details.');
};

export const reviewHrmuProofCompliance = async (proofId, payload) => {
  const response = await fetch(`${API_BASE_URL}/api/hrmu/proof-of-compliance/${proofId}/review`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response, 'Failed to save proof of compliance review.');
};
