const PRODUCTION_API_URL = 'https://eduroute-production.up.railway.app';
const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';

const getApiBaseUrl = () => {
  if (typeof window === 'undefined') {
    return configuredApiBaseUrl || PRODUCTION_API_URL;
  }

  const { protocol, hostname } = window.location;
  const isLocalHost = ['localhost', '127.0.0.1'].includes(hostname);
  const isLanHost = /^(192\.168|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
  const isNgrokHost = /\.ngrok(-free)?\.(app|dev)$/i.test(hostname);
  const isLocalDev = isLocalHost || isLanHost;

  if (isLocalDev) {
    return configuredApiBaseUrl || `${protocol}//${hostname}:5000`;
  }

  if (isNgrokHost) {
    return '';
  }

  if (configuredApiBaseUrl) {
    try {
      const configuredUrl = new URL(configuredApiBaseUrl);
      const apiIsConfiguredForLocalhost = ['localhost', '127.0.0.1'].includes(configuredUrl.hostname);

      if (apiIsConfiguredForLocalhost) {
        return PRODUCTION_API_URL;
      }

      return configuredApiBaseUrl.replace(/\/$/, '');
    } catch (error) {
      return PRODUCTION_API_URL;
    }
  }

  return PRODUCTION_API_URL;
};

export const API_BASE_URL = getApiBaseUrl();
console.log('API_BASE_URL:', API_BASE_URL);
const configuredMapboxToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || '';
export const MAPBOX_PUBLIC_TOKEN = configuredMapboxToken.startsWith('your_') ? '' : configuredMapboxToken;
