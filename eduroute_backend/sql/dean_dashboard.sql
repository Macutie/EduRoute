CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO departments (department_name)
VALUES
    ('College of Hospitality and Tourism Management'),
    ('College of Education, Arts and Sciences'),
    ('College of Business and Accountancy'),
    ('College of Allied Health Studies'),
    ('College of Computer Studies')
ON CONFLICT (department_name) DO NOTHING;

ALTER TABLE faculty_users
DROP CONSTRAINT IF EXISTS faculty_users_account_role_check;

ALTER TABLE faculty_users
ADD CONSTRAINT faculty_users_account_role_check
CHECK (account_role IN ('faculty', 'hrmu', 'cssu', 'admin', 'assistant_dean', 'college_dean'));

ALTER TABLE faculty_users
DROP CONSTRAINT IF EXISTS faculty_users_department_required_for_role_check;

ALTER TABLE faculty_users
ADD CONSTRAINT faculty_users_department_required_for_role_check
CHECK (
    account_role IN ('hrmu', 'cssu')
    OR department_id IS NOT NULL
);

ALTER TABLE faculty_users
    ADD COLUMN IF NOT EXISTS department_position VARCHAR(80) NOT NULL DEFAULT 'Instructor',
    ADD COLUMN IF NOT EXISTS employment_type VARCHAR(20) NOT NULL DEFAULT 'full_time';

ALTER TABLE faculty_users
DROP CONSTRAINT IF EXISTS faculty_users_employment_type_check;

ALTER TABLE faculty_users
ADD CONSTRAINT faculty_users_employment_type_check
CHECK (employment_type IN ('full_time', 'part_time'));

CREATE UNIQUE INDEX IF NOT EXISTS ux_faculty_users_one_assistant_dean_per_college
    ON faculty_users(department_id)
    WHERE account_role = 'assistant_dean';

CREATE UNIQUE INDEX IF NOT EXISTS ux_faculty_users_one_college_dean_per_college
    ON faculty_users(department_id)
    WHERE account_role = 'college_dean';

ALTER TABLE locator_slips
    ADD COLUMN IF NOT EXISTS college_id INT REFERENCES departments(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL,
    ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP NULL,
    ADD COLUMN IF NOT EXISTS reviewed_by UUID NULL REFERENCES faculty_users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE locator_slips ls
SET college_id = fu.department_id
FROM faculty_users fu
WHERE ls.faculty_user_id = fu.id
  AND ls.college_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_locator_slips_college_id
    ON locator_slips(college_id);

CREATE INDEX IF NOT EXISTS idx_locator_slips_college_status_created
    ON locator_slips(college_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id UUID NOT NULL REFERENCES faculty_users(id) ON DELETE CASCADE,
    locator_slip_id UUID REFERENCES locator_slips(id) ON DELETE CASCADE,
    title VARCHAR(160) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(40) NOT NULL DEFAULT 'locator_slip',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
    ON notifications(recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
    ON notifications(recipient_user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_locator_slip_id
    ON notifications(locator_slip_id);
