CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE locator_slips
    ADD COLUMN IF NOT EXISTS destination_lat NUMERIC(10, 7),
    ADD COLUMN IF NOT EXISTS destination_lng NUMERIC(10, 7),
    ADD COLUMN IF NOT EXISTS destination_resolution_method VARCHAR(30),
    ADD COLUMN IF NOT EXISTS trip_status VARCHAR(20) DEFAULT 'not_started';

ALTER TABLE trips
    ADD COLUMN IF NOT EXISTS locator_slip_id UUID REFERENCES locator_slips(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS arrival_verified_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS returned_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS outbound_distance_meters NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS return_distance_meters NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS total_distance_meters NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS total_distance_km NUMERIC(12, 3),
    ADD COLUMN IF NOT EXISTS total_trip_minutes NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS total_trip_hours NUMERIC(12, 2);

ALTER TABLE trips DROP CONSTRAINT IF EXISTS chk_trips_status;
ALTER TABLE trips
    ADD CONSTRAINT chk_trips_status
        CHECK (status IN ('not_started', 'active', 'arrived', 'returning', 'completed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_trips_locator_slip_id
    ON trips(locator_slip_id);

CREATE TABLE IF NOT EXISTS arrival_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    locator_slip_id UUID NOT NULL REFERENCES locator_slips(id) ON DELETE CASCADE,
    faculty_user_id UUID NOT NULL REFERENCES faculty_users(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    image_public_id TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'submitted',
    verified_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_arrival_verifications_status
        CHECK (status IN ('pending', 'submitted', 'verified', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_arrival_verifications_trip_id
    ON arrival_verifications(trip_id);

CREATE INDEX IF NOT EXISTS idx_arrival_verifications_locator_slip_id
    ON arrival_verifications(locator_slip_id);

ALTER TABLE trip_incidents
    DROP CONSTRAINT IF EXISTS trip_incidents_trip_id_incident_type_key;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'trip_incidents'
    ) THEN
        CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_incidents_trip_type
            ON trip_incidents(trip_id, incident_type);
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_locator_slips_trip_status
    ON locator_slips(trip_status);

DROP TRIGGER IF EXISTS trg_arrival_verifications_updated_at ON arrival_verifications;

CREATE TRIGGER trg_arrival_verifications_updated_at
BEFORE UPDATE ON arrival_verifications
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
