package de.prime_ux.backend.replies;

import static org.assertj.core.api.Assertions.assertThat;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.branches.BranchRepository;
import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;
import de.prime_ux.backend.triage.CaseTier;
import de.prime_ux.backend.triage.TenantTriageSettings;
import de.prime_ux.backend.triage.TenantTriageSettingsRepository;
import de.prime_ux.backend.users.AppUserRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;

/**
 * The drafting pass end to end, with the model replaced by a stand-in: no API key, no cost, and
 * the drafts are whatever the test needs them to be.
 */
@SpringBootTest(properties = { "frontdesk.mail.polling-enabled=false", "frontdesk.triage.enabled=false",
		"frontdesk.drafts.enabled=false" })
@Import({ TestcontainersConfiguration.class, ReplyDraftProcessorTest.StubReplyDraftServiceConfiguration.class })
class ReplyDraftProcessorTest {

	/** Answers whatever the test set, or fails on demand, and remembers what it was asked. */
	static class StubReplyDraftService implements ReplyDraftService {

		private String text = "Guten Tag, wir prüfen das.";
		private boolean failing;
		// Read by the controller test too, which shares this stand-in.
		final List<String> draftedSubjects = new ArrayList<>();
		private String lastSignature;
		String lastInstruction;

		@Override
		public String draft(Case mailCase, TenantTriageSettings settings, String instruction) {
			draftedSubjects.add(mailCase.getSubject());
			lastSignature = settings.getReplySignature();
			lastInstruction = instruction;
			if (failing) {
				throw new ReplyDraftException("no answer", null);
			}
			return text;
		}

		void answer(String text) {
			this.text = text;
			this.failing = false;
		}

		void fail() {
			this.failing = true;
		}

		void reset() {
			this.text = "Guten Tag, wir prüfen das.";
			this.failing = false;
			this.lastSignature = null;
			this.lastInstruction = null;
			draftedSubjects.clear();
		}
	}

	@TestConfiguration
	static class StubReplyDraftServiceConfiguration {

		@Bean
		@Primary
		StubReplyDraftService stubReplyDraftService() {
			return new StubReplyDraftService();
		}
	}

	@Autowired
	private ReplyDraftProcessor replyDraftProcessor;

	@Autowired
	private StubReplyDraftService stubReplyDraftService;

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private TenantTriageSettingsRepository tenantTriageSettingsRepository;

	@Autowired
	private TenantRepository tenantRepository;

	@Autowired
	private AppUserRepository appUserRepository;

	@Autowired
	private BranchRepository branchRepository;

	@Autowired
	private TenantLogoRepository tenantLogoRepository;

	@Autowired
	private TenantMailSettingsRepository tenantMailSettingsRepository;

	private Tenant tenant;

	@BeforeEach
	void cleanDatabaseAndCreateTenant() {
		caseRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		branchRepository.deleteAll();
		// The configuration goes with its tenant (FK cascade).
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
		stubReplyDraftService.reset();
	}

	private Case triaged(String subject, CaseTier tier) {
		return triaged(subject, tier, Instant.now());
	}

	private Case triaged(String subject, CaseTier tier, Instant receivedAt) {
		Case aCase = new Case(tenant, "<" + subject + "@example.com>", "kunde@example.com", "info@example.com",
				subject, "Guten Tag, wann kommt die Lieferung?", receivedAt, false, 2048);
		aCase.applyTriage(null, tier, new BigDecimal("0.95"), "Kunde fragt nach dem Liefertermin.");
		return caseRepository.save(aCase);
	}

	private Case reload(Case aCase) {
		return caseRepository.findById(aCase.getId()).orElseThrow();
	}

	@Test
	void writesADraftForACaseOnTheAutomaticTierAndKeepsBothTexts() {
		Case waiting = triaged("Lieferung 4711", CaseTier.AUTOMATIC);

		int drafted = replyDraftProcessor.draftOnce(tenant, 10);

		assertThat(drafted).isEqualTo(1);
		Case done = reload(waiting);
		assertThat(done.hasDraft()).isTrue();
		assertThat(done.getDraftText()).isEqualTo("Guten Tag, wir prüfen das.");
		// The same text twice, until a person edits the one and the other stays.
		assertThat(done.getDraftGeneratedText()).isEqualTo("Guten Tag, wir prüfen das.");
		assertThat(done.getDraftGeneratedAt()).isNotNull().isEqualTo(done.getDraftUpdatedAt());
	}

