-- A case becomes a conversation: the mail that opened it, every mail that
-- followed, and every reply that went out, one row each. The case keeps the
-- facts about its opening mail for the list and the triage; the bodies and
-- the sent reply move here.
CREATE TABLE case_messages (
    id           UUID        PRIMARY KEY,
    case_id      UUID        NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
    position     INTEGER     NOT NULL,
    direction    TEXT        NOT NULL,
    message_id   TEXT,
    sender       TEXT        NOT NULL,
    recipient    TEXT,
    subject      TEXT        NOT NULL,
    body_text    TEXT        NOT NULL,
    body_html    TEXT,
    occurred_at  TIMESTAMPTZ NOT NULL,
    size_bytes   BIGINT      NOT NULL,
    sent_by_name TEXT
);

CREATE INDEX case_messages_case_id_position_idx ON case_messages (case_id, position);
-- What a customer's reply refers to in In-Reply-To and References.
CREATE INDEX case_messages_message_id_idx ON case_messages (message_id);

-- Every case's opening mail, as it stands on the case today.
INSERT INTO case_messages (id, case_id, position, direction, message_id, sender, recipient, subject, body_text,
                           body_html, occurred_at, size_bytes)
SELECT gen_random_uuid(), id, 0, 'INCOMING', message_id, sender, recipient, subject, body_text, body_html,
       received_at, size_bytes
FROM cases;

-- The reply that went out, where one did: from the mailbox, in the name of
-- whoever pressed the button, with the subject the reply carried.
INSERT INTO case_messages (id, case_id, position, direction, message_id, sender, recipient, subject, body_text,
                           occurred_at, size_bytes, sent_by_name)
SELECT gen_random_uuid(), c.id, 1, 'OUTGOING', c.sent_message_id, COALESCE(s.username, ''), c.sender,
       CASE WHEN c.subject ~* '^\s*(re|aw)\s*:' THEN c.subject ELSE 'Re: ' || c.subject END,
       COALESCE(c.draft_text, ''), c.sent_at, 0,
       NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '')
FROM cases c
         LEFT JOIN tenant_mail_settings s ON s.tenant_id = c.tenant_id
         LEFT JOIN users u ON u.id = c.sent_by_user_id
WHERE c.sent_at IS NOT NULL;

-- Attachments belong to the mail they came with; everything stored so far came
-- with the opening mail.
ALTER TABLE case_attachments
    ADD COLUMN message_id UUID REFERENCES case_messages (id) ON DELETE CASCADE;

UPDATE case_attachments a
SET message_id = m.id
FROM case_messages m
WHERE m.case_id = a.case_id
  AND m.position = 0;

ALTER TABLE case_attachments
    ALTER COLUMN message_id SET NOT NULL;

-- When the conversation last moved: the list sorts and groups by it.
ALTER TABLE cases
    ADD COLUMN last_message_at TIMESTAMPTZ;

UPDATE cases
SET last_message_at = GREATEST(received_at, COALESCE(sent_at, received_at));

ALTER TABLE cases
    ALTER COLUMN last_message_at SET NOT NULL;

-- A sent reply is a message now, not a frozen draft: the box is empty for the
-- next one.
UPDATE cases
SET draft_text           = NULL,
    draft_generated_text = NULL,
    draft_generated_at   = NULL,
    draft_updated_at     = NULL
WHERE sent_at IS NOT NULL;

ALTER TABLE cases
    DROP COLUMN body_text,
    DROP COLUMN body_html,
    DROP COLUMN sent_at,
    DROP COLUMN sent_by_user_id,
    DROP COLUMN sent_message_id;
