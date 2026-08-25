package de.prime_ux.backend.triage;

import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.branches.BranchRepository;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.users.UserRole;
import java.math.BigDecimal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = { "frontdesk.mail.polling-enabled=false", "frontdesk.triage.enabled=false" })
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class TriageSettingsControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private TenantTriageSettingsRepository tenantTriageSettingsRepository;

	@Autowired
	private CaseCategoryRepository caseCategoryRepository;

	@Autowired
	private CaseRepository caseRepository;

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
		appUserRepository.save(new AppUser(tenant, "anna", "Anna", "Admin", "{noop}irrelevant", UserRole.ADMIN));
		appUserRepository.save(new AppUser(tenant, "ben", "Ben", "Benutzer", "{noop}irrelevant", UserRole.USER));
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void answersWithTheDefaultsWhileNothingIsStored() throws Exception {
		mockMvc.perform(get("/api/triage-settings"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.extraInstructions").value(""))
				.andExpect(jsonPath("$.confidenceThreshold").value(0.80));
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void savesTheThresholdAndTheTenantsOwnInstructions() throws Exception {
		mockMvc.perform(put("/api/triage-settings").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"extraInstructions": "  Mails von @lieferant-xy.example sind Bestellbestätigungen.  ",
						 "confidenceThreshold": 0.65}"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.extraInstructions")
						.value("Mails von @lieferant-xy.example sind Bestellbestätigungen."))
				.andExpect(jsonPath("$.confidenceThreshold").value(0.65));

		TenantTriageSettings stored = tenantTriageSettingsRepository.findByTenantId(tenant.getId()).orElseThrow();
		assertThat(stored.getConfidenceThreshold()).isEqualByComparingTo(new BigDecimal("0.65"));
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void treatsAMissingAddendumAsAnEmptyOne() throws Exception {
		mockMvc.perform(put("/api/triage-settings").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"confidenceThreshold": 0.5}"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.extraInstructions").value(""));
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void rejectsAThresholdOutsideZeroToOne() throws Exception {
		// A fraction, not a percentage — 80 would mean "always uncertain".
		mockMvc.perform(put("/api/triage-settings").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"extraInstructions": "", "confidenceThreshold": 80}"""))
				.andExpect(status().isBadRequest());
		assertThat(tenantTriageSettingsRepository.findByTenantId(tenant.getId())).isEmpty();
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void keepsEachTenantsSettingsApart() throws Exception {
		Tenant otherTenant = tenantRepository.save(new Tenant("Beispiel AG"));
		tenantTriageSettingsRepository
				.save(new TenantTriageSettings(otherTenant, "Fremde Anweisung.", new BigDecimal("0.10")));

		mockMvc.perform(put("/api/triage-settings").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"extraInstructions": "Eigene Anweisung.", "confidenceThreshold": 0.9}"""))
				.andExpect(status().isOk());

		TenantTriageSettings foreign = tenantTriageSettingsRepository.findByTenantId(otherTenant.getId())
				.orElseThrow();
		assertThat(foreign.getExtraInstructions()).isEqualTo("Fremde Anweisung.");
		assertThat(foreign.getConfidenceThreshold()).isEqualByComparingTo(new BigDecimal("0.10"));
	}

	@Test
	@WithMockUser(username = "ben")
	void deniesEverythingToNonAdmins() throws Exception {
		mockMvc.perform(get("/api/triage-settings")).andExpect(status().isForbidden());
		mockMvc.perform(put("/api/triage-settings").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"extraInstructions": "", "confidenceThreshold": 0.5}"""))
				.andExpect(status().isForbidden());
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void leavesTheCategoriesAlone() throws Exception {
		caseCategoryRepository.save(new CaseCategory(tenant, "ORDER_STATUS", "Statusanfrage",
				"Frage nach dem Liefertermin.", CaseTier.AUTOMATIC, 0));

		mockMvc.perform(put("/api/triage-settings").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"extraInstructions": "", "confidenceThreshold": 0.4}"""))
				.andExpect(status().isOk());

		assertThat(caseCategoryRepository.findAllByTenantIdOrderBySortOrderAsc(tenant.getId())).hasSize(1);
	}
}
