-- How the sidebar brands the tenant: small logo beside the name, or one large
-- logo filling the whole brand area.
ALTER TABLE tenants
    ADD COLUMN logo_display TEXT NOT NULL DEFAULT 'WITH_NAME'
        CHECK (logo_display IN ('WITH_NAME', 'LOGO_ONLY'));
