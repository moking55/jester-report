-- render-service run history (SPEC-render-service.md assumption 6). Never edit after it has run anywhere.
-- No params, data or PDFs are stored: only their sha256 in provenance.

CREATE TABLE runs (
    id             text PRIMARY KEY,  -- time-ordered, so it doubles as the paging cursor
    kind           text NOT NULL CHECK (kind IN ('render', 'preview')),
    template_id    text NOT NULL,     -- no FK: failed runs may name a template that does not exist
    version        integer,
    draft_revision integer,
    caller_type    text NOT NULL CHECK (caller_type IN ('user', 'api-key')),
    caller_id      text NOT NULL,
    caller_name    text,
    request_id     text,
    status         text NOT NULL CHECK (status IN ('succeeded', 'failed')),
    error_code     text,
    pages          integer,
    duration_ms    integer,
    created_at     timestamptz NOT NULL,
    provenance     jsonb NOT NULL DEFAULT '{}',
    problems       jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX runs_template ON runs (template_id, id DESC);

-- counts runs across processes, so retention is applied every 100 runs without a background job
CREATE SEQUENCE run_counter;

-- one row; days NULL means keep for ever (the default: nothing is deleted until someone sets a policy)
CREATE TABLE run_retention (
    only_row boolean PRIMARY KEY DEFAULT true CHECK (only_row),
    days     integer CHECK (days >= 1),
    set_by   text,
    set_at   timestamptz
);
INSERT INTO run_retention (only_row) VALUES (true);
