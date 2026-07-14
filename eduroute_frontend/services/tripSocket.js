import { io } from 'socket.io-client';
import { API_BASE_URL, SOCKET_TRANSPORTS } from '../config';

export const TRIP_SOCKET_EVENTS = {
  subscribe: 'trip:subscribe',
  unsubscribe: 'trip:unsubscribe',
  updateLocation: 'trip:location:update',
  facultyLocationUpdate: 'faculty:location:update',
  locationBroadcast: 'trip:location:broadcast',
  error: 'trip:error',
};

export const HRMU_LIVE_SOCKET_EVENTS = {
  join: 'hrmu:live-tracking:join',
  facultyLocationUpdate: 'hrmu:faculty-location:update',
  facultyActivityUpdate: 'hrmu:faculty-activity:update',
};

export const createTripSocketClient = ({ token }) =>
  io(API_BASE_URL || window.location.origin, {
    transports: SOCKET_TRANSPORTS,
    autoConnect: false,
    auth: {
      token,
    },
  });
