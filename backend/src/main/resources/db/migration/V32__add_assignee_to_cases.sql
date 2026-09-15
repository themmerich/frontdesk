-- Who has the case. Two people share one mailbox, so "somebody is on it" is a
-- thing the queue has to be able to say. Null means nobody has taken it yet.
--
-- SET NULL rather than a cascade: a case does not disappear with the person who
-- had it. Users are only deactivated today, never deleted, so this is the belt
-- to that braces.
ALTER TABLE cases
    ADD COLUMN assignee_user_id UUID REFERENCES users (id) ON DELETE SET NULL;

-- "My cases" filters on this, on every reload of the list.
CREATE INDEX cases_assignee_user_id_idx ON cases (assignee_user_id);
