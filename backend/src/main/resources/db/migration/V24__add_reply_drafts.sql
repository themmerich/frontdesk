-- Answer drafts (roadmap step 4). One draft per case, kept twice: the text as
-- the model delivered it, and the text as a person left it. The first says how
-- good the model was, the second is what step 5 will send. Both null until a
-- draft exists; a person may write one without the model, and then only the
-- current text and its moment are set.
ALTER TABLE cases ADD COLUMN draft_generated_text TEXT;
ALTER TABLE cases ADD COLUMN draft_text TEXT;
ALTER TABLE cases ADD COLUMN draft_generated_at TIMESTAMPTZ;
ALTER TABLE cases ADD COLUMN draft_updated_at TIMESTAMPTZ;

-- What the tenant tells the model about its replies, and what is put under
-- every one of them. The signature is appended deterministically after the
-- answer rather than handed to the model: a signature is not something to
-- paraphrase.
ALTER TABLE tenant_triage_settings ADD COLUMN reply_signature TEXT NOT NULL DEFAULT '';
ALTER TABLE tenant_triage_settings ADD COLUMN reply_instructions TEXT NOT NULL DEFAULT '';
