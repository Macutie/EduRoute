INSERT INTO departments (department_name)
VALUES
('College of Education, Arts and Sciences'),
('College of Business and Accountancy'),
('College of Allied Health Studies'),
('College of Computer Studies'),
('College of Hospitality and Tourism Management')
ON CONFLICT (department_name) DO NOTHING;