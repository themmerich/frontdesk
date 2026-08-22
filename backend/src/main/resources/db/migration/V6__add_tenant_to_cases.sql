-- Every case belongs to a tenant: the poller reads each tenant's own mailbox
-- and attributes what it ingests. Existing rows predate multi-tenancy; they
-- are assigned to the only tenant if there is exactly one (the dev database),
-- otherwise they are unattributable and dropped. No production data exists yet.
ALTER TABLE cases ADD COLUMN tenant_id UUID REFERENCES tenants (id);

UPDATE cases SET tenant_id = (SELECT id FROM tenants) WHERE (SELECT COUNT(*) FROM tenants) = 1;
DELETE FROM cases WHERE tenant_id IS NULL;

ALTER TABLE cases ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX cases_tenant_id_idx ON cases (tenant_id);

-- The duplicate guard becomes per tenant: the same Message-ID may legitimately
-- arrive in two tenants' inboxes (e.g. a mail sent to both).
DROP INDEX cases_message_id_key;
CREATE UNIQUE INDEX cases_tenant_message_id_key ON cases (tenant_id, message_id) WHERE message_id IS NOT NULL;
