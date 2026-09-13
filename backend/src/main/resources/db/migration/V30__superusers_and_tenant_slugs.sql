-- Tenant management, first half: a super-user who stands above the tenants,
-- and a Kennung per tenant that the login asks for.

-- The Kennung: what a person types on the login page to say which tenant
-- they belong to, so the same username may exist in several tenants and
-- nobody's customer list has to be shown before a login. Derived from the
-- name for the tenants that exist, a counter where two names collapse onto
-- the same one; a super-user renames it afterwards if it reads badly.
ALTER TABLE tenants ADD COLUMN slug TEXT;

UPDATE tenants
SET slug = trim(BOTH '-' FROM regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'));

UPDATE tenants SET slug = 'tenant' WHERE slug = '';

WITH numbered AS (SELECT id, row_number() OVER (PARTITION BY slug ORDER BY created_at, id) AS n
                  FROM tenants)
UPDATE tenants t
SET slug = t.slug || '-' || numbered.n
FROM numbered
WHERE numbered.id = t.id
  AND numbered.n > 1;

ALTER TABLE tenants ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX tenants_slug_key ON tenants (slug);

-- A super-user belongs to no tenant: the column may be empty now, and such a
-- row carries the new role. Their usernames are unique among each other, the
-- way tenant users' are within their tenant.
ALTER TABLE users ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'USER', 'SUPERUSER'));
CREATE UNIQUE INDEX users_superuser_username_key ON users (LOWER(username)) WHERE tenant_id IS NULL;

-- Deleting a tenant takes everything of theirs along, so the delete on the
-- Mandanten page is one statement and nothing is left behind to point at a
-- tenant that is gone. The categories, triage and AI settings, and the call
-- log cascade already; these five did not.
ALTER TABLE users
    DROP CONSTRAINT users_tenant_id_fkey,
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;
ALTER TABLE cases
    DROP CONSTRAINT cases_tenant_id_fkey,
    ADD CONSTRAINT cases_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;
ALTER TABLE branches
    DROP CONSTRAINT branches_tenant_id_fkey,
    ADD CONSTRAINT branches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;
ALTER TABLE tenant_mail_settings
    DROP CONSTRAINT tenant_mail_settings_tenant_id_fkey,
    ADD CONSTRAINT tenant_mail_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;
ALTER TABLE tenant_logos
    DROP CONSTRAINT tenant_logos_tenant_id_fkey,
    ADD CONSTRAINT tenant_logos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;
