-- Configuration for the triage (roadmap step 2), which sorts every incoming
-- case into a tier. The split is deliberate: the AI answers what kind of mail
-- this is, a deterministic rule decides what happens with it. That rule is the
-- tier column below, so changing a tenant's policy never means touching a
-- prompt.
CREATE TABLE case_categories (
    id          UUID        PRIMARY KEY,
    -- Configuration has no life of its own: it goes when the tenant goes.
    tenant_id   UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    -- Stable identifier the model returns; matching on the free-text name would
    -- break on every rewording.
    code        TEXT        NOT NULL,
    name        TEXT        NOT NULL,
    -- Goes into the prompt verbatim: this is what tells the model when the
    -- category applies.
    description TEXT        NOT NULL,
    tier        TEXT        NOT NULL CHECK (tier IN ('AUTOMATIC', 'DRAFT', 'MANUAL')),
    sort_order  INT         NOT NULL,
    active      BOOLEAN     NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX case_categories_tenant_id_idx ON case_categories (tenant_id);

-- Both identify the category within its tenant: the code towards the model,
-- the name towards the people reading the list.
CREATE UNIQUE INDEX case_categories_code_key ON case_categories (tenant_id, code);
CREATE UNIQUE INDEX case_categories_name_key ON case_categories (tenant_id, LOWER(name));

-- The knobs that apply to the whole triage rather than to a single category.
CREATE TABLE tenant_triage_settings (
    id                   UUID         PRIMARY KEY,
    tenant_id            UUID         NOT NULL UNIQUE REFERENCES tenants (id) ON DELETE CASCADE,
    -- Free text appended to the system prompt, for a tenant's own peculiarities
    -- ("mails from @supplier-xy.example are always order confirmations").
    extra_instructions   TEXT         NOT NULL,
    -- Below this, a case drops one tier: rather one draft too many than a wrong
    -- automatic answer. What the model reports is a self-assessment, not a
    -- calibrated probability, so this needs tuning against real mails.
    confidence_threshold NUMERIC(3,2) NOT NULL CHECK (confidence_threshold >= 0 AND confidence_threshold <= 1),
    created_at           TIMESTAMPTZ  NOT NULL
);

-- The rows themselves are not seeded here: the defaults live in Java
-- (TriageDefaults) and are applied by the TriageProvisioner, which also covers
-- tenants created after this migration ran.
