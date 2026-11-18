-- v1.5 (SPEC-render-service.md): documents a successful /v1/render produced. Never edit after it has run anywhere.
-- The PDF itself is in object storage at documents/<run_id>; the row goes with its run (retention).

CREATE TABLE documents (
    run_id      text PRIMARY KEY REFERENCES runs (id) ON DELETE CASCADE,
    template_id text NOT NULL,
    filename    text NOT NULL,
    params      json NOT NULL,   -- json, not jsonb: jsonb rejects "\u0000", which callers may send
    data        json NOT NULL,
    pdf_size    integer NOT NULL,
    pdf_sha256  text NOT NULL
);
CREATE INDEX documents_template ON documents (template_id, run_id DESC);
