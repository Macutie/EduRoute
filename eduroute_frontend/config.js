const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

const getApiBaseUrl = () => {
  if (typeof window === 'undefined') {
    return configuredApiBaseUrl || 'http://localhost:5000';
  }

  const { protocol, hostname } = window.location;
  const isLocalHost = ['localhost', '127.0.0.1'].includes(hostname);
  const isLanHost = /^(192\.168|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
  const isNgrokHost = /\.ngrok(-free)?\.(app|dev)$/i.test(hostname);
  const isLocalDev = isLocalHost || isLanHost;

  if (!configuredApiBaseUrl) {
    if (isLocalDev) {
      return `${protocol}//${hostname}:5000`;
    }
    if (isNgrokHost) {
      return '';
    }
    return '';
  }

  try {
    const configuredUrl = new URL(configuredApiBaseUrl);
    const apiIsConfiguredForLocalhost = ['localhost', '127.0.0.1'].includes(configuredUrl.hostname);

    if (isNgrokHost && apiIsConfiguredForLocalhost) {
      return '';
    }

    if (isLanHost && apiIsConfiguredForLocalhost) {
      configuredUrl.hostname = hostname;
      return configuredUrl.toString().replace(/\/$/, '');
    }

    return configuredApiBaseUrl.replace(/\/$/, '');
  } catch (error) {
    if (isLocalDev) {
      return `${protocol}//${hostname}:5000`;
    }
    return '';
  }
};

export const API_BASE_URL = getApiBaseUrl();
const configuredMapboxToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || '';
export const MAPBOX_PUBLIC_TOKEN = configuredMapboxToken.startsWith('your_') ? '' : configuredMapboxToken;
