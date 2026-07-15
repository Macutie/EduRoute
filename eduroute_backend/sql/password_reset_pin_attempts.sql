ALTER TABLE password_reset_tokens
ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_attempts
ON password_reset_tokens(attempts);