	@Test
	void draftsTheDraftTierAndLeavesTheOthersAlone() {
		triaged("Entwurf", CaseTier.DRAFT);
		triaged("Manuell", CaseTier.MANUAL);
		triaged("Info", CaseTier.INFO);
		triaged("Ignorieren", CaseTier.IGNORE);

		int drafted = replyDraftProcessor.draftOnce(tenant, 10);

		assertThat(drafted).isEqualTo(1);
		assertThat(stubReplyDraftService.draftedSubjects).containsExactly("Entwurf");
	}

	@Test
	void skipsWhatWasThrownAwayTickedOffOrAlreadyDrafted() {
		Case trashed = triaged("Im Papierkorb", CaseTier.AUTOMATIC);
		trashed.moveToTrash();
		caseRepository.save(trashed);
		Case handled = triaged("Erledigt", CaseTier.AUTOMATIC);
		handled.markHandled(true);
		caseRepository.save(handled);
		Case drafted = triaged("Schon beantwortet", CaseTier.AUTOMATIC);
		drafted.editDraft("Eigener Text.");
		caseRepository.save(drafted);
		triaged("Wartet", CaseTier.AUTOMATIC);

		replyDraftProcessor.draftOnce(tenant, 10);

		assertThat(stubReplyDraftService.draftedSubjects).containsExactly("Wartet");
		// The person's own draft is not written over by the pass.
		assertThat(reload(drafted).getDraftText()).isEqualTo("Eigener Text.");
	}

	@Test
	void leavesACaseWithoutADraftWhenTheModelFails() {
		stubReplyDraftService.fail();
		Case waiting = triaged("Bleibt liegen", CaseTier.AUTOMATIC);

		int drafted = replyDraftProcessor.draftOnce(tenant, 10);

		// Untouched, so the next run picks it up again.
		assertThat(drafted).isZero();
		assertThat(reload(waiting).hasDraft()).isFalse();
	}

	@Test
	void takesTheOldestCasesFirstAndStopsAtTheBatchSize() {
		Instant now = Instant.now();
		triaged("Alt", CaseTier.AUTOMATIC, now.minusSeconds(300));
		triaged("Mittel", CaseTier.AUTOMATIC, now.minusSeconds(200));
		triaged("Neu", CaseTier.AUTOMATIC, now.minusSeconds(100));

		int drafted = replyDraftProcessor.draftOnce(tenant, 2);

		assertThat(drafted).isEqualTo(2);
		assertThat(stubReplyDraftService.draftedSubjects).containsExactly("Alt", "Mittel");
	}

	@Test
	void handsTheTenantsOwnSettingsToTheModel() {
		TenantTriageSettings settings = TenantTriageSettings.defaults(tenant);
		settings.update("", TenantTriageSettings.DEFAULT_CONFIDENCE_THRESHOLD, "Musterfirma GmbH", "");
		tenantTriageSettingsRepository.save(settings);
		triaged("Mit Signatur", CaseTier.AUTOMATIC);

		replyDraftProcessor.draftOnce(tenant, 10);

		assertThat(stubReplyDraftService.lastSignature).isEqualTo("Musterfirma GmbH");
	}

	@Test
	void draftsAnyCaseOnRequestAndReplacesWhatWasThere() {
		Case manual = triaged("Von Hand", CaseTier.MANUAL);
		manual.editDraft("Ein erster Versuch.");
		caseRepository.save(manual);
		stubReplyDraftService.answer("Die Antwort des Modells.");

		Case drafted = replyDraftProcessor.draftNow(reload(manual), "Lehne ab.");

		// The button does not care about the tier, and the model's text replaces the edit.
		assertThat(drafted.getDraftText()).isEqualTo("Die Antwort des Modells.");
		assertThat(reload(manual).getDraftGeneratedText()).isEqualTo("Die Antwort des Modells.");
		// What the person said travels to the model; the scheduler never says anything.
		assertThat(stubReplyDraftService.lastInstruction).isEqualTo("Lehne ab.");
	}

	@Test
	void theSchedulerGivesTheModelNoLine() {
		triaged("Ohne Vorgabe", CaseTier.AUTOMATIC);

		replyDraftProcessor.draftOnce(tenant, 10);

		assertThat(stubReplyDraftService.lastInstruction).isNull();
	}
}
