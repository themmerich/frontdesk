-- The tenant's brand color (hex #RRGGBB). It becomes the app's default primary
-- color for the tenant's users; a user's own theme choice still wins.
ALTER TABLE tenants
    ADD COLUMN primary_color TEXT;
