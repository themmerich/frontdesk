-- A tenant's own Anthropic access. Optional: without a key the platform's own
-- credentials are used, which is what every tenant starts on.
--
-- Its own table rather than a column on tenant_triage_settings: those knobs
-- steer the triage, this is a credential that every AI step will use once
-- answer drafts follow (roadmap step 4).
CREATE TABLE tenant_ai_settings (
    id         UUID        PRIMARY KEY,
    tenant_id  UUID        NOT NULL UNIQUE REFERENCES tenants (id) ON DELETE CASCADE,
    -- Encrypted by the application before it ever reaches this column; the
    -- stored value carries the marker that says so.
    api_key    TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
