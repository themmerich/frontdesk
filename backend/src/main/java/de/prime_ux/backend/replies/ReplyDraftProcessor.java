package de.prime_ux.backend.replies;

import de.prime_ux.backend.branches.Branch;
import de.prime_ux.backend.branches.BranchRepository;
import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.cases.CaseEventType;
import de.prime_ux.backend.cases.CaseEvents;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantRepository;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
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
	private final CaseEvents caseEvents;
	private final TenantTriageSettingsRepository tenantTriageSettingsRepository;
	private final TenantRepository tenantRepository;
	private final AppUserRepository appUserRepository;
	private final BranchRepository branchRepository;
	private final ReplyDraftService replyDraftService;

	ReplyDraftProcessor(CaseRepository caseRepository, CaseEvents caseEvents,
			TenantTriageSettingsRepository tenantTriageSettingsRepository, TenantRepository tenantRepository,
			AppUserRepository appUserRepository, BranchRepository branchRepository, ReplyDraftService replyDraftService) {
		this.caseRepository = caseRepository;
		this.caseEvents = caseEvents;
		this.tenantTriageSettingsRepository = tenantTriageSettingsRepository;
		this.tenantRepository = tenantRepository;
		this.appUserRepository = appUserRepository;
		this.branchRepository = branchRepository;
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
		// Nobody is at the desk: the drafts are signed with the stand-in the company chose, or
		// with the company alone. The tenant came in from outside the transaction, so both are
		// fetched here, where the stand-in's branch can still be read.
		Tenant company = attached(tenant);
		AppUser standIn = company.getSignatureUser() == null ? null
				: appUserRepository.findById(company.getSignatureUser().getId()).orElse(null);
		String signature = signatureFor(company, standIn);

		int drafted = 0;
		for (Case mailCase : waiting) {
			try {
				// Nobody stands beside the scheduler to say what the reply should do.
				draft(mailCase, settings, null, signature, null);
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
	 * as the pass above, so a person asking gets what the scheduler would have written — unless
	 * they say what the reply should do, or what to change about the draft there is.
	 *
	 * @param instruction the person's line for the model; null or blank for none
	 * @param person who asks, and whose name goes under the reply
	 * @throws ReplyDraftException when the model gave no draft
	 */
	@Transactional
	public Case draftNow(Case mailCase, String instruction, AppUser person) {
		Tenant tenant = attached(mailCase.getTenant());
		return draft(mailCase, settingsOf(tenant), instruction, signatureFor(tenant, person), person);
	}

	/**
	 * The tenant as this transaction sees it. What comes in may be a proxy off a case loaded
	 * elsewhere, which gives up nothing but its id without a session.
	 */
	private Tenant attached(Tenant tenant) {
		return tenantRepository.findById(tenant.getId()).orElseThrow();
	}

	/** The company's signature template, filled in for this person — or for nobody. */
	private String signatureFor(Tenant tenant, AppUser person) {
		Branch headquarters = branchRepository.findByTenantIdAndHeadquartersTrue(tenant.getId()).orElse(null);
		return SignatureRenderer.render(tenant.getReplySignature(), tenant, person, headquarters);
	}

	/** @param person who asked, or null when the scheduler did on its own */
	private Case draft(Case mailCase, TenantTriageSettings settings, String instruction, String signature,
			AppUser person) {
		String text = replyDraftService.draft(mailCase, settings, instruction, signature);
		mailCase.applyDraft(text);
		Case saved = caseRepository.save(mailCase);
		caseEvents.record(saved, CaseEventType.DRAFT_GENERATED, person, CaseEvents.details("onRequest", person != null));
		log.info("Drafted a reply to case {}", mailCase.getId());
		return saved;
	}

	private TenantTriageSettings settingsOf(Tenant tenant) {
		return tenantTriageSettingsRepository.findByTenantId(tenant.getId())
				.orElseGet(() -> TenantTriageSettings.defaults(tenant));
	}
}
