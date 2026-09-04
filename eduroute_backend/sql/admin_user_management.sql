ALTER TABLE faculty_users
DROP CONSTRAINT IF EXISTS faculty_users_account_role_check;

ALTER TABLE faculty_users
ADD CONSTRAINT faculty_users_account_role_check
CHECK (account_role IN ('faculty', 'hrmu', 'cssu', 'assistant_dean', 'college_dean', 'admin'));

ALTER TABLE faculty_users
DROP CONSTRAINT IF EXISTS faculty_users_department_required_for_role_check;

ALTER TABLE faculty_users
ADD CONSTRAINT faculty_users_department_required_for_role_check
CHECK (account_role IN ('hrmu', 'cssu', 'admin') OR department_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_faculty_users_status ON faculty_users(status);
