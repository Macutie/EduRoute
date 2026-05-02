import { useState } from 'react';
import { getCurrentPositionAsync } from '../services/geolocation';

export const useCurrentLocation = ({ onLocationReceived } = {}) => {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const requestCurrentLocation = async () => {
    try {
      setLoading(true);
      setError('');
      const nextLocation = await getCurrentPositionAsync();
      setCurrentLocation(nextLocation);
      onLocationReceived?.(nextLocation);
      return nextLocation;
    } catch (locationError) {
      const denied = locationError.code === locationError.PERMISSION_DENIED;
      const message = denied
        ? 'Location permission was denied. Enable location access to continue.'
        : 'Unable to get your current location.';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  return {
    currentLocation,
    setCurrentLocation,
    requestCurrentLocation,
    loading,
    error,
  };
};
