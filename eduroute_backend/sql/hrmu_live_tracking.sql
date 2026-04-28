CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS trip_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    faculty_user_id UUID NOT NULL REFERENCES faculty_users(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    subtitle TEXT,
    metadata JSONB,
    occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trip_events_trip_id_occurred_at
    ON trip_events (trip_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_trip_events_faculty_user_id_occurred_at
    ON trip_events (faculty_user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_latest_locations_trip_id
    ON latest_locations (trip_id);

CREATE INDEX IF NOT EXISTS idx_latest_locations_user_id
    ON latest_locations (user_id);

CREATE INDEX IF NOT EXISTS idx_trip_location_logs_trip_id_recorded_at
    ON trip_location_logs (trip_id, recorded_at DESC);
