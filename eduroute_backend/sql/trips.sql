CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS faculty_trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_user_id UUID NOT NULL REFERENCES faculty_users(id) ON DELETE CASCADE,
    origin_latitude NUMERIC(10, 7) NOT NULL,
    origin_longitude NUMERIC(10, 7) NOT NULL,
    destination_latitude NUMERIC(10, 7) NOT NULL,
    destination_longitude NUMERIC(10, 7) NOT NULL,
    destination_name VARCHAR(255) NOT NULL,
    route_geometry JSONB,
    distance_meters NUMERIC(12, 2),
    duration_seconds NUMERIC(12, 2),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_faculty_trips_status
        CHECK (status IN ('active', 'completed', 'cancelled')),
    CONSTRAINT chk_faculty_trips_origin_latitude
        CHECK (origin_latitude BETWEEN -90 AND 90),
    CONSTRAINT chk_faculty_trips_destination_latitude
        CHECK (destination_latitude BETWEEN -90 AND 90),
    CONSTRAINT chk_faculty_trips_origin_longitude
        CHECK (origin_longitude BETWEEN -180 AND 180),
    CONSTRAINT chk_faculty_trips_destination_longitude
        CHECK (destination_longitude BETWEEN -180 AND 180)
);

CREATE INDEX IF NOT EXISTS idx_faculty_trips_faculty_user_id
    ON faculty_trips(faculty_user_id);

CREATE INDEX IF NOT EXISTS idx_faculty_trips_status
    ON faculty_trips(status);

CREATE INDEX IF NOT EXISTS idx_faculty_trips_started_at
    ON faculty_trips(started_at DESC);

CREATE TABLE IF NOT EXISTS faculty_trip_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES faculty_trips(id) ON DELETE CASCADE,
    faculty_user_id UUID NOT NULL REFERENCES faculty_users(id) ON DELETE CASCADE,
    event_type VARCHAR(40) NOT NULL,
    event_payload JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_faculty_trip_events_trip_id
    ON faculty_trip_events(trip_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_faculty_trips_updated_at ON faculty_trips;

CREATE TRIGGER trg_faculty_trips_updated_at
BEFORE UPDATE ON faculty_trips
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
