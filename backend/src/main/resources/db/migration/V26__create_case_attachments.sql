-- What was attached to a mail, one row per part. A table of its own rather than
-- columns on cases: the case row is loaded for every list and every detail, and
-- the bytes must never travel along. Deleting a case for good takes its
-- attachments with it, so the purge needs to know nothing about them.
CREATE TABLE case_attachments (
    id           UUID    PRIMARY KEY,
    case_id      UUID    NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
    position     INTEGER NOT NULL,
    file_name    TEXT    NOT NULL,
    content_type TEXT    NOT NULL,
    size_bytes   BIGINT  NOT NULL,
    -- The part's Content-ID, without the angle brackets, where it has one: the
    -- HTML body refers to inline pictures by it.
    content_id   TEXT,
    -- Whether the part belongs into the HTML body (a signature logo) rather
    -- than into the list of attachments (an invoice).
    inline       BOOLEAN NOT NULL,
    content      BYTEA   NOT NULL
);

CREATE INDEX case_attachments_case_id_idx ON case_attachments (case_id);
