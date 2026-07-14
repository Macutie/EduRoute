ALTER TABLE trip_location_logs
    ADD COLUMN IF NOT EXISTS accuracy NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS source VARCHAR(32) NOT NULL DEFAULT 'gps',
    ADD COLUMN IF NOT EXISTS sync_status VARCHAR(32) NOT NULL DEFAULT 'synced';

CREATE INDEX IF NOT EXISTS idx_trip_location_logs_trip_recorded_at
    ON trip_location_logs(trip_id, recorded_at ASC);

DELETE FROM trip_location_logs stale
USING trip_location_logs kept
WHERE stale.ctid > kept.ctid
  AND stale.trip_id = kept.trip_id
  AND stale.lng = kept.lng
  AND stale.lat = kept.lat
  AND stale.recorded_at = kept.recorded_at;

CREATE UNIQUE INDEX IF NOT EXISTS uq_trip_location_logs_trip_point_time
    ON trip_location_logs(trip_id, lng, lat, recorded_at);
