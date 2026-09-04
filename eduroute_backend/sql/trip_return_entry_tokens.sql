CREATE TABLE IF NOT EXISTS trip_return_entry_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL UNIQUE REFERENCES trips(id) ON DELETE CASCADE,
    entry_code VARCHAR(9) NOT NULL UNIQUE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP NULL,
    confirmed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trip_return_entry_tokens_active
    ON trip_return_entry_tokens(trip_id, expires_at, consumed_at);

ALTER TABLE trip_return_entry_tokens
    ADD COLUMN IF NOT EXISTS entry_code VARCHAR(9);

ALTER TABLE trip_return_entry_tokens
    ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS uq_trip_return_entry_tokens_entry_code
    ON trip_return_entry_tokens(entry_code);
