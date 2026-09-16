-- How far each person has read the bell. The notifications themselves are a
-- query over the trail, not a table: case_events already records who was handed
-- a case and when a customer wrote again, and cases.assignee_user_id says whose
-- case it is. What the trail cannot hold is what each person has already seen.
--
-- One moment per person rather than a row per notification: the question the
-- bell answers is "is there something new since I last looked".
ALTER TABLE users
    ADD COLUMN notifications_seen_at TIMESTAMPTZ;

-- Nobody is greeted by a badge counting everything that happened before the
-- bell existed.
UPDATE users SET notifications_seen_at = now();
