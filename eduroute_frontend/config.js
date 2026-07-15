const PRODUCTION_API_URL = 'https://eduroute-production.up.railway.app';
const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';

const normalizeApiBaseUrl = (value) => {
  const trimmedValue = String(value || '').trim();

  if (!trimmedValue) {
    return '';
  }

  if (!/^https?:\/\//i.test(trimmedValue)) {
    return '';
  }

  return trimmedValue.replace(/\/$/, '');
};

const getApiBaseUrl = () => {
  if (typeof window === 'undefined') {
    return configuredApiBaseUrl || PRODUCTION_API_URL;
  }

  const { protocol, hostname } = window.location;
  const isLocalHost = ['localhost', '127.0.0.1'].includes(hostname);
  const isLanHost = /^(192\.168|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
  const isNgrokHost = /\.ngrok(-free)?\.(app|dev)$/i.test(hostname);
  const isLocalDev = isLocalHost || isLanHost;
  const normalizedConfiguredApiBaseUrl = normalizeApiBaseUrl(configuredApiBaseUrl);

  if (isLocalDev) {
    return normalizedConfiguredApiBaseUrl || `${protocol}//${hostname}:5000`;
  }

  if (isNgrokHost) {
    return '';
  }

  if (normalizedConfiguredApiBaseUrl) {
    try {
      const configuredUrl = new URL(normalizedConfiguredApiBaseUrl);
      const apiIsConfiguredForLocalhost = ['localhost', '127.0.0.1'].includes(configuredUrl.hostname);

      if (apiIsConfiguredForLocalhost) {
        return PRODUCTION_API_URL;
      }

      return normalizedConfiguredApiBaseUrl;
    } catch (error) {
      return PRODUCTION_API_URL;
    }
  }

  return PRODUCTION_API_URL;
};

export const API_BASE_URL = getApiBaseUrl();
console.log('API_BASE_URL:', API_BASE_URL);

const getSocketTransports = () => {
  if (typeof window === 'undefined') {
    return ['websocket', 'polling'];
  }

  const apiUrl = API_BASE_URL || window.location.origin;

  try {
    new URL(apiUrl, window.location.origin);
    return ['websocket', 'polling'];
  } catch (error) {
    return ['websocket', 'polling'];
  }
};

export const SOCKET_TRANSPORTS = getSocketTransports();
const configuredMapboxToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || '';
export const MAPBOX_PUBLIC_TOKEN = configuredMapboxToken.startsWith('your_') ? '' : configuredMapboxToken;
