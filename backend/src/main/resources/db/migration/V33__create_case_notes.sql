-- What people write to each other about a case, and never to the customer. A
-- table rather than a column on the case: two people share one inbox, so a note
-- has an author and a time, and there are several of them. One text field would
-- be a wiki page two colleagues overwrite.
--
-- The author's name is copied when the note is written, the way the trail copies
-- it: the account may go, what was said stays.
CREATE TABLE case_notes (
    id             UUID        PRIMARY KEY,
    case_id        UUID        NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
    author_user_id UUID        REFERENCES users (id) ON DELETE SET NULL,
    author_name    TEXT        NOT NULL,
    text           TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL,
    -- Set when a note is edited; the page then says so.
    updated_at     TIMESTAMPTZ
);

-- The detail page reads a case's notes oldest first.
CREATE INDEX case_notes_case_id_created_at_idx ON case_notes (case_id, created_at);
