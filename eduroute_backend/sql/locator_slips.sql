CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS locator_slips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_user_id UUID NOT NULL REFERENCES faculty_users(id) ON DELETE CASCADE,
    destination VARCHAR(255) NOT NULL,
    purpose_of_travel VARCHAR(80) NOT NULL,
    custom_purpose VARCHAR(255),
    departure_datetime TIMESTAMP NOT NULL,
    expected_return_datetime TIMESTAMP NOT NULL,
    additional_remarks TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_locator_slips_status
        CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
    CONSTRAINT chk_locator_slips_return_after_departure
        CHECK (expected_return_datetime > departure_datetime),
    CONSTRAINT chk_locator_slips_remarks_length
        CHECK (additional_remarks IS NULL OR char_length(additional_remarks) <= 1000),
    CONSTRAINT chk_locator_slips_custom_purpose
        CHECK (
            purpose_of_travel <> 'Others'
            OR (custom_purpose IS NOT NULL AND btrim(custom_purpose) <> '')
        )
);

CREATE INDEX IF NOT EXISTS idx_locator_slips_faculty_user_id
    ON locator_slips(faculty_user_id);

CREATE INDEX IF NOT EXISTS idx_locator_slips_status
    ON locator_slips(status);

CREATE INDEX IF NOT EXISTS idx_locator_slips_created_at
    ON locator_slips(created_at DESC);

CREATE TABLE IF NOT EXISTS locator_slip_location_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locator_slip_id UUID NOT NULL REFERENCES locator_slips(id) ON DELETE CASCADE,
    faculty_user_id UUID NOT NULL REFERENCES faculty_users(id) ON DELETE CASCADE,
    target_location VARCHAR(255) NOT NULL,
    image_url TEXT NOT NULL,
    image_public_id VARCHAR(255),
    mime_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    original_file_size INTEGER,
    image_width INTEGER,
    image_height INTEGER,
    verification_status VARCHAR(20) NOT NULL DEFAULT 'submitted',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_location_verifications_status
        CHECK (verification_status IN ('submitted', 'accepted', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_location_verifications_locator_slip_id
    ON locator_slip_location_verifications(locator_slip_id);

CREATE INDEX IF NOT EXISTS idx_location_verifications_faculty_user_id
    ON locator_slip_location_verifications(faculty_user_id);

CREATE INDEX IF NOT EXISTS idx_location_verifications_created_at
    ON locator_slip_location_verifications(created_at DESC);

ALTER TABLE locator_slip_location_verifications
    ADD COLUMN IF NOT EXISTS original_file_size INTEGER;

ALTER TABLE locator_slip_location_verifications
    ADD COLUMN IF NOT EXISTS image_width INTEGER;

ALTER TABLE locator_slip_location_verifications
    ADD COLUMN IF NOT EXISTS image_height INTEGER;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_locator_slips_updated_at ON locator_slips;

CREATE TRIGGER trg_locator_slips_updated_at
BEFORE UPDATE ON locator_slips
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
