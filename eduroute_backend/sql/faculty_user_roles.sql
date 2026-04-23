ALTER TABLE faculty_users
ADD COLUMN IF NOT EXISTS account_role VARCHAR(20) NOT NULL DEFAULT 'faculty';

UPDATE faculty_users
SET account_role = 'faculty'
WHERE account_role IS NULL;

ALTER TABLE faculty_users
DROP CONSTRAINT IF EXISTS faculty_users_account_role_check;

ALTER TABLE faculty_users
ADD CONSTRAINT faculty_users_account_role_check
CHECK (account_role IN ('faculty', 'hrmu', 'cssu', 'admin'));

CREATE INDEX IF NOT EXISTS idx_faculty_users_account_role
    ON faculty_users(account_role);
