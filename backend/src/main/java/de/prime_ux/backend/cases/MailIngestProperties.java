package de.prime_ux.backend.cases;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Connection settings for the polled inbox. Defaults in application.properties point at the
 * GreenMail service from compose.yaml; production overrides them via environment variables.
 */
@ConfigurationProperties(prefix = "frontdesk.mail")
public record MailIngestProperties(
		String host,
		int port,
		String username,
		String password,
		String folder,
		Duration pollInterval,
		boolean pollingEnabled) {}
