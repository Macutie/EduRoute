import { useEffect, useRef, useState } from 'react';
import { clearPositionWatch, watchCurrentPosition } from '../services/geolocation';
import { createTripSocketClient, TRIP_SOCKET_EVENTS } from '../services/tripSocket';

export const useLiveTripTracking = ({
  token,
  activeTrip,
  onLiveLocationUpdate,
  throttleMs = 5000,
} = {}) => {
  const socketRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastSentAtRef = useRef(0);
  const [connected, setConnected] = useState(false);
  const [trackingError, setTrackingError] = useState('');

  useEffect(() => {
    if (!token) return undefined;

    const socket = createTripSocketClient({ token });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on(TRIP_SOCKET_EVENTS.error, (payload) => {
      setTrackingError(payload?.message || 'Live trip socket error.');
    });
    socket.on(TRIP_SOCKET_EVENTS.locationBroadcast, (payload) => {
      onLiveLocationUpdate?.(payload);
    });

    socket.connect();

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token, onLiveLocationUpdate]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !activeTrip?.id) return undefined;

    socket.emit(TRIP_SOCKET_EVENTS.subscribe, { tripId: activeTrip.id });

    return () => {
      socket.emit(TRIP_SOCKET_EVENTS.unsubscribe, { tripId: activeTrip.id });
    };
  }, [activeTrip?.id]);

  const sendLocationUpdate = (location) => {
    if (!socketRef.current || !activeTrip?.id) return Promise.resolve(null);

    const now = Date.now();
    if (now - lastSentAtRef.current < throttleMs) return Promise.resolve(null);
    lastSentAtRef.current = now;

    return new Promise((resolve, reject) => {
      socketRef.current.emit(
        TRIP_SOCKET_EVENTS.updateLocation,
        {
          tripId: activeTrip.id,
          userId: activeTrip.user_id,
          lng: location.lng,
          lat: location.lat,
          speed: location.speed,
          heading: location.heading,
          timestamp: new Date(location.timestamp || now).toISOString(),
        },
        (acknowledgement) => {
          if (!acknowledgement || acknowledgement.ok) {
            resolve(acknowledgement?.data || null);
            return;
          }

          const error = new Error(acknowledgement.message || 'Unable to send live trip update.');
          setTrackingError(error.message);
          reject(error);
        }
      );
    });
  };

  const startLiveTracking = () => {
    clearPositionWatch(watchIdRef.current);
    watchIdRef.current = watchCurrentPosition(
      (location) => sendLocationUpdate(location),
      (error) => {
        setTrackingError(error.message || 'Unable to watch live location.');
      }
    );
  };

  const stopLiveTracking = () => {
    clearPositionWatch(watchIdRef.current);
    watchIdRef.current = null;
  };

  useEffect(() => {
    if (!activeTrip?.id) {
      stopLiveTracking();
    }
  }, [activeTrip?.id]);

  useEffect(() => () => stopLiveTracking(), []);

  return {
    connected,
    trackingError,
    sendLocationUpdate,
    startLiveTracking,
    stopLiveTracking,
  };
};
