-- AES-256-GCM field-level encryption support.
-- This migration adds encrypted payload, IV, and auth-tag columns beside existing
-- plaintext fields so old records can be backfilled safely later.

ALTER TABLE arrival_verifications
    ADD COLUMN IF NOT EXISTS focal_person_name_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS focal_person_name_iv TEXT,
    ADD COLUMN IF NOT EXISTS focal_person_name_auth_tag TEXT,
    ADD COLUMN IF NOT EXISTS focal_person_position_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS focal_person_position_iv TEXT,
    ADD COLUMN IF NOT EXISTS focal_person_position_auth_tag TEXT,
    ADD COLUMN IF NOT EXISTS review_remarks_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS review_remarks_iv TEXT,
    ADD COLUMN IF NOT EXISTS review_remarks_auth_tag TEXT;

ALTER TABLE locator_slip_location_verifications
    ADD COLUMN IF NOT EXISTS remarks_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS remarks_iv TEXT,
    ADD COLUMN IF NOT EXISTS remarks_auth_tag TEXT;

-- TODO: backfill existing plaintext sensitive values into these encrypted
-- columns with a one-time Node.js script after FIELD_ENCRYPTION_KEY is configured.
