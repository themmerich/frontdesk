package de.prime_ux.backend.mailsettings;

/** The tenant's mailbox configuration as the settings page sees it — the password never leaves the server. */
public record MailSettingsResponse(
		MailSettingsMode mode,
		String imapHost,
		int imapPort,
		boolean imapTls,
		String smtpHost,
		int smtpPort,
		boolean smtpTls,
		String username,
		String folder,
		boolean pollingEnabled) {

	static MailSettingsResponse from(TenantMailSettings settings) {
		return new MailSettingsResponse(settings.getMode(), settings.getImapHost(), settings.getImapPort(),
				settings.isImapTls(), settings.getSmtpHost(), settings.getSmtpPort(), settings.isSmtpTls(),
				settings.getUsername(), settings.getFolder(), settings.isPollingEnabled());
	}
}
