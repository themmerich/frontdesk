-- The mail as it was written, where it was written in HTML. Kept beside the
-- plain text rather than instead of it: the text is what the triage reads and
-- what a search would look through, the HTML is what a person is shown.
--
-- Null for mails that carry no HTML part at all, and for everything ingested
-- before this migration — those keep showing their plain text.
ALTER TABLE cases ADD COLUMN body_html TEXT;
