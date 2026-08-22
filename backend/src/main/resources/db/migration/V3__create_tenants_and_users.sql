-- Multi-tenancy foundation: every customer is a tenant, every user belongs to
-- exactly one tenant. Cases get their tenant reference in a later migration.
CREATE TABLE tenants (
    id         UUID        PRIMARY KEY,
    name       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE users (
    id            UUID        PRIMARY KEY,
    tenant_id     UUID        NOT NULL REFERENCES tenants (id),
    email         TEXT        NOT NULL,
    display_name  TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    role          TEXT        NOT NULL CHECK (role IN ('ADMIN', 'USER')),
    created_at    TIMESTAMPTZ NOT NULL
);

-- Login identifies the user (and thereby the tenant) by mail address alone,
-- so it has to be unique across all tenants, regardless of case.
CREATE UNIQUE INDEX users_email_key ON users (LOWER(email));

CREATE INDEX users_tenant_id_idx ON users (tenant_id);
