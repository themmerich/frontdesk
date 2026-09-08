-- When somebody threw the case away. It then sits in the trash, out of the
-- inbox and out of the archive, until it is deleted for good or put back.
--
-- Deleting used to remove the row on the spot, which is a mail nobody can get
-- back once the mailbox has marked it read. The row now stays until a second,
-- deliberate deletion; null means it was never thrown away, which is what every
-- case ingested before this migration is.
ALTER TABLE cases ADD COLUMN deleted_at TIMESTAMPTZ;
