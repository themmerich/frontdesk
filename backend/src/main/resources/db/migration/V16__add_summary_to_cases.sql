-- The triage already asks the model what the sender wants and gets one German
-- sentence back; until now that sentence was thrown away. Keeping it is what
-- turns the inbox from "a mail arrived" into "this is what it is about".
ALTER TABLE cases ADD COLUMN summary TEXT;
