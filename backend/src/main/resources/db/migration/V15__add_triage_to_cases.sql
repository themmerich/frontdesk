-- The triage's verdict on a case (roadmap step 2). All four columns are null
-- until the triage ran, which is also how the runner finds its work: a case
-- with tier IS NULL has not been looked at yet.
ALTER TABLE cases ADD COLUMN category_id UUID REFERENCES case_categories (id) ON DELETE SET NULL;
ALTER TABLE cases ADD COLUMN tier        TEXT CHECK (tier IN ('AUTOMATIC', 'DRAFT', 'MANUAL'));
-- What the model reported about its own certainty. A self-assessment, not a
-- calibrated probability — kept so the threshold can be tuned against reality.
ALTER TABLE cases ADD COLUMN confidence  NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1);
ALTER TABLE cases ADD COLUMN triaged_at  TIMESTAMPTZ;

-- The runner's query: the untriaged cases of a tenant, oldest first.
CREATE INDEX cases_untriaged_idx ON cases (tenant_id, received_at) WHERE tier IS NULL;

-- Deleting a category leaves the cases classified as such without one; the
-- tier they were given stays, because it is what the board already showed.
CREATE INDEX cases_category_id_idx ON cases (category_id);
