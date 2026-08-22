package de.prime_ux.backend.mailsettings;

/**
 * How a tenant's mailbox is configured: GREENMAIL uses the fixed local dev server from
 * compose.yaml, CUSTOM is a real IMAP/SMTP server with free-form connection settings.
 */
public enum MailSettingsMode {
	GREENMAIL, CUSTOM
}
