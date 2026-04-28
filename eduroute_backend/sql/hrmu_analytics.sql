CREATE EXTENSION IF NOT EXISTS pg_trgm;

UPDATE departments
SET department_name = 'College of Hospitality and Tourism Management'
WHERE department_name = 'College of Tourism and Hospitality Management';

INSERT INTO departments (department_name)
VALUES
    ('College of Education, Arts and Sciences'),
    ('College of Hospitality and Tourism Management'),
    ('College of Business and Accountancy'),
    ('College of Computer Studies'),
    ('College of Allied Health Studies')
ON CONFLICT (department_name) DO NOTHING;

ALTER TABLE locator_slips
    ADD COLUMN IF NOT EXISTS college_id INT REFERENCES departments(id) ON DELETE SET NULL;

ALTER TABLE locator_slips
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL;

ALTER TABLE locator_slips
    ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP NULL;

ALTER TABLE locator_slips
    ADD COLUMN IF NOT EXISTS reviewed_by UUID NULL REFERENCES faculty_users(id) ON DELETE SET NULL;

ALTER TABLE trips
    ADD COLUMN IF NOT EXISTS locator_slip_id UUID NULL REFERENCES locator_slips(id) ON DELETE SET NULL;

ALTER TABLE trips
    ADD COLUMN IF NOT EXISTS optimized_distance_meters NUMERIC(12, 2);

UPDATE locator_slips ls
SET college_id = fu.department_id
FROM faculty_users fu
WHERE fu.id = ls.faculty_user_id
  AND ls.college_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_locator_slips_college_created_at
    ON locator_slips (college_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_locator_slips_destination
    ON locator_slips (destination);

CREATE INDEX IF NOT EXISTS idx_trips_ended_at_status
    ON trips (ended_at DESC, status);

CREATE INDEX IF NOT EXISTS idx_trips_locator_slip_id
    ON trips (locator_slip_id);
