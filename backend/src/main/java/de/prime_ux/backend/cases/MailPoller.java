package de.prime_ux.backend.cases;

import de.prime_ux.backend.mailsettings.TenantMailSettings;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Polls every tenant's inbox on a fixed delay. The interval and the global kill switch stay
 * application properties; which mailbox to read comes from each tenant's stored configuration.
 * Disabled via frontdesk.mail.polling-enabled=false (used in tests, which call
 * {@link MailIngestService#pollOnce(TenantMailSettings)} directly).
 */
@Component
@ConditionalOnProperty(prefix = "frontdesk.mail", name = "polling-enabled", havingValue = "true", matchIfMissing = true)
class MailPoller {

	private static final Logger log = LoggerFactory.getLogger(MailPoller.class);

	private final MailIngestService mailIngestService;
	private final TenantMailSettingsRepository tenantMailSettingsRepository;

	MailPoller(MailIngestService mailIngestService, TenantMailSettingsRepository tenantMailSettingsRepository) {
		this.mailIngestService = mailIngestService;
		this.tenantMailSettingsRepository = tenantMailSettingsRepository;
	}

	@Scheduled(fixedDelayString = "${frontdesk.mail.poll-interval}")
	void poll() {
		for (TenantMailSettings settings : tenantMailSettingsRepository.findAllByPollingEnabledTrue()) {
			try {
				mailIngestService.pollOnce(settings);
			} catch (RuntimeException e) {
				// One tenant's broken configuration must not stop the others.
				log.error("Mail poll for tenant '{}' failed unexpectedly", settings.getTenant().getName(), e);
			}
		}
	}
}
