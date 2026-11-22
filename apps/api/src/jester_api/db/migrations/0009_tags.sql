-- v1.11 (SPEC-template-store.md, SPEC-render-service.md "v1.11"): tags on templates and issued documents, plus a colour per tag name.
-- Existing rows get the empty set. Never edit this file after it has run anywhere: add 0010_*.sql instead.

ALTER TABLE templates ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE documents ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX templates_tags ON templates USING gin (tags);
CREATE INDEX documents_tags ON documents USING gin (tags);

-- no row = gray; the palette itself lives in code (jester_api.tags.COLORS)
CREATE TABLE tag_colors (
    tag   text PRIMARY KEY,
    color text NOT NULL
);
