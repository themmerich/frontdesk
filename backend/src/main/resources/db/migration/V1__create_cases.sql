-- A case ("Vorgang") is the central entity: every ingested mail becomes one
-- and later travels through triage, drafting, and approval.
CREATE TABLE cases (
    id             UUID        PRIMARY KEY,
    message_id     TEXT,
    sender         TEXT        NOT NULL,
    subject        TEXT        NOT NULL,
    body_text      TEXT        NOT NULL,
    received_at    TIMESTAMPTZ NOT NULL,
    ingested_at    TIMESTAMPTZ NOT NULL
);

-- Guards against ingesting the same mail twice; partial because the RFC does
-- not guarantee a Message-ID header on every mail.
CREATE UNIQUE INDEX cases_message_id_key ON cases (message_id) WHERE message_id IS NOT NULL;
