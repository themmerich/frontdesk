-- When a person took note of a case and does not want to see it in the review
-- again. Kept as the moment rather than a flag: "since when" is the question
-- that comes up as soon as two people work the same inbox, and a timestamp
-- answers it while a boolean cannot. Null means still to be looked at, which is
-- what every case ingested before this migration is.
--
-- Deliberately not a deletion: taking note is not throwing away, and the case
-- stays in the inbox where it can be found again.
ALTER TABLE cases ADD COLUMN handled_at TIMESTAMPTZ;
