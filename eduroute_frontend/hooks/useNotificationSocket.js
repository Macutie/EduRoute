import { useEffect } from 'react';
import { getNotificationSocket, disconnectNotificationSocket } from '../lib/socket';

export const useNotificationSocket = ({ onNotification, onUnreadCount }) => {
  useEffect(() => {
    const socket = getNotificationSocket();
    if (!socket) return undefined;

    const handleNotification = (payload) => onNotification?.(payload);
    const handleUnreadCount = (payload) => onUnreadCount?.(payload?.unreadCount || 0);

    socket.on('notification:new', handleNotification);
    socket.on('notifications:unread-count', handleUnreadCount);

    return () => {
      socket.off('notification:new', handleNotification);
      socket.off('notifications:unread-count', handleUnreadCount);
      disconnectNotificationSocket();
    };
  }, [onNotification, onUnreadCount]);
};
