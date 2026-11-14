-- auth schema (SPEC-auth.md "Data model"). Never edit after it has run anywhere: add a new file instead.

CREATE TABLE users (
    id            uuid PRIMARY KEY,
    username      text NOT NULL,
    password_hash text NOT NULL,
    created_at    timestamptz NOT NULL,
    last_login_at timestamptz
);
CREATE UNIQUE INDEX users_username_lower ON users (lower(username));

CREATE TABLE sessions (
    token_sha256 text PRIMARY KEY,
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at   timestamptz NOT NULL,
    expires_at   timestamptz NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE api_keys (
    id            uuid PRIMARY KEY,
    name          text NOT NULL,
    prefix        text NOT NULL,
    secret_sha256 text NOT NULL UNIQUE,
    created_at    timestamptz NOT NULL,
    created_by    text NOT NULL,
    last_used_at  timestamptz,
    revoked_at    timestamptz
);

-- at most one row: the token printed to the api log while no user exists
CREATE TABLE setup_tokens (
    token_sha256 text PRIMARY KEY,
    created_at   timestamptz NOT NULL
);

CREATE TABLE login_failures (
    username_lower text NOT NULL,
    client_ip      text NOT NULL,
    failed_at      timestamptz NOT NULL
);
CREATE INDEX login_failures_key ON login_failures (username_lower, client_ip, failed_at);
