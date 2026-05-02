const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

const getApiBaseUrl = () => {
  if (typeof window === 'undefined') {
    return configuredApiBaseUrl || 'http://localhost:5000';
  }

  const { protocol, hostname } = window.location;

  if (!configuredApiBaseUrl) {
    return `${protocol}//${hostname}:5000`;
  }

  try {
    const configuredUrl = new URL(configuredApiBaseUrl);
    const appIsRunningOnLanHost = !['localhost', '127.0.0.1'].includes(hostname);
    const apiIsConfiguredForLocalhost = ['localhost', '127.0.0.1'].includes(configuredUrl.hostname);
    const appIsRunningOnNgrok = /\.ngrok(-free)?\.(app|dev)$/i.test(hostname);

    if (appIsRunningOnNgrok && apiIsConfiguredForLocalhost) {
      return '';
    }

    if (appIsRunningOnLanHost && apiIsConfiguredForLocalhost) {
      configuredUrl.hostname = hostname;
      return configuredUrl.toString().replace(/\/$/, '');
    }

    return configuredApiBaseUrl.replace(/\/$/, '');
  } catch (error) {
    return `${protocol}//${hostname}:5000`;
  }
};

export const API_BASE_URL = getApiBaseUrl();
const configuredMapboxToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || '';
export const MAPBOX_PUBLIC_TOKEN = configuredMapboxToken.startsWith('your_') ? '' : configuredMapboxToken;
