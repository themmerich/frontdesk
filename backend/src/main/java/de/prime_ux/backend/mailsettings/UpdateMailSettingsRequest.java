package de.prime_ux.backend.mailsettings;

import jakarta.validation.constraints.NotNull;

/**
 * What the settings page submits. In GREENMAIL mode only the polling switch is used; the
 * connection fields are ignored and the fixed dev values apply. In CUSTOM mode the connection
 * fields are required (checked in the controller — bean validation cannot express the
 * mode-dependency); a blank password means "keep the stored one".
 */
record UpdateMailSettingsRequest(
		@NotNull MailSettingsMode mode,
		String imapHost,
		Integer imapPort,
		Boolean imapTls,
		String smtpHost,
		Integer smtpPort,
		Boolean smtpTls,
		String username,
		String password,
		String folder,
		@NotNull Boolean pollingEnabled) {
}
