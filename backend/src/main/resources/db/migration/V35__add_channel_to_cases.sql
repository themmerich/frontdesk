-- Where a case came in. Until now every case was a mail, and the column said so by being absent:
-- nothing in the model could tell a request that arrived by phone from one that arrived by mail,
-- and the reply path would happily have posted an answer to whatever stood in the sender column.
--
-- Everything that exists came in through the mailbox, so MAIL is both the backfill and the
-- default: a row written by the ingest keeps saying what it always said.
ALTER TABLE cases
    ADD COLUMN channel TEXT NOT NULL DEFAULT 'MAIL';
