import { io } from 'socket.io-client';
import { API_BASE_URL, SOCKET_TRANSPORTS } from '../config';

let socketInstance = null;

export const getNotificationSocket = () => {
  if (socketInstance) {
    return socketInstance;
  }

  const token = localStorage.getItem('token');
  if (!token) {
    return null;
  }

  socketInstance = io(API_BASE_URL || window.location.origin, {
    auth: { token },
    transports: SOCKET_TRANSPORTS,
  });

  return socketInstance;
};

export const disconnectNotificationSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
};
