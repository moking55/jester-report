-- studio themes (SPEC-studio.md assumption 2). Never edit after it has run anywhere.
-- Built-in themes (classic, suriyan) live in code, not here, so they cannot be changed or deleted.

CREATE TABLE themes (
    id         uuid PRIMARY KEY,
    name       text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 40),
    tokens     jsonb NOT NULL,  -- checked against the token allow-list before every write
    created_by text,
    updated_at timestamptz NOT NULL
);

-- one row: a built-in id or a themes.id as text (no FK, built-ins are not rows)
CREATE TABLE theme_default (
    only_row boolean PRIMARY KEY DEFAULT true CHECK (only_row),
    theme_id text NOT NULL DEFAULT 'classic'
);
INSERT INTO theme_default (only_row) VALUES (true);
