-- template-store schema (SPEC-template-store.md "Data model").
-- Never edit this file after it has run anywhere: add 0002_*.sql instead.

CREATE TABLE blobs (
    sha256       text PRIMARY KEY,
    content_type text NOT NULL,
    size         integer NOT NULL CHECK (size >= 0),
    font_family  text,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE templates (
    id                text PRIMARY KEY,
    name              text NOT NULL,
    published_version integer,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE drafts (
    template_id      text PRIMARY KEY REFERENCES templates (id),
    revision         integer NOT NULL CHECK (revision >= 1),
    based_on_version integer,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       text NOT NULL
);

CREATE TABLE draft_files (
    template_id text NOT NULL REFERENCES drafts (template_id),
    name        text NOT NULL,
    content     text NOT NULL,
    sha256      text NOT NULL,
    PRIMARY KEY (template_id, name)
);

CREATE TABLE draft_assets (
    template_id text NOT NULL REFERENCES drafts (template_id),
    name        text NOT NULL,
    blob_sha256 text NOT NULL REFERENCES blobs (sha256),
    PRIMARY KEY (template_id, name)
);

CREATE TABLE versions (
    template_id  text NOT NULL REFERENCES templates (id),
    version      integer NOT NULL CHECK (version >= 1),
    sha256       text NOT NULL,
    note         text,
    published_at timestamptz NOT NULL DEFAULT now(),
    published_by text NOT NULL,
    PRIMARY KEY (template_id, version)
);

ALTER TABLE templates
    ADD FOREIGN KEY (id, published_version) REFERENCES versions (template_id, version);

CREATE TABLE version_files (
    template_id text NOT NULL,
    version     integer NOT NULL,
    name        text NOT NULL,
    content     text NOT NULL,
    sha256      text NOT NULL,
    PRIMARY KEY (template_id, version, name),
    FOREIGN KEY (template_id, version) REFERENCES versions (template_id, version)
);

CREATE TABLE version_assets (
    template_id text NOT NULL,
    version     integer NOT NULL,
    name        text NOT NULL,
    blob_sha256 text NOT NULL REFERENCES blobs (sha256),
    PRIMARY KEY (template_id, version, name),
    FOREIGN KEY (template_id, version) REFERENCES versions (template_id, version)
);

-- Published versions are insert-only, enforced by the database and not only by the code.
CREATE FUNCTION jester_reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'published versions cannot be changed (table %)', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END
$$;

CREATE TRIGGER versions_insert_only BEFORE UPDATE OR DELETE ON versions
    FOR EACH ROW EXECUTE FUNCTION jester_reject_change();
CREATE TRIGGER versions_no_truncate BEFORE TRUNCATE ON versions
    FOR EACH STATEMENT EXECUTE FUNCTION jester_reject_change();
CREATE TRIGGER version_files_insert_only BEFORE UPDATE OR DELETE ON version_files
    FOR EACH ROW EXECUTE FUNCTION jester_reject_change();
CREATE TRIGGER version_files_no_truncate BEFORE TRUNCATE ON version_files
    FOR EACH STATEMENT EXECUTE FUNCTION jester_reject_change();
CREATE TRIGGER version_assets_insert_only BEFORE UPDATE OR DELETE ON version_assets
    FOR EACH ROW EXECUTE FUNCTION jester_reject_change();
CREATE TRIGGER version_assets_no_truncate BEFORE TRUNCATE ON version_assets
    FOR EACH STATEMENT EXECUTE FUNCTION jester_reject_change();
