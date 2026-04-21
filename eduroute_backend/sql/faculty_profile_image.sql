ALTER TABLE faculty_users
ADD COLUMN IF NOT EXISTS profile_image_url TEXT,
ADD COLUMN IF NOT EXISTS profile_image_public_id TEXT;
