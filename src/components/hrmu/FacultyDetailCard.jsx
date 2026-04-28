import React from 'react';

const RouteGlyph = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 5h5v5" />
    <path d="M10 14 19 5" />
    <path d="M5 19h14" />
  </svg>
);

export const FacultyDetailCard = ({ faculty, detail, loading = false }) => {
  const displayName = detail?.faculty?.facultyName || faculty?.facultyName || 'No active faculty';
  const displayPosition = detail?.faculty?.position || faculty?.position || faculty?.facultyRoleOrPosition || 'Instructor';
  const displayCollege = detail?.faculty?.collegeName || faculty?.collegeName || 'Olongapo live tracking';
  const speedKmh = detail?.latestLocation?.speedKmh ?? faculty?.speedKmh ?? null;
  const lastUpdatedLabel = detail?.latestLocation?.lastUpdatedLabel || faculty?.lastUpdatedLabel || 'Awaiting update';
  const destination = detail?.activeTrip?.destination || faculty?.destination || 'Unknown destination';

  return (
    <article className="hrmu-live-profile-card">
      <div className="hrmu-live-profile-tag" aria-hidden="true" />
      <h2>{displayName}</h2>
      <p className="hrmu-live-profile-subline">{displayCollege} · {detail?.activeTrip?.status || faculty?.markerStatus || 'active'}</p>
      <p>{`SENIOR FACULTY • ${String(displayPosition).toUpperCase()}`}</p>
      <div className="hrmu-live-profile-meta">
        <div>
          <span>CURRENT SPEED</span>
          <strong>{loading ? 'Loading...' : speedKmh !== null ? `${Number(speedKmh).toFixed(1)} km/h` : '--'}</strong>
        </div>
        <div>
          <span>LAST UPDATE</span>
          <strong className="fresh">{loading ? 'Loading...' : lastUpdatedLabel}</strong>
        </div>
      </div>
      <div className="hrmu-live-destination-card">
        <div>
          <span>PREDICTED DESTINATION</span>
          <strong>{loading ? 'Loading...' : destination}</strong>
        </div>
        <span className="hrmu-live-destination-icon"><RouteGlyph /></span>
      </div>
    </article>
  );
};

export default FacultyDetailCard;
