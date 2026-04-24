import { io } from 'socket.io-client';
import { API_BASE_URL } from '../config';

export const TRIP_SOCKET_EVENTS = {
  subscribe: 'trip:subscribe',
  unsubscribe: 'trip:unsubscribe',
  updateLocation: 'trip:location:update',
  locationBroadcast: 'trip:location:broadcast',
  error: 'trip:error',
};

export const createTripSocketClient = ({ token }) =>
  io(API_BASE_URL || window.location.origin, {
    transports: ['websocket', 'polling'],
    autoConnect: false,
    auth: {
      token,
    },
  });
