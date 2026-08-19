package de.prime_ux.backend.cases;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Triggers a mail poll on a fixed delay. Disabled via frontdesk.mail.polling-enabled=false (used
 * in tests, which call {@link MailIngestService#pollOnce()} directly).
 */
@Component
@ConditionalOnProperty(prefix = "frontdesk.mail", name = "polling-enabled", havingValue = "true", matchIfMissing = true)
class MailPoller {

	private final MailIngestService mailIngestService;

	MailPoller(MailIngestService mailIngestService) {
		this.mailIngestService = mailIngestService;
	}

	@Scheduled(fixedDelayString = "${frontdesk.mail.poll-interval}")
	void poll() {
		mailIngestService.pollOnce();
	}
}
