let mapboxTelemetryGuardInstalled = false;

const isMapboxTelemetryUrl = (input) => {
  const rawUrl = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input?.url;

  if (!rawUrl) return false;

  try {
    const url = new URL(rawUrl, window.location.origin);
    return url.hostname === 'events.mapbox.com' && url.pathname.startsWith('/events/');
  } catch {
    return false;
  }
};

export const installMapboxTelemetryGuard = () => {
  if (mapboxTelemetryGuardInstalled || typeof window === 'undefined') return;
  mapboxTelemetryGuardInstalled = true;

  const originalFetch = window.fetch?.bind(window);
  if (originalFetch) {
    window.fetch = (input, init) => {
      if (isMapboxTelemetryUrl(input)) {
        return Promise.resolve(new Response(null, { status: 204, statusText: 'No Content' }));
      }
      return originalFetch(input, init);
    };
  }

  if (navigator?.sendBeacon) {
    const originalSendBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      if (isMapboxTelemetryUrl(url)) return true;
      return originalSendBeacon(url, data);
    };
  }
};
