-- The reply signature moves from the triage settings to the company, where it
-- belongs: it is about who the business is, not about how mail is sorted. What
-- a tenant had entered so far comes along, then the old column goes, so nothing
-- is lost and nothing exists twice.
ALTER TABLE tenants ADD COLUMN reply_signature TEXT NOT NULL DEFAULT '';

UPDATE tenants t
SET reply_signature = s.reply_signature
FROM tenant_triage_settings s
WHERE s.tenant_id = t.id;

ALTER TABLE tenant_triage_settings DROP COLUMN reply_signature;

-- The signature is a template now, with placeholders for the person who writes
-- the reply. The scheduler writes replies with nobody at the desk; this is
-- whose data it signs them with. Optional, and gone with the user.
ALTER TABLE tenants ADD COLUMN signature_user_id UUID REFERENCES users (id) ON DELETE SET NULL;

-- The job title a signature names under the person: "Projektleiterin".
ALTER TABLE users ADD COLUMN position TEXT;
