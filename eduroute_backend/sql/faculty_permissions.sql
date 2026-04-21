CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS faculty_permission_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_user_id UUID NOT NULL UNIQUE REFERENCES faculty_users(id) ON DELETE CASCADE,
    notifications_status VARCHAR(20) NOT NULL DEFAULT 'unknown',
    location_status VARCHAR(20) NOT NULL DEFAULT 'unknown',
    camera_status VARCHAR(20) NOT NULL DEFAULT 'unknown',
    first_login_setup_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT faculty_permissions_notifications_status_check
        CHECK (notifications_status IN ('unknown', 'granted', 'denied', 'dismissed', 'unsupported')),
    CONSTRAINT faculty_permissions_location_status_check
        CHECK (location_status IN ('unknown', 'granted', 'denied', 'dismissed', 'unsupported')),
    CONSTRAINT faculty_permissions_camera_status_check
        CHECK (camera_status IN ('unknown', 'granted', 'denied', 'dismissed', 'unsupported'))
);

CREATE INDEX IF NOT EXISTS idx_faculty_permissions_faculty_user_id
    ON faculty_permission_preferences(faculty_user_id);

CREATE OR REPLACE FUNCTION set_faculty_permission_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_faculty_permission_preferences_updated_at
    ON faculty_permission_preferences;

CREATE TRIGGER trg_faculty_permission_preferences_updated_at
BEFORE UPDATE ON faculty_permission_preferences
FOR EACH ROW
EXECUTE FUNCTION set_faculty_permission_preferences_updated_at();
