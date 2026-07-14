import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { MAPBOX_PUBLIC_TOKEN } from "../../config";
export const formatPathHistoryDateTime = value => {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString();
};
export const TripPathHistoryModal = ({
  history,
  loading,
  error,
  onClose
}) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const path = Array.isArray(history?.path) ? history.path : [];
  const coordinates = path.map(point => [Number(point.lng ?? point.longitude), Number(point.lat ?? point.latitude)]).filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  const plannedPath = Array.isArray(history?.plannedPath) ? history.plannedPath : [];
  const plannedCoordinates = plannedPath.map(point => [Number(point.lng ?? point.longitude), Number(point.lat ?? point.latitude)]).filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  const mapCoordinates = [...plannedCoordinates, ...coordinates];
  const stats = history?.stats || {};
  const recordedPathSteps = Array.isArray(history?.recordedPathSteps) ? history.recordedPathSteps : [];
  const disconnectedGapCount = Array.isArray(stats.disconnectedGaps) ? stats.disconnectedGaps.length : Number(stats.disconnectedGaps || 0);
  const hasMap = Boolean(MAPBOX_PUBLIC_TOKEN && mapCoordinates.length > 0);
  const coordinateKey = mapCoordinates.map(([lng, lat]) => `${lng},${lat}`).join('|');
  const plannedCoordinateKey = plannedCoordinates.map(([lng, lat]) => `${lng},${lat}`).join('|');
  const actualCoordinateKey = coordinates.map(([lng, lat]) => `${lng},${lat}`).join('|');
  useEffect(() => {
    if (!hasMap || !mapContainerRef.current || mapRef.current) return undefined;
    mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: mapCoordinates[0],
      zoom: 14
    });
    mapRef.current = map;
    map.on('load', () => {
      if (plannedCoordinates.length) {
        map.addSource('trip-planned-path', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: plannedCoordinates
            }
          }
        });
        map.addLayer({
          id: 'trip-planned-path-line',
          type: 'line',
          source: 'trip-planned-path',
          paint: {
            'line-color': '#facc15',
            'line-width': 4,
            'line-opacity': 0.85,
            'line-dasharray': [1.2, 1.2]
          }
        });
      }
      if (coordinates.length) {
        map.addSource('trip-path-history', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates
            }
          }
        });
        map.addLayer({
          id: 'trip-path-history-line',
          type: 'line',
          source: 'trip-path-history',
          paint: {
            'line-color': '#049516',
            'line-width': 5,
            'line-opacity': 0.95
          }
        });
      }
      const bounds = mapCoordinates.reduce((currentBounds, coordinate) => currentBounds.extend(coordinate), new mapboxgl.LngLatBounds(mapCoordinates[0], mapCoordinates[0]));
      map.fitBounds(bounds, {
        padding: 56,
        maxZoom: 16,
        duration: 0
      });
      const addMarker = (coordinate, label, className) => {
        const marker = document.createElement('div');
        marker.className = `trip-path-marker ${className}`;
        marker.title = label;
        new mapboxgl.Marker(marker).setLngLat(coordinate).addTo(map);
      };
      addMarker(mapCoordinates[0], 'Original location', 'start');
      if (coordinates.length) {
        addMarker(coordinates[coordinates.length - 1], 'Latest recorded GPS point', 'latest');
      }
      const destinationLng = Number(history?.destinationCoordinates?.lng);
      const destinationLat = Number(history?.destinationCoordinates?.lat);
      if (Number.isFinite(destinationLng) && Number.isFinite(destinationLat)) {
        addMarker([destinationLng, destinationLat], 'Destination', 'destination');
      }
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [hasMap, coordinateKey, plannedCoordinateKey, actualCoordinateKey, history?.destinationCoordinates?.lng, history?.destinationCoordinates?.lat]);
  const statCards = [{
    label: 'Saved Points',
    value: stats.totalPoints ?? path.length
  }, {
    label: 'Distance',
    value: `${Number(stats.estimatedDistanceKm || 0).toFixed(2)} km`
  }, {
    label: 'Duration',
    value: `${Math.round(Number(stats.durationMinutes || 0))} mins`
  }, {
    label: 'Disconnected Gaps',
    value: disconnectedGapCount
  }];
  return <div className="trip-path-modal-overlay" role="presentation" onClick={onClose}>
      <div className="trip-path-modal" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
        <div className="trip-path-modal-head">
          <div>
            <span>TRIP PATH HISTORY</span>
            <h2>{history?.destination || 'Recorded Route'}</h2>
            <p>{history?.facultyName || 'Faculty user'} {history?.collegeName ? `- ${history.collegeName}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close trip path history">x</button>
        </div>

        <div className="trip-path-modal-body">
          <div className="trip-path-map-panel">
            {loading ? <div className="trip-path-empty">Loading saved path...</div> : error ? <div className="trip-path-empty error">{error}</div> : hasMap ? <div className="trip-path-map-wrap">
                <div ref={mapContainerRef} className="trip-path-map" />
                <div className="trip-path-map-legend">
                  {plannedCoordinates.length > 0 && <span><i className="planned" />Pinned route</span>}
                  {coordinates.length > 0 && <span><i className="actual" />Actual GPS path</span>}
                </div>
              </div> : <div className="trip-path-empty">
                {plannedPath.length || path.length ? 'Map token is unavailable, but trip path data was loaded.' : 'No pinned route or actual GPS path is available for this trip.'}
              </div>}
          </div>

          <aside className="trip-path-stats">
            {statCards.map(card => <div key={card.label}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </div>)}
            <div className="trip-path-time-card">
              <span>Started</span>
              <strong>{formatPathHistoryDateTime(stats.startTime || history?.startedAt)}</strong>
            </div>
            <div className="trip-path-time-card">
              <span>Last Update</span>
              <strong>{stats.lastLocationUpdate ? formatPathHistoryDateTime(stats.lastLocationUpdate) : 'No GPS updates recorded'}</strong>
            </div>
            <div className="trip-path-time-card">
              <span>Ended</span>
              <strong>{formatPathHistoryDateTime(stats.endTime || history?.completedAt)}</strong>
            </div>
          </aside>
        </div>

        <div className="trip-path-steps-panel">
          <div className="trip-path-steps-head">
            <span>RECORDED PATH</span>
            <h3>Actual GPS movement steps</h3>
          </div>
          <div className="trip-path-steps-list">
            {recordedPathSteps.length ? recordedPathSteps.map((step, index) => <div key={`${step.title || 'recorded-path-step'}-${index}`} className="trip-path-step completed">
                <div className="trip-path-step-index">{index + 1}</div>
                <div className="trip-path-step-copy">
                  <div>
                    <strong>{step.title || `GPS segment ${index + 1}`}</strong>
                    <span>
                      {step.distanceMeters !== null && step.distanceMeters !== undefined ? `${(Number(step.distanceMeters) / 1000).toFixed(2)} km` : 'GPS point'}
                    </span>
                  </div>
                  <p>
                    {step.description}
                    {step.recordedAt ? ` Recorded ${formatPathHistoryDateTime(step.recordedAt)}.` : ''}
                  </p>
                </div>
              </div>) : <div className="trip-path-empty small">No actual GPS movement steps were recorded for this trip.</div>}
          </div>
        </div>
      </div>
    </div>;
};
