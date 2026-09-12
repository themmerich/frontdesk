-- Roadmap step 5: a reply goes out, and what happened to a case is written down.

-- The reply as it went out: when, by whom, and under which Message-ID, so a
-- customer's next mail can be threaded onto it later. The text itself is the
-- draft, frozen from here on.
ALTER TABLE cases
    ADD COLUMN sent_at         TIMESTAMPTZ,
    ADD COLUMN sent_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
    ADD COLUMN sent_message_id TEXT;

-- Everything a case has been through, one row per step. The actor's name is
-- copied at the time: the trail has to outlive the account. Details are a
-- small JSON object whose keys depend on the type; kept as text, so the
-- database never has to know their shape.
CREATE TABLE case_events (
    id            UUID        PRIMARY KEY,
    case_id       UUID        NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
    occurred_at   TIMESTAMPTZ NOT NULL,
    type          TEXT        NOT NULL,
    actor_user_id UUID        REFERENCES users (id) ON DELETE SET NULL,
    actor_name    TEXT,
    details       TEXT        NOT NULL DEFAULT '{}'
);

CREATE INDEX case_events_case_id_occurred_at_idx ON case_events (case_id, occurred_at);

-- What can be said about the cases that already exist, from the moments they
-- carry. Nobody was written down back then, so these have no actor.
INSERT INTO case_events (id, case_id, occurred_at, type, details)
SELECT gen_random_uuid(), id, ingested_at, 'INGESTED',
       json_build_object('sender', sender, 'messageId', message_id)::text
FROM cases;

INSERT INTO case_events (id, case_id, occurred_at, type, details)
SELECT gen_random_uuid(), c.id, c.triaged_at, 'TRIAGED',
       json_build_object('tier', lower(c.tier), 'confidence', c.confidence, 'categoryName', cc.name)::text
FROM cases c
         LEFT JOIN case_categories cc ON cc.id = c.category_id
WHERE c.triaged_at IS NOT NULL;

INSERT INTO case_events (id, case_id, occurred_at, type)
SELECT gen_random_uuid(), id, handled_at, 'HANDLED'
FROM cases
WHERE handled_at IS NOT NULL;

INSERT INTO case_events (id, case_id, occurred_at, type)
SELECT gen_random_uuid(), id, deleted_at, 'TRASHED'
FROM cases
WHERE deleted_at IS NOT NULL;
