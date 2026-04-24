import { useEffect, useState } from 'react';
import { endTripApi, getActiveTripApi, previewRouteApi, startTripApi } from '../services/tripApi';

export const useTripRouting = ({
  token,
  onRouteReceived,
  onDestinationSelected,
  onTripStateChange,
} = {}) => {
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [routeResponse, setRouteResponse] = useState(null);
  const [activeTrip, setActiveTrip] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;

    const loadActiveTrip = async () => {
      try {
        const trip = await getActiveTripApi({ token });
        setActiveTrip(trip);
        onTripStateChange?.(trip);
        if (trip?.route_geometry) {
          const route = {
            geometry: trip.route_geometry,
            distance_meters: trip.route_distance_meters,
            duration_seconds: trip.route_duration_seconds,
            summary: '',
          };
          setRouteResponse(route);
          onRouteReceived?.(route);
        }
      } catch (fetchError) {
        setError(fetchError.message);
      }
    };

    loadActiveTrip();
  }, [token, onRouteReceived]);

  const selectDestination = (destination) => {
    setSelectedDestination(destination);
    onDestinationSelected?.(destination);
  };

  const previewRoute = async ({ origin, destination = selectedDestination, profile }) => {
    try {
      setLoading(true);
      setError('');
      const response = await previewRouteApi({
        token,
        origin,
        destination: {
          lng: destination.coordinates.lng,
          lat: destination.coordinates.lat,
          name: destination.full_address || destination.name,
        },
        profile,
      });
      setRouteResponse(response.route);
      onRouteReceived?.(response.route);
      return response.route;
    } catch (routeError) {
      setError(routeError.message);
      throw routeError;
    } finally {
      setLoading(false);
    }
  };

  const startTrip = async ({ origin, destination = selectedDestination, profile }) => {
    try {
      setLoading(true);
      setError('');
      const response = await startTripApi({
        token,
        origin,
        destination: {
          lng: destination.coordinates.lng,
          lat: destination.coordinates.lat,
          name: destination.full_address || destination.name,
        },
        profile,
      });
      setActiveTrip(response.trip);
      setRouteResponse(response.route);
      onRouteReceived?.(response.route);
      onTripStateChange?.(response.trip);
      return response;
    } catch (tripError) {
      setError(tripError.message);
      throw tripError;
    } finally {
      setLoading(false);
    }
  };

  const endTrip = async ({ status = 'completed' } = {}) => {
    if (!activeTrip) return null;

    try {
      setLoading(true);
      setError('');
      const response = await endTripApi({ token, tripId: activeTrip.id, status });
      setActiveTrip(null);
      setRouteResponse(null);
      onRouteReceived?.(null);
      onTripStateChange?.(response);
      return response;
    } catch (tripError) {
      setError(tripError.message);
      throw tripError;
    } finally {
      setLoading(false);
    }
  };

  return {
    selectedDestination,
    selectDestination,
    setSelectedDestination,
    routeResponse,
    setRouteResponse,
    activeTrip,
    setActiveTrip,
    loading,
    error,
    previewRoute,
    startTrip,
    endTrip,
  };
};
