-- v1.13 (SPEC-auth.md "v1.13"): long-lived sessions for the MCP service (30 days idle, 90 days max).
-- Existing sessions stay standard. Never edit this file after it has run anywhere: add 0011_*.sql instead.

ALTER TABLE sessions ADD COLUMN long_lived boolean NOT NULL DEFAULT false;
