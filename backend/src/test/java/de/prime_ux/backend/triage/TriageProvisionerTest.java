package de.prime_ux.backend.triage;

import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.branches.BranchRepository;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import de.prime_ux.backend.users.AppUserRepository;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@SpringBootTest(properties = "frontdesk.mail.polling-enabled=false")
@Import(TestcontainersConfiguration.class)
class TriageProvisionerTest {

	@Autowired
	private TriageProvisioner triageProvisioner;

	@Autowired
	private TenantRepository tenantRepository;

	@Autowired
	private CaseCategoryRepository caseCategoryRepository;

	@Autowired
	private TenantTriageSettingsRepository tenantTriageSettingsRepository;

	@Autowired
	private CaseRepository caseRepository;

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
		// Everything referencing tenants may linger from other test classes
		// sharing this context's database.
		caseRepository.deleteAll();
		caseCategoryRepository.deleteAll();
		tenantTriageSettingsRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		branchRepository.deleteAll();
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
	}

	@Test
	void givesANewTenantTheDefaultCategoriesInOrder() {
		triageProvisioner.run(new DefaultApplicationArguments());

		List<CaseCategory> categories = caseCategoryRepository
				.findAllByTenantIdAndActiveTrueOrderBySortOrderAsc(tenant.getId());
		assertThat(categories).extracting(CaseCategory::getCode).containsExactly("ORDER_STATUS",
				"GENERAL_INQUIRY", "ORDER_CONFIRMATION", "INVOICE", "APPLICATION", "COMPLAINT",
				"MARKETING");
		assertThat(categories).extracting(CaseCategory::getName).first().isEqualTo("Statusanfrage Bestellung");
		// The description is what tells the model when a category applies, so it is never empty.
		assertThat(categories).allSatisfy(category -> assertThat(category.getDescription()).isNotBlank());
	}

	@Test
	void sortsTheDefaultsAcrossTheTiersTheyBelongOn() {
		triageProvisioner.run(new DefaultApplicationArguments());

		List<CaseCategory> categories = caseCategoryRepository
				.findAllByTenantIdAndActiveTrueOrderBySortOrderAsc(tenant.getId());
		assertThat(categories).extracting(CaseCategory::getCode, CaseCategory::getTier).containsExactly(
				tuple("ORDER_STATUS", CaseTier.AUTOMATIC),
				tuple("GENERAL_INQUIRY", CaseTier.DRAFT),
				// Needs no answer, but somebody should have seen it.
				tuple("ORDER_CONFIRMATION", CaseTier.INFO),
				tuple("INVOICE", CaseTier.MANUAL),
				tuple("APPLICATION", CaseTier.MANUAL),
				tuple("COMPLAINT", CaseTier.MANUAL),
				// Out of the queue that is meant to hold what needs a person.
				tuple("MARKETING", CaseTier.IGNORE));
	}

	@Test
	void givesANewTenantTheCautiousDefaultSettings() {
		triageProvisioner.run(new DefaultApplicationArguments());

		TenantTriageSettings settings = tenantTriageSettingsRepository.findByTenantId(tenant.getId())
				.orElseThrow();
		assertThat(settings.getExtraInstructions()).isEmpty();
		assertThat(settings.getConfidenceThreshold()).isEqualByComparingTo(new BigDecimal("0.80"));
	}

	@Test
	void addsNothingTwiceWhenItRunsAgain() {
		triageProvisioner.run(new DefaultApplicationArguments());
		triageProvisioner.run(new DefaultApplicationArguments());

		assertThat(caseCategoryRepository.findAllByTenantIdAndActiveTrueOrderBySortOrderAsc(tenant.getId()))
				.hasSize(7);
		assertThat(tenantTriageSettingsRepository.findAll()).hasSize(1);
	}

	@Test
	void leavesAConfiguredTenantAlone() {
		caseCategoryRepository.save(new CaseCategory(tenant, "OWN", "Eigene Kategorie", "Selbst angelegt.",
				CaseTier.MANUAL, 0));
		tenantTriageSettingsRepository
				.save(new TenantTriageSettings(tenant, "Eigene Anweisung.", new BigDecimal("0.50")));

		triageProvisioner.run(new DefaultApplicationArguments());

		assertThat(caseCategoryRepository.findAllByTenantIdAndActiveTrueOrderBySortOrderAsc(tenant.getId()))
				.extracting(CaseCategory::getCode).containsExactly("OWN");
		TenantTriageSettings settings = tenantTriageSettingsRepository.findByTenantId(tenant.getId())
				.orElseThrow();
		assertThat(settings.getConfidenceThreshold()).isEqualByComparingTo(new BigDecimal("0.50"));
	}

	@Test
	void takesTheConfigurationWithTheTenantWhenItIsDeleted() {
		triageProvisioner.run(new DefaultApplicationArguments());

		tenantRepository.deleteAll();

		// The FK cascades, so nothing referencing a tenant survives it — which is
		// also what keeps the other tests' cleanup from tripping over these tables.
		assertThat(caseCategoryRepository.findAll()).isEmpty();
		assertThat(tenantTriageSettingsRepository.findAll()).isEmpty();
	}

	@Test
	void configuresEveryTenantSeparately() {
		Tenant otherTenant = tenantRepository.save(new Tenant("Beispiel AG"));

		triageProvisioner.run(new DefaultApplicationArguments());

		assertThat(caseCategoryRepository.findAllByTenantIdAndActiveTrueOrderBySortOrderAsc(tenant.getId()))
				.hasSize(7);
		assertThat(caseCategoryRepository.findAllByTenantIdAndActiveTrueOrderBySortOrderAsc(otherTenant.getId()))
				.hasSize(7);
		assertThat(tenantTriageSettingsRepository.findAll()).hasSize(2);
	}
}
