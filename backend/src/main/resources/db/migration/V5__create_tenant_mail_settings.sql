-- Mailbox configuration per tenant: which IMAP inbox the poller reads for this
-- tenant, and later (roadmap step 5) which SMTP server sends its replies. The
-- GREENMAIL mode carries the fixed local dev values; CUSTOM is a real server.
CREATE TABLE tenant_mail_settings (
    id              UUID        PRIMARY KEY,
    tenant_id       UUID        NOT NULL UNIQUE REFERENCES tenants (id),
    mode            TEXT        NOT NULL CHECK (mode IN ('GREENMAIL', 'CUSTOM')),
    imap_host       TEXT        NOT NULL,
    imap_port       INT         NOT NULL,
    imap_tls        BOOLEAN     NOT NULL,
    smtp_host       TEXT        NOT NULL,
    smtp_port       INT         NOT NULL,
    smtp_tls        BOOLEAN     NOT NULL,
    username        TEXT        NOT NULL,
    -- @ToDo: encrypt mailbox credentials at rest before the first real customer.
    password        TEXT        NOT NULL,
    folder          TEXT        NOT NULL,
    polling_enabled BOOLEAN     NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL
);
