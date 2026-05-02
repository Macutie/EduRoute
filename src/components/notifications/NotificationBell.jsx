import React, { useState } from 'react';
import NotificationDropdown from './NotificationDropdown';

const NotificationBell = ({ unreadCount = 0, notifications = [], onMarkRead, onViewAll }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="notification-bell">
      <button type="button" className="notification-bell-trigger" onClick={() => setOpen((current) => !current)}>
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && <span className="notification-bell-badge">{unreadCount}</span>}
      </button>
      {open && (
        <NotificationDropdown
          notifications={notifications}
          onMarkRead={onMarkRead}
          onViewAll={onViewAll}
        />
      )}
    </div>
  );
};

export default NotificationBell;
