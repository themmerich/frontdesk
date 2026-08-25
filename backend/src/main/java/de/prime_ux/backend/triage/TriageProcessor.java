package de.prime_ux.backend.triage;

import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.tenants.Tenant;

import java.util.List;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sorts the cases nobody has looked at yet into their tier.
 *
 * <p>Deliberately a pass of its own rather than a step inside the mail ingest: the ingest marks a
 * mail SEEN on the server once it is stored, so a classification failing in that same loop would
 * lose the mail's assessment for good. Here a failure simply leaves the case untriaged, and the
 * next run picks it up again.
 */
@Service
@Slf4j
public class TriageProcessor {

	private final CaseRepository caseRepository;
	private final CaseCategoryRepository caseCategoryRepository;
	private final TenantTriageSettingsRepository tenantTriageSettingsRepository;
	private final TriageService triageService;

	TriageProcessor(CaseRepository caseRepository, CaseCategoryRepository caseCategoryRepository,
			TenantTriageSettingsRepository tenantTriageSettingsRepository, TriageService triageService) {
		this.caseRepository = caseRepository;
		this.caseCategoryRepository = caseCategoryRepository;
		this.tenantTriageSettingsRepository = tenantTriageSettingsRepository;
		this.triageService = triageService;
	}

	/**
	 * One pass for one tenant, oldest case first. Each case is classified on its own, so one
	 * failure never costs the whole batch.
	 *
	 * @return how many cases were sorted
	 */
	@Transactional
	public int triageOnce(Tenant tenant, int batchSize) {
		List<Case> untriaged = caseRepository.findByTenantIdAndTierIsNullOrderByReceivedAtAsc(tenant.getId(),
				Limit.of(batchSize));
		if (untriaged.isEmpty()) {
			return 0;
		}
		List<CaseCategory> categories = caseCategoryRepository
				.findAllByTenantIdAndActiveTrueOrderBySortOrderAsc(tenant.getId());
		if (categories.isEmpty()) {
			log.warn("Tenant '{}' has no active case categories, skipping the triage", tenant.getName());
			return 0;
		}
		TenantTriageSettings settings = tenantTriageSettingsRepository.findByTenantId(tenant.getId())
				.orElseGet(() -> TenantTriageSettings.defaults(tenant));

		int triaged = 0;
		for (Case mailCase : untriaged) {
			if (triage(mailCase, categories, settings)) {
				triaged++;
			}
		}
		return triaged;
	}

	private boolean triage(Case mailCase, List<CaseCategory> categories, TenantTriageSettings settings) {
		try {
			TriageVerdict verdict = triageService.classify(mailCase, categories, settings);
			Optional<CaseCategory> category = TriageRule.categoryOf(verdict, categories);
			CaseTier tier = TriageRule.tierOf(verdict, category, settings.getConfidenceThreshold());
			mailCase.applyTriage(category.orElse(null), tier, verdict.confidence(), verdict.summary());
			caseRepository.save(mailCase);
			log.info("Triaged case {} as {} ({})", mailCase.getId(), tier,
					category.map(CaseCategory::getCode).orElse("no category"));
			return true;
		} catch (TriageException e) {
			// The case stays untriaged and comes up again on the next run; giving up
			// after repeated failures is roadmap step 7.
			log.warn("Could not triage case {}, will retry: {}", mailCase.getId(), e.getMessage());
			return false;
		}
	}
}
