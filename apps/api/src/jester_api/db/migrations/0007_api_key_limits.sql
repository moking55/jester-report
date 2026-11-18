-- v1.1 B1 + B2: API key expiry, template allow-list and per-key rate limit (SPEC-auth.md "v1.1").
-- NULL everywhere = how keys worked before: never expires, every template, no limit.
-- Never edit this file after it has run anywhere: add 0008_*.sql instead.

ALTER TABLE api_keys
    ADD COLUMN expires_at timestamptz,
    ADD COLUMN templates text[],
    ADD COLUMN rate_limit_per_minute int CHECK (rate_limit_per_minute BETWEEN 1 AND 10000);

-- renders per key per minute; old rows are cleaned up by the first request of a new window
CREATE TABLE api_key_usage (
    key_id       uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    window_start timestamptz NOT NULL,
    count        int NOT NULL,
    PRIMARY KEY (key_id, window_start)
);
