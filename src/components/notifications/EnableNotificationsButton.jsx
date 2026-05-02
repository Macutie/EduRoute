import React from 'react';

const EnableNotificationsButton = ({ onClick, loading = false, disabled = false }) => (
  <button type="button" onClick={onClick} disabled={loading || disabled}>
    {loading ? 'Enabling...' : 'Enable Notifications'}
  </button>
);

export default EnableNotificationsButton;
