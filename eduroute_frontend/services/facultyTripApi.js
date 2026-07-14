import { API_BASE_URL } from '../config';
import { encryptSensitivePayload } from './authPayloadEncryption';

const authHeaders = (includeJson = true) => ({
  ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
  Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
});

const parseResponse = async (response, fallbackMessage) => {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || fallbackMessage);
  }

  return data.data;
};

export const getApprovedFacultyLocatorSlips = async () => {
  const response = await fetch(`${API_BASE_URL}/api/faculty/locator-slips/approved`, {
    headers: authHeaders(false),
  });

  return parseResponse(response, 'Failed to load approved locator slips.');
};

export const getFacultyLocatorSlipDetails = async (locatorSlipId) => {
  const response = await fetch(`${API_BASE_URL}/api/faculty/locator-slips/${locatorSlipId}`, {
    headers: authHeaders(false),
  });

  return parseResponse(response, 'Failed to load locator slip details.');
};

export const resolveFacultyLocatorSlipDestination = async (locatorSlipId, destinationText) => {
  const encryptedPayload = await encryptSensitivePayload({ destinationText });
  const response = await fetch(`${API_BASE_URL}/api/faculty/locator-slips/${locatorSlipId}/resolve-destination`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(encryptedPayload),
  });

  return parseResponse(response, 'Failed to resolve the destination.');
};

export const saveFacultyManualPin = async (locatorSlipId, payload) => {
  const encryptedPayload = await encryptSensitivePayload(payload);
  const response = await fetch(`${API_BASE_URL}/api/faculty/locator-slips/${locatorSlipId}/manual-pin`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(encryptedPayload),
  });

  return parseResponse(response, 'Failed to save the pinned destination.');
};

export const startFacultyTrip = async (payload) => {
  const encryptedPayload = await encryptSensitivePayload(payload);
  const response = await fetch(`${API_BASE_URL}/api/faculty/trips/start`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(encryptedPayload),
  });

  return parseResponse(response, 'Failed to start the trip.');
};

export const markFacultyTripArrived = async (tripId) => {
  const response = await fetch(`${API_BASE_URL}/api/faculty/trips/${tripId}/arrived`, {
    method: 'POST',
    headers: authHeaders(),
  });

  return parseResponse(response, 'Failed to mark the trip as arrived.');
};

export const verifyFacultyTripArrival = async (tripId, file, locatorSlipId) => {
  const formData = new FormData();
  formData.append('verification_photo', file);
  const encryptedPayload = await encryptSensitivePayload({ locatorSlipId: locatorSlipId || null });
  formData.append('encryptedPayload', JSON.stringify(encryptedPayload.encryptedPayload));

  const response = await fetch(`${API_BASE_URL}/api/faculty/trips/${tripId}/verify-arrival`, {
    method: 'POST',
    headers: authHeaders(false),
    body: formData,
  });

  return parseResponse(response, 'Failed to upload the arrival verification image.');
};

export const startFacultyTripReturn = async (tripId) => {
  const response = await fetch(`${API_BASE_URL}/api/faculty/trips/${tripId}/start-return`, {
    method: 'POST',
    headers: authHeaders(),
  });

  return parseResponse(response, 'Failed to start the return route.');
};

export const markFacultyTripReturned = async (tripId, payload = {}) => {
  const encryptedPayload = await encryptSensitivePayload(payload);
  const response = await fetch(`${API_BASE_URL}/api/faculty/trips/${tripId}/returned`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(encryptedPayload),
  });

  return parseResponse(response, 'Failed to complete the trip.');
};

export const getFacultyTripSummary = async (tripId) => {
  const response = await fetch(`${API_BASE_URL}/api/faculty/trips/${tripId}/summary`, {
    headers: authHeaders(false),
  });

  return parseResponse(response, 'Failed to load the trip summary.');
};
