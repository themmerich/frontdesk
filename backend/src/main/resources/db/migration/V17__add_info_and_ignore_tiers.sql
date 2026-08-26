-- Two tiers for the mail that needs no answer at all. Until now everything
-- landed on one of three, so an order confirmation and an angry complaint sat
-- in the same queue — and advertising clogged the very column that is supposed
-- to hold what needs a person.
--
--   automatic  needs an answer, frontdesk writes it
--   draft      needs an answer, frontdesk prepares it, a person approves
--   manual     needs an answer, a person writes it
--   info       needs no answer, but somebody should have seen it
--   ignore     needs no answer and nobody has to read it
ALTER TABLE case_categories DROP CONSTRAINT case_categories_tier_check;
ALTER TABLE case_categories ADD CONSTRAINT case_categories_tier_check
    CHECK (tier IN ('AUTOMATIC', 'DRAFT', 'MANUAL', 'INFO', 'IGNORE'));

ALTER TABLE cases DROP CONSTRAINT cases_tier_check;
ALTER TABLE cases ADD CONSTRAINT cases_tier_check
    CHECK (tier IN ('AUTOMATIC', 'DRAFT', 'MANUAL', 'INFO', 'IGNORE'));

-- Advertising was only ever manual for lack of anywhere better. A tenant who
-- deliberately moved it somewhere else keeps that choice.
UPDATE case_categories SET tier = 'IGNORE' WHERE code = 'MARKETING' AND tier = 'MANUAL';

-- The tier that was missing needs a category to land on. Only for tenants that
-- already have categories: an empty one is the provisioner's job, and a single
-- row here would stop it from seeding the rest.
INSERT INTO case_categories (id, tenant_id, code, name, description, tier, sort_order, active, created_at)
SELECT gen_random_uuid(), t.id, 'ORDER_CONFIRMATION', 'Bestätigung / Avis',
       'Bestätigung einer Bestellung, Versand- oder Liefermitteilung, Terminbestätigung. '
       || 'Reine Mitteilung ohne Frage — es ist keine Antwort nötig.',
       'INFO',
       (SELECT COALESCE(MAX(c2.sort_order), -1) + 1 FROM case_categories c2 WHERE c2.tenant_id = t.id),
       TRUE, now()
FROM tenants t
WHERE EXISTS (SELECT 1 FROM case_categories c WHERE c.tenant_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM case_categories c WHERE c.tenant_id = t.id AND c.code = 'ORDER_CONFIRMATION');
