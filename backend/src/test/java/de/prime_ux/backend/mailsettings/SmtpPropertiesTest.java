package de.prime_ux.backend.mailsettings;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Properties;
import org.junit.jupiter.api.Test;

/**
 * The rule the connection test and the send both rest on. Pinned here because the two would
 * otherwise be free to drift apart, and a probe over different properties tests a connection that
 * is not the one carrying the mail.
 */
class SmtpPropertiesTest {

	@Test
	void treatsPort465AsTlsFromTheFirstByte() {
		Properties properties = SmtpProperties.of("smtp.example.com", 465, true);

		assertThat(SmtpProperties.protocolFor(465)).isEqualTo("smtps");
		assertThat(properties.get("mail.transport.protocol")).isEqualTo("smtps");
		assertThat(properties.get("mail.smtps.host")).isEqualTo("smtp.example.com");
		assertThat(properties.get("mail.smtps.port")).isEqualTo("465");
		assertThat(properties.get("mail.smtps.auth")).isEqualTo("true");
		// Already encrypted, so there is nothing to upgrade.
		assertThat(properties).doesNotContainKey("mail.smtp.starttls.enable");
	}

	@Test
	void upgradesEveryOtherPortWithStarttlsWhenTlsIsAskedFor() {
		Properties properties = SmtpProperties.of("smtp.example.com", 587, true);

		assertThat(SmtpProperties.protocolFor(587)).isEqualTo("smtp");
		assertThat(properties.get("mail.transport.protocol")).isEqualTo("smtp");
		assertThat(properties.get("mail.smtp.port")).isEqualTo("587");
		assertThat(properties.get("mail.smtp.starttls.enable")).isEqualTo("true");
		// Required, not merely offered: a server that cannot upgrade must fail rather than
		// carry the mail in the clear.
		assertThat(properties.get("mail.smtp.starttls.required")).isEqualTo("true");
	}

	@Test
	void leavesAPlainServerPlainWhenNoTlsIsAskedFor() {
		Properties properties = SmtpProperties.of("localhost", 3025, false);

		assertThat(properties.get("mail.transport.protocol")).isEqualTo("smtp");
		assertThat(properties).doesNotContainKey("mail.smtp.starttls.enable");
		assertThat(properties.get("mail.smtp.auth")).isEqualTo("true");
	}

	@Test
	void givesEveryConnectionATimeoutSoAPressNeverHangs() {
		Properties properties = SmtpProperties.of("smtp.example.com", 587, true);

		assertThat(properties.get("mail.smtp.connectiontimeout")).isEqualTo("10000");
		assertThat(properties.get("mail.smtp.timeout")).isEqualTo("10000");
		assertThat(properties.get("mail.smtp.writetimeout")).isEqualTo("10000");
	}
}
