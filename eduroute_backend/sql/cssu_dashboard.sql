CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS cssu_exit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locator_slip_id UUID NOT NULL REFERENCES locator_slips(id) ON DELETE CASCADE,
    faculty_user_id UUID NOT NULL REFERENCES faculty_users(id) ON DELETE CASCADE,
    gate VARCHAR(20) NOT NULL DEFAULT 'main_gate',
    status VARCHAR(20) NOT NULL DEFAULT 'approved',
    validation_method VARCHAR(20) NOT NULL DEFAULT 'manual',
    validated_at TIMESTAMP NULL,
    validated_by UUID NULL REFERENCES faculty_users(id) ON DELETE SET NULL,
    notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_cssu_exit_logs_gate
        CHECK (gate IN ('main_gate', 'back_gate')),
    CONSTRAINT chk_cssu_exit_logs_status
        CHECK (status IN ('approved', 'validated', 'denied')),
    CONSTRAINT chk_cssu_exit_logs_method
        CHECK (validation_method IN ('manual', 'qr')),
    CONSTRAINT uq_cssu_exit_logs_locator_slip UNIQUE (locator_slip_id)
);

ALTER TABLE cssu_exit_logs
    ADD COLUMN IF NOT EXISTS validation_method VARCHAR(20) NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_cssu_exit_logs_gate_status
    ON cssu_exit_logs (gate, status, validated_at DESC);

CREATE INDEX IF NOT EXISTS idx_cssu_exit_logs_faculty_user_id
    ON cssu_exit_logs (faculty_user_id);

CREATE OR REPLACE FUNCTION set_cssu_exit_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cssu_exit_logs_updated_at ON cssu_exit_logs;

CREATE TRIGGER trg_cssu_exit_logs_updated_at
BEFORE UPDATE ON cssu_exit_logs
FOR EACH ROW
EXECUTE FUNCTION set_cssu_exit_logs_updated_at();
