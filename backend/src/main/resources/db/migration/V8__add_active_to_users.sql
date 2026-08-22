-- Users can be deactivated by their tenant's admin; everyone existing stays active.
ALTER TABLE users
    ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;
