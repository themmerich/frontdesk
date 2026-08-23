-- A company now consists of a headquarters and any number of branches
-- (Filialen). Every tenant gets exactly one headquarters; the tenant's old
-- address and contact columns move onto it. The tenant keeps its identity
-- and branding (name, logo, color, website).
CREATE TABLE branches (
    id              UUID        PRIMARY KEY,
    tenant_id       UUID        NOT NULL REFERENCES tenants (id),
    name            TEXT        NOT NULL,
    is_headquarters BOOLEAN     NOT NULL,
    street          TEXT,
    postal_code     TEXT,
    city            TEXT,
    country         TEXT,
    phone           TEXT,
    fax             TEXT,
    email           TEXT,
    created_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX branches_tenant_id_idx ON branches (tenant_id);

-- Exactly one headquarters per tenant.
CREATE UNIQUE INDEX branches_headquarters_key ON branches (tenant_id) WHERE is_headquarters;

-- The name identifies the site in dropdowns, so it is unique per tenant.
CREATE UNIQUE INDEX branches_name_key ON branches (tenant_id, LOWER(name));

-- Every existing tenant gets its headquarters, carrying over the address and
-- contact data that used to live on the tenant itself.
INSERT INTO branches (id, tenant_id, name, is_headquarters, street, postal_code, city, country, phone, fax, email, created_at)
SELECT gen_random_uuid(), id, name, TRUE, street, postal_code, city, country, phone, fax, email, created_at
FROM tenants;

ALTER TABLE tenants DROP COLUMN street;
ALTER TABLE tenants DROP COLUMN postal_code;
ALTER TABLE tenants DROP COLUMN city;
ALTER TABLE tenants DROP COLUMN country;
ALTER TABLE tenants DROP COLUMN phone;
ALTER TABLE tenants DROP COLUMN fax;
ALTER TABLE tenants DROP COLUMN email;

-- The profile's free-text company becomes a reference to a branch. Old text
-- matching a branch name (usually the company name itself) is carried over;
-- anything else cannot be resolved and starts unset. Deleting a branch later
-- only unsets the assignment, it never blocks on assigned users.
ALTER TABLE users ADD COLUMN branch_id UUID REFERENCES branches (id) ON DELETE SET NULL;
UPDATE users SET branch_id = branches.id
FROM branches
WHERE branches.tenant_id = users.tenant_id AND LOWER(branches.name) = LOWER(users.company);
ALTER TABLE users DROP COLUMN company;
