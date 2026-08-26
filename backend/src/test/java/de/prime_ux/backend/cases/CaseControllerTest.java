package de.prime_ux.backend.cases;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import de.prime_ux.backend.triage.CaseCategory;
import de.prime_ux.backend.triage.CaseCategoryRepository;
import de.prime_ux.backend.triage.CaseTier;
import de.prime_ux.backend.triage.CategoryColor;
import java.math.BigDecimal;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.branches.BranchRepository;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;
import de.prime_ux.backend.users.UserRole;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "frontdesk.mail.polling-enabled=false")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class CaseControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private AppUserRepository appUserRepository;

	@Autowired
	private TenantRepository tenantRepository;

	@Autowired
	private TenantLogoRepository tenantLogoRepository;

	@Autowired
	private TenantMailSettingsRepository tenantMailSettingsRepository;

	@Autowired
	private BranchRepository branchRepository;

	private Tenant tenant;
	private Tenant otherTenant;

	@Autowired
	private CaseCategoryRepository caseCategoryRepository;

	@BeforeEach
	void cleanDatabaseAndCreateTenants() {
		caseRepository.deleteAll();
		// Mail settings reference tenants and may linger from other test classes
		// sharing this context's database.
		tenantMailSettingsRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		branchRepository.deleteAll();
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
		otherTenant = tenantRepository.save(new Tenant("Beispiel AG"));
		appUserRepository.save(new AppUser(tenant, "anna", "Anna", "Muster", "{noop}irrelevant",
				UserRole.USER));
	}

	@Test
	@WithMockUser(username = "anna")
	void listsOnlyTheOwnTenantsCasesNewestFirst() throws Exception {
		caseRepository.save(new Case(tenant, "<first@test>", "anna@example.com", "info@example.com", "Delivery status",
				"body", Instant.parse("2026-08-01T10:00:00Z"), false, 2048));
		// Reached the tenant through an alias, which the list has to show as it came in.
		caseRepository.save(new Case(tenant, "<second@test>", "ben@example.com", "rechnung@musterfirma.de",
				"Invoice copy", "body", Instant.parse("2026-08-02T10:00:00Z"), true, 512_000));
		// Another tenant's case must never show up in this tenant's list.
		caseRepository.save(new Case(otherTenant, "<foreign@test>", "fritz@example.com", "info@example.com", "Foreign case",
				"body", Instant.parse("2026-08-03T10:00:00Z"), false, 1024));

		mockMvc.perform(get("/api/cases"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].sender").value("ben@example.com"))
				.andExpect(jsonPath("$[0].recipient").value("rechnung@musterfirma.de"))
				.andExpect(jsonPath("$[0].subject").value("Invoice copy"))
				.andExpect(jsonPath("$[0].hasAttachments").value(true))
				.andExpect(jsonPath("$[0].sizeBytes").value(512_000))
				.andExpect(jsonPath("$[1].sender").value("anna@example.com"))
				.andExpect(jsonPath("$[1].recipient").value("info@example.com"))
				.andExpect(jsonPath("$[1].hasAttachments").value(false))
				// Untriaged cases carry no verdict yet.
				.andExpect(jsonPath("$[0].categoryName").doesNotExist())
				.andExpect(jsonPath("$[0].categoryColor").doesNotExist())
				.andExpect(jsonPath("$[0].tier").doesNotExist())
				.andExpect(jsonPath("$[0].summary").doesNotExist())
				.andExpect(jsonPath("$[0].confidence").doesNotExist());
	}

	@Test
	@WithMockUser(username = "anna")
	void namesTheCategoryAndTierOfATriagedCase() throws Exception {
		CaseCategory category = new CaseCategory(tenant, "ORDER_STATUS", "Statusanfrage Bestellung",
				"Frage nach dem Liefertermin.", CaseTier.AUTOMATIC, 0);
		category.recolor(CategoryColor.BLUE);
		caseCategoryRepository.save(category);
		Case triaged = new Case(tenant, "<triaged@test>", "anna@example.com", "info@example.com", "Lieferung 4711", "body",
				Instant.parse("2026-08-01T10:00:00Z"), false, 2048);
		triaged.applyTriage(category, CaseTier.DRAFT, new BigDecimal("0.72"),
				"Kunde fragt nach dem Liefertermin zu Bestellung 4711.");
		caseRepository.save(triaged);

		mockMvc.perform(get("/api/cases"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].categoryName").value("Statusanfrage Bestellung"))
				// The inbox paints the row in it, so it travels with the case, not only
				// with the category the admin page loads.
				.andExpect(jsonPath("$[0].categoryColor").value("blue"))
				// The stored tier, not the category's — the confidence had lowered it.
				.andExpect(jsonPath("$[0].tier").value("draft"))
				.andExpect(jsonPath("$[0].confidence").value(0.72))
				.andExpect(jsonPath("$[0].summary")
						.value("Kunde fragt nach dem Liefertermin zu Bestellung 4711."));
	}

	@Test
	@WithMockUser(username = "anna")
	void returnsAnEmptyListWhenTheTenantHasNoCases() throws Exception {
		caseRepository.save(new Case(otherTenant, "<foreign@test>", "fritz@example.com", "info@example.com", "Foreign case",
				"body", Instant.parse("2026-08-03T10:00:00Z"), false, 1024));

		mockMvc.perform(get("/api/cases"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	@WithMockUser(username = "ghost")
	void answersUnauthorizedWhenTheSessionUserNoLongerExists() throws Exception {
		mockMvc.perform(get("/api/cases")).andExpect(status().isUnauthorized());
	}
}
