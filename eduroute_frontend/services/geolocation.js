export const getCurrentPositionAsync = (options = {}) =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lng: position.coords.longitude,
          lat: position.coords.latitude,
          speed: position.coords.speed,
          heading: position.coords.heading,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
      },
      (error) => reject(error),
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 15000,
        ...options,
      }
    );
  });

export const watchCurrentPosition = (onUpdate, onError, options = {}) => {
  if (!navigator.geolocation) {
    onError?.(new Error('Geolocation is not supported on this browser.'));
    return null;
  }

  return navigator.geolocation.watchPosition(
    (position) => {
      onUpdate?.({
        lng: position.coords.longitude,
        lat: position.coords.latitude,
        speed: position.coords.speed,
        heading: position.coords.heading,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      });
    },
    (error) => onError?.(error),
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000,
      ...options,
    }
  );
};

export const clearPositionWatch = (watchId) => {
  if (watchId !== null && watchId !== undefined && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
  }
};
