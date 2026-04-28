CREATE EXTENSION IF NOT EXISTS "pgcrypto";

UPDATE departments
SET department_name = 'College of Tourism and Hospitality Management'
WHERE department_name = 'College of Hospitality and Tourism Management';

INSERT INTO departments (department_name)
VALUES
    ('College of Education, Arts and Sciences'),
    ('College of Computer Studies'),
    ('College of Business and Accountancy'),
    ('College of Tourism and Hospitality Management'),
    ('College of Allied Health Studies')
ON CONFLICT (department_name) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_locator_slips_college_departure_status
    ON locator_slips (college_id, departure_datetime DESC, status);

CREATE INDEX IF NOT EXISTS idx_trips_status_user_started
    ON trips (status, user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_latest_locations_trip_recorded
    ON latest_locations (trip_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type_recipient_created
    ON notifications (type, recipient_user_id, created_at DESC);
