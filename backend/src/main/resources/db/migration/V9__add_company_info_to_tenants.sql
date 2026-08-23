-- Company info maintained by the tenant's admins; name and logo show app-wide
-- in the sidebar. All fields are optional — only the name existed before.
ALTER TABLE tenants
    ADD COLUMN street      TEXT,
    ADD COLUMN postal_code TEXT,
    ADD COLUMN city        TEXT,
    ADD COLUMN country     TEXT,
    ADD COLUMN phone       TEXT,
    ADD COLUMN fax         TEXT,
    ADD COLUMN email       TEXT,
    ADD COLUMN website     TEXT;

-- The logo lives in its own table, like user_avatars: the tenant row travels
-- with almost every request, the image must not.
CREATE TABLE tenant_logos (
    id           UUID        PRIMARY KEY,
    tenant_id    UUID        NOT NULL UNIQUE REFERENCES tenants (id),
    image        BYTEA       NOT NULL,
    content_type TEXT        NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL
);
