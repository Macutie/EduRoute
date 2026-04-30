ALTER TABLE locator_slips
    ADD COLUMN IF NOT EXISTS locator_slip_code TEXT,
    ADD COLUMN IF NOT EXISTS qr_generated_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS cssu_validated_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS cssu_validation_status TEXT,
    ADD COLUMN IF NOT EXISTS cssu_validation_notes TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_locator_slips_locator_slip_code
    ON locator_slips(locator_slip_code)
    WHERE locator_slip_code IS NOT NULL;

ALTER TABLE locator_slips
    DROP CONSTRAINT IF EXISTS chk_locator_slips_cssu_validation_status;

ALTER TABLE locator_slips
    ADD CONSTRAINT chk_locator_slips_cssu_validation_status
    CHECK (
        cssu_validation_status IS NULL
        OR cssu_validation_status IN ('approved', 'validated', 'denied')
    );
