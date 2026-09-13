-- Every call to the model, one row each, with the tokens it used and what
-- they were worth (roadmap step 10: usage and cost per tenant). A table of its
-- own rather than columns on cases: a case is called more than once, and a
-- key test has no case at all.
--
-- The case goes to null rather than taking the row with it: the money was
-- spent whether or not the case still exists, and the sums must not shrink
-- when somebody empties the trash. The tenant does take its rows along: a
-- tenant that goes has nobody left to show them to.
--
-- The amount is computed when the call is recorded, from the price table in
-- the configuration, and kept as it was: a later price change does not
-- re-value old calls. Null where the model had no price at the time.
CREATE TABLE ai_calls (
    id            UUID           PRIMARY KEY,
    tenant_id     UUID           NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    case_id       UUID           REFERENCES cases (id) ON DELETE SET NULL,
    kind          TEXT           NOT NULL,
    model         TEXT           NOT NULL,
    input_tokens  BIGINT         NOT NULL,
    output_tokens BIGINT         NOT NULL,
    cost_usd      NUMERIC(12, 6),
    called_at     TIMESTAMPTZ    NOT NULL
);

-- The page asks for a tenant's calls over a stretch of time, nothing else.
CREATE INDEX ai_calls_tenant_id_called_at_idx ON ai_calls (tenant_id, called_at);
