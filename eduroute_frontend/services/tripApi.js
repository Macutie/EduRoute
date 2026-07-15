import { API_BASE_URL } from '../config';
import { encryptSensitivePayload, withFreshAuthPayloadKeyRetry } from './authPayloadEncryption';

const authHeaders = (token, includeJson = true) => ({
  ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
  Authorization: `Bearer ${token}`,
});

const parseJson = async (response) => {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Trip request failed.');
  }

  return data.data;
};

export const searchDestinationsApi = async ({ token, query, signal }) => {
  const response = await fetch(`${API_BASE_URL}/api/search/destination?q=${encodeURIComponent(query)}`, {
    headers: authHeaders(token, false),
    signal,
  });

  return parseJson(response);
};

export const previewRouteApi = async ({ token, origin, destination, profile = 'mapbox/driving' }) => {
  return withFreshAuthPayloadKeyRetry(async () => {
    const encryptedPayload = await encryptSensitivePayload({ origin, destination, profile });
    const response = await fetch(`${API_BASE_URL}/api/trips/route`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(encryptedPayload),
    });

    return parseJson(response);
  });
};

export const startTripApi = async ({ token, origin, destination, profile = 'mapbox/driving' }) => {
  return withFreshAuthPayloadKeyRetry(async () => {
    const encryptedPayload = await encryptSensitivePayload({ origin, destination, profile });
    const response = await fetch(`${API_BASE_URL}/api/trips/start`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(encryptedPayload),
    });

    return parseJson(response);
  });
};

export const getActiveTripApi = async ({ token }) => {
  const response = await fetch(`${API_BASE_URL}/api/trips/active`, {
    headers: authHeaders(token, false),
  });

  return parseJson(response);
};

export const endTripApi = async ({ token, tripId, status = 'completed' }) => {
  return withFreshAuthPayloadKeyRetry(async () => {
    const encryptedPayload = await encryptSensitivePayload({ status });
    const response = await fetch(`${API_BASE_URL}/api/trips/${tripId}/end`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(encryptedPayload),
    });

    return parseJson(response);
  });
};
