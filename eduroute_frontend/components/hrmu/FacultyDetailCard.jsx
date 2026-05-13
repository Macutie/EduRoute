import React from 'react';

const toTitleCase = (value) =>
  String(value || '')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const FacultyDetailCard = ({ faculty, detail, loading = false }) => {
  const displayName = detail?.faculty?.facultyName || faculty?.facultyName || 'No active faculty';
  const displayPosition = detail?.faculty?.position || faculty?.position || faculty?.facultyRoleOrPosition || 'Instructor';
  const displayCollege = detail?.faculty?.collegeName || faculty?.collegeName || 'Olongapo live tracking';
  const speedKmh = detail?.latestLocation?.speedKmh ?? faculty?.speedKmh ?? null;
  const lastUpdatedLabel = detail?.latestLocation?.lastUpdatedLabel || faculty?.lastUpdatedLabel || 'Awaiting update';
  const destination = detail?.activeTrip?.destination || faculty?.destination || 'Unknown destination';
  const rawStatus = detail?.activeTrip?.status || faculty?.markerStatus || 'active';
  const displayStatus = toTitleCase(rawStatus);
  const normalizedPosition = toTitleCase(displayPosition);

  return (
    <article className="hrmu-live-profile-card">
      <div className="hrmu-live-profile-tag" aria-hidden="true" />
      <h2>{displayName}</h2>
      <p className="hrmu-live-profile-subline">{`${displayCollege} • ${displayStatus}`}</p>
      <p>{normalizedPosition}</p>
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
          <span>TARGET DESTINATION</span>
          <strong>{loading ? 'Loading...' : destination}</strong>
        </div>
      </div>
    </article>
  );
};

export default FacultyDetailCard;
