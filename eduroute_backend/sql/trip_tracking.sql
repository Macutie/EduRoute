CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES faculty_users(id) ON DELETE CASCADE,
    origin_lng NUMERIC(10, 7) NOT NULL,
    origin_lat NUMERIC(10, 7) NOT NULL,
    destination_lng NUMERIC(10, 7) NOT NULL,
    destination_lat NUMERIC(10, 7) NOT NULL,
    destination_name VARCHAR(255) NOT NULL,
    route_geometry JSONB,
    route_distance_meters NUMERIC(12, 2),
    route_duration_seconds NUMERIC(12, 2),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_trips_status
        CHECK (status IN ('active', 'completed', 'cancelled')),
    CONSTRAINT chk_trips_origin_lng
        CHECK (origin_lng BETWEEN -180 AND 180),
    CONSTRAINT chk_trips_origin_lat
        CHECK (origin_lat BETWEEN -90 AND 90),
    CONSTRAINT chk_trips_destination_lng
        CHECK (destination_lng BETWEEN -180 AND 180),
    CONSTRAINT chk_trips_destination_lat
        CHECK (destination_lat BETWEEN -90 AND 90)
);

CREATE INDEX IF NOT EXISTS idx_trips_user_id
    ON trips(user_id);

CREATE INDEX IF NOT EXISTS idx_trips_status
    ON trips(status);

CREATE INDEX IF NOT EXISTS idx_trips_started_at
    ON trips(started_at DESC);

CREATE TABLE IF NOT EXISTS latest_locations (
    trip_id UUID PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES faculty_users(id) ON DELETE CASCADE,
    lng NUMERIC(10, 7) NOT NULL,
    lat NUMERIC(10, 7) NOT NULL,
    speed NUMERIC(10, 2),
    heading NUMERIC(10, 2),
    recorded_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_latest_locations_lng
        CHECK (lng BETWEEN -180 AND 180),
    CONSTRAINT chk_latest_locations_lat
        CHECK (lat BETWEEN -90 AND 90)
);

CREATE INDEX IF NOT EXISTS idx_latest_locations_user_id
    ON latest_locations(user_id);

CREATE INDEX IF NOT EXISTS idx_latest_locations_recorded_at
    ON latest_locations(recorded_at DESC);

CREATE TABLE IF NOT EXISTS trip_location_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES faculty_users(id) ON DELETE CASCADE,
    lng NUMERIC(10, 7) NOT NULL,
    lat NUMERIC(10, 7) NOT NULL,
    speed NUMERIC(10, 2),
    heading NUMERIC(10, 2),
    recorded_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_trip_location_logs_lng
        CHECK (lng BETWEEN -180 AND 180),
    CONSTRAINT chk_trip_location_logs_lat
        CHECK (lat BETWEEN -90 AND 90)
);

CREATE INDEX IF NOT EXISTS idx_trip_location_logs_trip_id
    ON trip_location_logs(trip_id);

CREATE INDEX IF NOT EXISTS idx_trip_location_logs_user_id
    ON trip_location_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_trip_location_logs_recorded_at
    ON trip_location_logs(recorded_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trips_updated_at ON trips;

CREATE TRIGGER trg_trips_updated_at
BEFORE UPDATE ON trips
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
