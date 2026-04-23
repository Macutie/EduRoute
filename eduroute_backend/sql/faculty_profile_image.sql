ALTER TABLE faculty_users
ADD COLUMN IF NOT EXISTS profile_image_url TEXT,
ADD COLUMN IF NOT EXISTS profile_image_public_id TEXT,
ADD COLUMN IF NOT EXISTS profile_image_mime_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS profile_image_file_size INTEGER,
ADD COLUMN IF NOT EXISTS profile_image_original_file_size INTEGER,
ADD COLUMN IF NOT EXISTS profile_image_width INTEGER,
ADD COLUMN IF NOT EXISTS profile_image_height INTEGER;
