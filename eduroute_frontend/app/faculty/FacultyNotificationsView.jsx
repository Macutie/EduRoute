import { BackArrowIcon, DeanNotificationDocIcon } from "../../components/icons/AppIcons.jsx";
import { useNotifications } from "../../hooks/useNotifications";
import { formatNotificationRelativeTime, getNotificationGroupLabel } from "../shared/dateDisplay.js";
import { DEFAULT_PROFILE_IMAGE } from "../shared/appUtils.js";
import { BottomNav } from "./FacultyViews.jsx";
/* ======================================================== */
/* ADMIN DASHBOARD VIEW (Strategic Oversight)               */
/* ======================================================== */

export const FacultyNotificationsView = ({
  setView,
  profileData,
  setSelectedStatusSlip
}) => {
  const {
    notifications,
    loading,
    error,
    markRead,
    markAllRead
  } = useNotifications({
    limit: 50
  });
  const groupedNotifications = notifications.reduce((groups, notification) => {
    const label = getNotificationGroupLabel(notification.createdAt || notification.created_at);
    return {
      ...groups,
      [label]: [...(groups[label] || []), notification]
    };
  }, {});
  const orderedGroups = Object.entries(groupedNotifications);
  const openNotification = async notification => {
    try {
      await markRead(notification.id);
    } catch (markError) {
      console.error('Failed to mark notification read:', markError);
    }
    if (notification.locatorSlipId) {
      setSelectedStatusSlip?.(null);
    }
    setView('status');
  };
  return <div className="dashboard-wrapper">
      <div className="content fade-in dash-content">
        <div className="status-top-nav">
          <div className="slip-nav-left" onClick={() => setView('dashboard')}>
            <BackArrowIcon color="var(--green)" />
            <span className="dash-logo-text">EduRoute</span>
          </div>
          <div className="dash-avatar" onClick={() => setView('profile')} style={{
          cursor: 'pointer'
        }}>
            <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Faculty Profile" style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }} />
          </div>
        </div>

        <div className="dean-notification-list">
          <div className="dean-notification-actions" style={{
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
            <h2 style={{
            margin: 0,
            color: 'var(--text-dark)',
            fontSize: '28px',
            fontWeight: 900
          }}>Notifications</h2>
            {notifications.length > 0 && <button type="button" className="review" onClick={markAllRead}>
                MARK ALL READ
              </button>}
          </div>

          {loading && <p className="dean-empty-text">Loading notifications...</p>}
          {error && <p className="dean-error-text">{error}</p>}
          {!loading && !error && notifications.length === 0 && <p className="dean-empty-text">No faculty notifications yet.</p>}

          {!loading && orderedGroups.map(([groupLabel, items]) => <div key={groupLabel} className="dean-notification-group">
              {groupLabel !== 'Today' && <div className="dean-notification-divider">
                  <span>{groupLabel}</span>
                  <div />
                </div>}

              {items.map(notification => {
            const title = notification.title || 'Notification';
            const message = notification.message || '';
            const tone = /rejected|flagged|denied/i.test(`${title} ${message}`) ? 'pending' : 'green';
            return <article className="dean-notification-card" key={notification.id}>
                    <DeanNotificationDocIcon tone={tone} />
                    <div className="dean-notification-body">
                      <div className="dean-notification-title-row">
                        <h2>{title}</h2>
                        <time>{formatNotificationRelativeTime(notification.createdAt || notification.created_at)}</time>
                      </div>
                      <p>{message}</p>
                      <div className="dean-notification-actions">
                        <button type="button" className="review" onClick={() => openNotification(notification)}>
                          OPEN STATUS
                        </button>
                      </div>
                    </div>
                  </article>;
          })}
            </div>)}
        </div>

      </div>
      <BottomNav active="" setView={setView} />
    </div>;
};
