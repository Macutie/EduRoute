ALTER TABLE arrival_verifications
    ADD COLUMN IF NOT EXISTS focal_person_name TEXT,
    ADD COLUMN IF NOT EXISTS focal_person_position TEXT,
    ADD COLUMN IF NOT EXISTS focal_person_signature_url TEXT,
    ADD COLUMN IF NOT EXISTS focal_person_signature_public_id TEXT,
    ADD COLUMN IF NOT EXISTS arrival_photo_url TEXT,
    ADD COLUMN IF NOT EXISTS arrival_photo_public_id TEXT,
    ADD COLUMN IF NOT EXISTS proof_compliance_image_url TEXT,
    ADD COLUMN IF NOT EXISTS proof_compliance_image_public_id TEXT,
    ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES faculty_users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS review_remarks TEXT;

UPDATE arrival_verifications
SET
    proof_compliance_image_url = COALESCE(proof_compliance_image_url, image_url),
    proof_compliance_image_public_id = COALESCE(proof_compliance_image_public_id, image_public_id),
    verification_status = COALESCE(
        verification_status,
        CASE
            WHEN LOWER(COALESCE(status, 'submitted')) = 'verified' THEN 'verified'
            WHEN LOWER(COALESCE(status, 'submitted')) = 'rejected' THEN 'rejected'
            ELSE 'submitted'
        END
    ),
    submitted_at = COALESCE(submitted_at, verified_at, created_at)
WHERE
    proof_compliance_image_url IS NULL
    OR proof_compliance_image_public_id IS NULL
    OR verification_status IS NULL
    OR submitted_at IS NULL;

ALTER TABLE arrival_verifications
    ALTER COLUMN verification_status SET DEFAULT 'submitted';

ALTER TABLE arrival_verifications
    DROP CONSTRAINT IF EXISTS chk_arrival_verifications_verification_status;

ALTER TABLE arrival_verifications
    ADD CONSTRAINT chk_arrival_verifications_verification_status
        CHECK (verification_status IN ('submitted', 'verified', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_arrival_verifications_submitted_at
    ON arrival_verifications(submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_arrival_verifications_verification_status
    ON arrival_verifications(verification_status);
