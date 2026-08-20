-- Attachment flag and raw mail size for the case list. Defaults cover rows
-- ingested before this migration.
ALTER TABLE cases
    ADD COLUMN has_attachments BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN size_bytes      BIGINT  NOT NULL DEFAULT 0;
