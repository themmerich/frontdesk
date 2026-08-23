-- The login name becomes a free-form username: any string is allowed, it only
-- has to be unique within its tenant. The mail address turns into plain
-- contact data alongside the other new profile fields.
ALTER TABLE users RENAME COLUMN email TO username;
DROP INDEX users_email_key;
-- Unique per tenant only. The login still resolves the username globally and
-- rejects cross-tenant duplicates until it learns to select a tenant.
CREATE UNIQUE INDEX users_username_key ON users (tenant_id, LOWER(username));

-- The display name splits at the first space into first and last name; a name
-- without a space becomes just the last name.
ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;
UPDATE users SET
    first_name = CASE WHEN position(' ' IN display_name) = 0 THEN ''
                      ELSE split_part(display_name, ' ', 1) END,
    last_name  = CASE WHEN position(' ' IN display_name) = 0 THEN display_name
                      ELSE substring(display_name FROM position(' ' IN display_name) + 1) END;
ALTER TABLE users ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE users ALTER COLUMN last_name SET NOT NULL;
ALTER TABLE users DROP COLUMN display_name;

-- New optional profile fields. Company stays free text until companies grow
-- branches — then it becomes a reference to a headquarters or branch.
ALTER TABLE users ADD COLUMN birth_date DATE;
ALTER TABLE users ADD COLUMN joined_at  DATE;
ALTER TABLE users ADD COLUMN company    TEXT;
ALTER TABLE users ADD COLUMN email      TEXT;
ALTER TABLE users ADD COLUMN phone      TEXT;
ALTER TABLE users ADD COLUMN fax       TEXT;
