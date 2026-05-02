ALTER TABLE locator_slips
ADD COLUMN IF NOT EXISTS trip_status TEXT,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS cssu_validation_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS cssu_validated_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS cssu_validated_by UUID NULL REFERENCES faculty_users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS cssu_validation_notes TEXT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_locator_slips_trip_status'
    ) THEN
        ALTER TABLE locator_slips
        ADD CONSTRAINT chk_locator_slips_trip_status
        CHECK (trip_status IN ('not_started', 'active', 'arrived', 'returning', 'completed', 'cancelled'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_locator_slips_cssu_validation_status'
    ) THEN
        ALTER TABLE locator_slips
        ADD CONSTRAINT chk_locator_slips_cssu_validation_status
        CHECK (cssu_validation_status IN ('pending', 'allowed', 'denied', 'flagged'));
    END IF;
END $$;

ALTER TABLE trips
ADD COLUMN IF NOT EXISTS summary_generated_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS outbound_distance_meters NUMERIC NULL,
ADD COLUMN IF NOT EXISTS return_distance_meters NUMERIC NULL,
ADD COLUMN IF NOT EXISTS total_distance_meters NUMERIC NULL,
ADD COLUMN IF NOT EXISTS total_distance_km NUMERIC NULL,
ADD COLUMN IF NOT EXISTS total_trip_minutes INTEGER NULL,
ADD COLUMN IF NOT EXISTS total_trip_hours NUMERIC NULL;
