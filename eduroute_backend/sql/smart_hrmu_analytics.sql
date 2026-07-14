CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS trip_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    locator_slip_id UUID REFERENCES locator_slips(id) ON DELETE SET NULL,
    faculty_user_id UUID NOT NULL REFERENCES faculty_users(id) ON DELETE CASCADE,
    incident_type VARCHAR(64) NOT NULL,
    incident_label VARCHAR(255) NOT NULL,
    severity VARCHAR(16) NOT NULL DEFAULT 'medium',
    detected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_trip_incidents_severity CHECK (severity IN ('high', 'medium', 'low'))
);

ALTER TABLE trip_incidents
    DROP CONSTRAINT IF EXISTS chk_trip_incidents_type;

ALTER TABLE trip_incidents
    ADD CONSTRAINT chk_trip_incidents_type
        CHECK (incident_type IN ('LATE_RETURN', 'UNVERIFIED_LOCATION', 'LIVE_LOCATION_DISCONNECTED', 'LOCATION_DISCONNECTED', 'MISSING_PROOF', 'UNVERIFIED_ARRIVAL'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_trip_incidents_trip_type
    ON trip_incidents (trip_id, incident_type);

CREATE INDEX IF NOT EXISTS idx_trip_incidents_trip_detected_at
    ON trip_incidents (trip_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_trip_incidents_locator_slip_id
    ON trip_incidents (locator_slip_id);

CREATE INDEX IF NOT EXISTS idx_trip_incidents_faculty_user_id
    ON trip_incidents (faculty_user_id);

CREATE TABLE IF NOT EXISTS trip_analytics (
    analytics_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    risk_score INTEGER NOT NULL DEFAULT 0,
    risk_level VARCHAR(20) NOT NULL,
    reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_trip_analytics_trip_id
    ON trip_analytics (trip_id);

CREATE INDEX IF NOT EXISTS idx_trip_analytics_generated_at
    ON trip_analytics (generated_at DESC);
