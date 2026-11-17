-- v1.1 A3: archive a template (SPEC-template-store.md "v1.1"). NULL = active; existing templates stay active.
-- Never edit this file after it has run anywhere: add 0007_*.sql instead.

ALTER TABLE templates
    ADD COLUMN archived_at timestamptz,
    ADD COLUMN archived_by text;
