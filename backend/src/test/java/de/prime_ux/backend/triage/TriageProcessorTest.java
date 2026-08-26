package de.prime_ux.backend.triage;

import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;

import static org.assertj.core.api.Assertions.assertThat;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.branches.BranchRepository;
import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import de.prime_ux.backend.users.AppUserRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;

/**
 * The pipeline end to end, with the model replaced by a stand-in: no API key, no cost, and the
 * answers are whatever the test needs them to be.
 */
@SpringBootTest(properties = { "frontdesk.mail.polling-enabled=false", "frontdesk.triage.enabled=false" })
@Import({ TestcontainersConfiguration.class, TriageProcessorTest.StubTriageServiceConfiguration.class })
class TriageProcessorTest {

	/** Answers whatever the test set, or fails on demand. */
	static class StubTriageService implements TriageService {

		private TriageVerdict verdict = new TriageVerdict("ORDER_STATUS", new BigDecimal("0.95"),
				"Kunde fragt nach dem Liefertermin.");
		private boolean failing;
		private final List<String> classifiedSubjects = new ArrayList<>();

		@Override
		public TriageVerdict classify(Case mailCase, List<CaseCategory> categories,
				TenantTriageSettings settings) {
			classifiedSubjects.add(mailCase.getSubject());
			if (failing) {
				throw new TriageException("no answer", null);
			}
			return verdict;
		}

		void answer(String categoryCode, String confidence) {
			this.verdict = new TriageVerdict(categoryCode,
					confidence == null ? null : new BigDecimal(confidence), "Zusammenfassung.");
			this.failing = false;
		}

		void fail() {
			this.failing = true;
		}

		void reset() {
			this.verdict = new TriageVerdict("ORDER_STATUS", new BigDecimal("0.95"),
					"Kunde fragt nach dem Liefertermin.");
			this.failing = false;
			classifiedSubjects.clear();
		}
	}

	@TestConfiguration
	static class StubTriageServiceConfiguration {

		@Bean
		@Primary
		StubTriageService stubTriageService() {
			return new StubTriageService();
		}
	}

	@Autowired
	private TriageProcessor triageProcessor;

	@Autowired
	private TriageProvisioner triageProvisioner;

	@Autowired
	private StubTriageService stubTriageService;

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private CaseCategoryRepository caseCategoryRepository;

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
	void cleanDatabaseAndConfigureTenant() {
		caseRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		branchRepository.deleteAll();
		// The configuration goes with its tenant (FK cascade).
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
		triageProvisioner.run(new DefaultApplicationArguments());
		stubTriageService.reset();
	}

	private Case ingest(String subject) {
		return caseRepository.save(new Case(tenant, "<" + subject + "@example.com>", "kunde@example.com",
				"info@example.com", subject, "Guten Tag, wann kommt die Lieferung?", Instant.now(), false, 2048));
	}

	@Test
	void sortsAnUntriagedCaseIntoTheTierOfItsCategory() {
		Case ingested = ingest("Lieferung 4711");

		int triaged = triageProcessor.triageOnce(tenant, 20);

		assertThat(triaged).isEqualTo(1);
		Case sorted = caseRepository.findById(ingested.getId()).orElseThrow();
		assertThat(sorted.getTier()).isEqualTo(CaseTier.AUTOMATIC);
		// Read through the repository: the case holds a lazy reference, and the id
		// is all a proxy gives up outside a session.
		assertThat(caseCategoryRepository.findById(sorted.getCategory().getId()).orElseThrow().getCode())
				.isEqualTo("ORDER_STATUS");
		assertThat(sorted.getConfidence()).isEqualByComparingTo(new BigDecimal("0.95"));
		// The sentence the model wrote is kept, not thrown away.
		assertThat(sorted.getSummary()).isEqualTo("Kunde fragt nach dem Liefertermin.");
		assertThat(sorted.getTriagedAt()).isNotNull();
	}

	@Test
	void dropsATierWhenTheModelIsUnsure() {
		stubTriageService.answer("ORDER_STATUS", "0.42");
		Case ingested = ingest("Vielleicht eine Bestellung");

		triageProcessor.triageOnce(tenant, 20);

		// Rather a draft than a wrong automatic answer.
		assertThat(caseRepository.findById(ingested.getId()).orElseThrow().getTier())
				.isEqualTo(CaseTier.DRAFT);
	}

	@Test
	void sendsAMailWithoutAFittingCategoryToAPerson() {
		stubTriageService.answer("", "0.99");
		Case ingested = ingest("Etwas ganz anderes");

		triageProcessor.triageOnce(tenant, 20);

		Case sorted = caseRepository.findById(ingested.getId()).orElseThrow();
		assertThat(sorted.getTier()).isEqualTo(CaseTier.MANUAL);
		assertThat(sorted.getCategory()).isNull();
	}

	@Test
	void looksAtEveryCaseOnlyOnce() {
		ingest("Erste Mail");

		triageProcessor.triageOnce(tenant, 20);
		int secondRun = triageProcessor.triageOnce(tenant, 20);

		assertThat(secondRun).isZero();
		assertThat(stubTriageService.classifiedSubjects).containsExactly("Erste Mail");
	}

	@Test
	void leavesACaseUntriagedWhenTheModelFails() {
		stubTriageService.fail();
		Case ingested = ingest("Bleibt liegen");

		int triaged = triageProcessor.triageOnce(tenant, 20);

		// Untouched, so the next run picks it up again — nothing is lost.
		assertThat(triaged).isZero();
		Case untouched = caseRepository.findById(ingested.getId()).orElseThrow();
		assertThat(untouched.getTier()).isNull();
		assertThat(untouched.getTriagedAt()).isNull();
	}

	@Test
	void takesTheOldestCasesFirstAndStopsAtTheBatchSize() {
		ingest("Alt");
		ingest("Mittel");
		ingest("Neu");

		int triaged = triageProcessor.triageOnce(tenant, 2);

		assertThat(triaged).isEqualTo(2);
		assertThat(stubTriageService.classifiedSubjects).containsExactly("Alt", "Mittel");
	}

	@Test
	void doesNothingForATenantWithoutCategories() {
		caseCategoryRepository.deleteAll();
		ingest("Ohne Kategorien");

		int triaged = triageProcessor.triageOnce(tenant, 20);

		assertThat(triaged).isZero();
		assertThat(stubTriageService.classifiedSubjects).isEmpty();
	}

	@Test
	void usesTheTenantsOwnThreshold() {
		// A tenant that trusts the classification more than the default does.
		tenantTriageSettingsRepository.deleteAll();
		tenantTriageSettingsRepository
				.save(new TenantTriageSettings(tenant, "", new BigDecimal("0.40")));
		stubTriageService.answer("ORDER_STATUS", "0.42");
		Case ingested = ingest("Knapp über der eigenen Schwelle");

		triageProcessor.triageOnce(tenant, 20);

		assertThat(caseRepository.findById(ingested.getId()).orElseThrow().getTier())
				.isEqualTo(CaseTier.AUTOMATIC);
	}
}
