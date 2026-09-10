package de.prime_ux.backend.replies;

import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.triage.CaseTier;
import de.prime_ux.backend.triage.TenantTriageSettings;
import de.prime_ux.backend.triage.TenantTriageSettingsRepository;

import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes the drafts for the cases that are to get one without anyone asking: the automatic tier,
 * which is meant to go out as it is, and the draft tier, which is meant to be read first.
 *
 * <p>A pass of its own rather than a step inside the triage, for the same reason the triage is
 * not a step inside the mail ingest: a draft failing there would cost the classification too.
 * Here a failure leaves the case without a draft, and the next run tries again. It also picks up
 * a case a person moved onto one of the two tiers by hand.
 */
@Service
@Slf4j
public class ReplyDraftProcessor {

	/** The tiers whose cases are drafted without anyone asking. */
	static final List<CaseTier> DRAFTED_TIERS = List.of(CaseTier.AUTOMATIC, CaseTier.DRAFT);

	private final CaseRepository caseRepository;
	private final TenantTriageSettingsRepository tenantTriageSettingsRepository;
	private final ReplyDraftService replyDraftService;

	ReplyDraftProcessor(CaseRepository caseRepository, TenantTriageSettingsRepository tenantTriageSettingsRepository,
			ReplyDraftService replyDraftService) {
		this.caseRepository = caseRepository;
		this.tenantTriageSettingsRepository = tenantTriageSettingsRepository;
		this.replyDraftService = replyDraftService;
	}

	/**
	 * One pass for one tenant, oldest case first. Each case is drafted on its own, so one failure
	 * never costs the whole batch.
	 *
	 * @return how many cases got a draft
	 */
	@Transactional
	public int draftOnce(Tenant tenant, int batchSize) {
		List<Case> waiting = caseRepository
				.findByTenantIdAndTierInAndDraftTextIsNullAndDeletedAtIsNullAndHandledAtIsNullOrderByReceivedAtAsc(
						tenant.getId(), DRAFTED_TIERS, Limit.of(batchSize));
		if (waiting.isEmpty()) {
			return 0;
		}
		TenantTriageSettings settings = settingsOf(tenant);

		int drafted = 0;
		for (Case mailCase : waiting) {
			try {
				draft(mailCase, settings);
				drafted++;
			} catch (ReplyDraftException e) {
				// The case stays without a draft and comes up again on the next run;
				// giving up after repeated failures is roadmap step 7.
				log.warn("Could not draft a reply to case {}, will retry: {}", mailCase.getId(), e.getMessage());
			}
		}
		return drafted;
	}

	/**
	 * One case, now, whatever its tier — what the button on the detail page runs. The same code
	 * as the pass above, so a person asking gets what the scheduler would have written.
	 *
	 * @throws ReplyDraftException when the model gave no draft
	 */
	@Transactional
	public Case draftNow(Case mailCase) {
		return draft(mailCase, settingsOf(mailCase.getTenant()));
	}

	private Case draft(Case mailCase, TenantTriageSettings settings) {
		String text = replyDraftService.draft(mailCase, settings);
		mailCase.applyDraft(text);
		Case saved = caseRepository.save(mailCase);
		log.info("Drafted a reply to case {}", mailCase.getId());
		return saved;
	}

	private TenantTriageSettings settingsOf(Tenant tenant) {
		return tenantTriageSettingsRepository.findByTenantId(tenant.getId())
				.orElseGet(() -> TenantTriageSettings.defaults(tenant));
	}
}
