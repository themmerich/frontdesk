package de.prime_ux.backend.replies;

import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantRepository;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Runs the drafting for every tenant on a fixed delay, the way {@link
 * de.prime_ux.backend.triage.TriageRunner} runs the triage. Cadence, batch size and the global
 * kill switch are application properties; everything about how a reply reads comes from the
 * tenant's own configuration. Disabled via frontdesk.drafts.enabled=false (used in tests, which
 * call {@link ReplyDraftProcessor#draftOnce} directly).
 */
@Component
@ConditionalOnProperty(prefix = "frontdesk.drafts", name = "enabled", havingValue = "true", matchIfMissing = true)
@Slf4j
class ReplyDraftRunner {

	private final ReplyDraftProcessor replyDraftProcessor;
	private final TenantRepository tenantRepository;
	private final int batchSize;

	ReplyDraftRunner(ReplyDraftProcessor replyDraftProcessor, TenantRepository tenantRepository,
			@Value("${frontdesk.drafts.batch-size:10}") int batchSize) {
		this.replyDraftProcessor = replyDraftProcessor;
		this.tenantRepository = tenantRepository;
		this.batchSize = batchSize;
	}

	@Scheduled(fixedDelayString = "${frontdesk.drafts.interval}")
	void draft() {
		for (Tenant tenant : tenantRepository.findAll()) {
			try {
				replyDraftProcessor.draftOnce(tenant, batchSize);
			} catch (RuntimeException e) {
				// One tenant's trouble must not stop the others.
				log.error("Draft run for tenant '{}' failed unexpectedly", tenant.getName(), e);
			}
		}
	}
}
