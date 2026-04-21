CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS faculty_users CASCADE;
DROP TABLE IF EXISTS departments CASCADE;

CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    department_name VARCHAR(150) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE faculty_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    employee_id VARCHAR(50) NOT NULL UNIQUE,
    department_id INT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    profile_image_url TEXT,
    profile_image_public_id TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_user_id UUID NOT NULL REFERENCES faculty_users(id) ON DELETE CASCADE,
    reset_code_hash TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_faculty_users_email ON faculty_users(email);
CREATE INDEX idx_faculty_users_employee_id ON faculty_users(employee_id);
CREATE INDEX idx_faculty_users_department_id ON faculty_users(department_id);
CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(faculty_user_id);
CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_departments_updated_at
BEFORE UPDATE ON departments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_faculty_users_updated_at
BEFORE UPDATE ON faculty_users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
