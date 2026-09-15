package de.prime_ux.backend.mailsettings;

import java.util.Properties;

/**
 * How a connection to a tenant's outgoing mail server is set up. Lives with the mailbox
 * configuration rather than with the one thing that sends, because the connection test has to
 * build the same connection the send does — a probe over different properties would test a
 * configuration that is not the one that will carry the mail.
 *
 * <p>Takes the values rather than the stored settings: the test works on what stands in the form,
 * which may not be saved yet.
 */
public final class SmtpProperties {

	private static final String TIMEOUT_MILLIS = "10000";

	/** Port 465 is SMTP over TLS from the first byte, before anything is said. */
	private static final int IMPLICIT_TLS_PORT = 465;

	private SmtpProperties() {
	}

	/**
	 * Port 465 is SMTP over TLS from the first byte; everything else is plain SMTP that upgrades
	 * with STARTTLS when the settings ask for TLS — which is what port 587 and "TLS verwenden"
	 * mean at every common provider.
	 */
	public static Properties of(String host, int port, boolean tls) {
		boolean implicitTls = port == IMPLICIT_TLS_PORT;
		String protocol = protocolFor(port);
		Properties properties = new Properties();
		properties.put("mail.transport.protocol", protocol);
		properties.put("mail." + protocol + ".host", host);
		properties.put("mail." + protocol + ".port", String.valueOf(port));
		properties.put("mail." + protocol + ".auth", "true");
		properties.put("mail." + protocol + ".connectiontimeout", TIMEOUT_MILLIS);
		properties.put("mail." + protocol + ".timeout", TIMEOUT_MILLIS);
		properties.put("mail." + protocol + ".writetimeout", TIMEOUT_MILLIS);
		if (!implicitTls && tls) {
			properties.put("mail.smtp.starttls.enable", "true");
			properties.put("mail.smtp.starttls.required", "true");
		}
		return properties;
	}

	/** The name the transport is asked for, which the properties above are keyed by. */
	public static String protocolFor(int port) {
		return port == IMPLICIT_TLS_PORT ? "smtps" : "smtp";
	}
}
