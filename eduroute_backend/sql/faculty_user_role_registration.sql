ALTER TABLE faculty_users
ALTER COLUMN department_id DROP NOT NULL;

ALTER TABLE faculty_users
DROP CONSTRAINT IF EXISTS faculty_users_department_required_for_role_check;

ALTER TABLE faculty_users
ADD CONSTRAINT faculty_users_department_required_for_role_check
CHECK (
    account_role IN ('hrmu', 'cssu')
    OR department_id IS NOT NULL
);
