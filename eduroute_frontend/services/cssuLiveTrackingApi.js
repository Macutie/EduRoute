import { API_BASE_URL } from '../config';
import { decryptSensitiveResponseJson, getSensitiveResponseHeaders } from './responseEncryption';

const getToken = () => localStorage.getItem('token');

const request = async (endpoint, options = {}) => {
  const token = getToken();
  const { headers: optionHeaders = {}, ...requestOptions } = options;
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...requestOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(await getSensitiveResponseHeaders()),
      ...optionHeaders,
    },
  });

  const data = await decryptSensitiveResponseJson(await response.json());

  if (!response.ok) {
    throw new Error(data.message || 'CSSU live tracking request failed');
  }

  return data.data;
};

const withQuery = (endpoint, params = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value);
    }
  });

  const queryString = searchParams.toString();
  return `${endpoint}${queryString ? `?${queryString}` : ''}`;
};

export const getCssuActiveFaculty = () =>
  request('/api/cssu/live-tracking/active-faculty');

export const getCssuFacultyLiveDetail = (facultyUserId) =>
  request(`/api/cssu/live-tracking/faculty/${facultyUserId}`);

export const getCssuFacultyActivity = (facultyUserId, params = {}) =>
  request(withQuery(`/api/cssu/live-tracking/faculty/${facultyUserId}/activity`, params));
