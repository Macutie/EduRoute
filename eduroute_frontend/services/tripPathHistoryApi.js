import { API_BASE_URL } from '../config';

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

export const getTripPathHistory = async (tripId) => {
  const response = await fetch(`${API_BASE_URL}/api/trips/${tripId}/path-history`, {
    headers: authHeaders(false),
  });

  return parseResponse(response, 'Failed to load trip path history.');
};

export const getHrmuTripPathHistory = async (tripId) => {
  const response = await fetch(`${API_BASE_URL}/api/hrmu/trips/${tripId}/path-history`, {
    headers: authHeaders(false),
  });

  return parseResponse(response, 'Failed to load HRMU trip path history.');
};
