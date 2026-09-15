-- Whether a mail announced itself as automated bulk: a mailing list, a
-- notification, an auto-reply. Read at ingest from headers that are gone by the
-- time the mail is stored, so the fact is kept here. The conversation matching
-- uses it to refuse such a mail a case it never wrote to. A cheaper path
-- through the triage is what it is meant for next.
ALTER TABLE case_messages
    ADD COLUMN bulk BOOLEAN NOT NULL DEFAULT FALSE;
