-- Which of the tenant's addresses the mail was actually sent to (info@,
-- rechnung@, ...). A tenant has one mailbox today, but aliases already deliver
-- several addresses into it, and the reply has to go out from the address the
-- customer wrote to. Null for rows ingested before this migration and for mails
-- that carry no usable recipient header.
ALTER TABLE cases ADD COLUMN recipient TEXT;
