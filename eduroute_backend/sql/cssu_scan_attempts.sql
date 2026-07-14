CREATE TABLE IF NOT EXISTS cssu_scan_attempts (
    id BIGSERIAL PRIMARY KEY,
    locator_slip_id UUID REFERENCES locator_slips(id) ON DELETE SET NULL,
    faculty_user_id UUID REFERENCES faculty_users(id) ON DELETE SET NULL,
    gate VARCHAR(32) NOT NULL DEFAULT 'main_gate',
    lookup_method VARCHAR(24) NOT NULL DEFAULT 'manual',
    outcome VARCHAR(40) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cssu_scan_attempts_locator_created
    ON cssu_scan_attempts(locator_slip_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cssu_scan_attempts_faculty_created
    ON cssu_scan_attempts(faculty_user_id, created_at DESC);
