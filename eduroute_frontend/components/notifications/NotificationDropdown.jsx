import React from 'react';

const NotificationDropdown = ({ notifications = [], onMarkRead, onViewAll }) => (
  <div className="notification-dropdown">
    <div className="notification-dropdown-list">
      {notifications.length === 0 ? (
        <div className="notification-dropdown-empty">No notifications yet.</div>
      ) : notifications.map((notification) => (
        <button
          key={notification.id}
          type="button"
          className={`notification-dropdown-item ${notification.isRead ? 'read' : 'unread'}`}
          onClick={() => onMarkRead?.(notification.id)}
        >
          <strong>{notification.title}</strong>
          <span>{notification.message}</span>
          <small>{notification.formattedCreatedAt || notification.createdAt}</small>
        </button>
      ))}
    </div>
    <button type="button" className="notification-dropdown-view-all" onClick={onViewAll}>
      View all
    </button>
  </div>
);

export default NotificationDropdown;
