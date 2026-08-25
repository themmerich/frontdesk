package de.prime_ux.backend.triage;

import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantRepository;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Runs the triage for every tenant on a fixed delay. Cadence, batch size, and the global kill
 * switch are application properties; everything about how a case is judged comes from the
 * tenant's own configuration. Disabled via frontdesk.triage.enabled=false (used in tests, which
 * call {@link TriageProcessor#triageOnce} directly).
 */
@Component
@ConditionalOnProperty(prefix = "frontdesk.triage", name = "enabled", havingValue = "true", matchIfMissing = true)
@Slf4j
class TriageRunner {

	private final TriageProcessor triageProcessor;
	private final TenantRepository tenantRepository;
	private final int batchSize;

	TriageRunner(TriageProcessor triageProcessor, TenantRepository tenantRepository,
			@Value("${frontdesk.triage.batch-size:20}") int batchSize) {
		this.triageProcessor = triageProcessor;
		this.tenantRepository = tenantRepository;
		this.batchSize = batchSize;
	}

	@Scheduled(fixedDelayString = "${frontdesk.triage.interval}")
	void triage() {
		for (Tenant tenant : tenantRepository.findAll()) {
			try {
				triageProcessor.triageOnce(tenant, batchSize);
			} catch (RuntimeException e) {
				// One tenant's trouble must not stop the others.
				log.error("Triage run for tenant '{}' failed unexpectedly", tenant.getName(), e);
			}
		}
	}
}
