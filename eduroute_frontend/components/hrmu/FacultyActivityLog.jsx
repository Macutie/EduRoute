import React from 'react';

const toneByType = (type) => {
  if (type === 'trip_completed') return 'yellow';
  if (type === 'trip_cancelled') return 'yellow';
  if (type === 'location_update') return 'green';
  return 'green';
};

export const FacultyActivityLog = ({
  activity = [],
  loading = false,
  onViewAll = null,
}) => (
  <article className="hrmu-live-activity-card">
    <div className="hrmu-live-activity-head">
      <h2>Live Activity</h2>
      <span className="hrmu-live-pill"><span /> LIVE</span>
    </div>
    <div className="hrmu-live-activity-list">
      {loading && <div className="hrmu-live-empty">Loading live activity...</div>}
      {!loading && activity.length === 0 && (
        <div className="hrmu-live-empty">No activity has been recorded for the selected faculty yet.</div>
      )}
      {!loading && activity.map((item) => (
        <div key={item.id || `${item.type}-${item.occurredAt}`} className={`hrmu-live-activity-item ${toneByType(item.type)}`}>
          <div className="hrmu-live-activity-accent" />
          <div className="hrmu-live-activity-copy">
            <strong>{item.title}</strong>
            <p>{item.subtitle}</p>
            <small>{item.relativeTime}</small>
          </div>
        </div>
      ))}
    </div>
    <button type="button" className="hrmu-live-log-btn" onClick={() => onViewAll?.()}>
      VIEW ALL LOGS
    </button>
  </article>
);

export default FacultyActivityLog;
