package de.prime_ux.backend.triage;

import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.branches.BranchRepository;
import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.users.UserRole;
import java.math.BigDecimal;
import java.time.Instant;
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
class CaseCategoryControllerTest {

	@Autowired
	private MockMvc mockMvc;

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
	private Tenant otherTenant;
	private CaseCategory orderStatus;

	@BeforeEach
	void cleanDatabaseAndCreateCategories() {
		caseRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		branchRepository.deleteAll();
		// The configuration goes with its tenant (FK cascade).
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
		otherTenant = tenantRepository.save(new Tenant("Beispiel AG"));
		appUserRepository.save(new AppUser(tenant, "anna", "Anna", "Admin", "{noop}irrelevant", UserRole.ADMIN));
		appUserRepository.save(new AppUser(tenant, "ben", "Ben", "Benutzer", "{noop}irrelevant", UserRole.USER));
		orderStatus = caseCategoryRepository.save(new CaseCategory(tenant, "ORDER_STATUS",
				"Statusanfrage Bestellung", "Frage nach dem Liefertermin.", CaseTier.AUTOMATIC, 0));
		caseCategoryRepository.save(new CaseCategory(tenant, "INVOICE", "Rechnung", "Eingehende Rechnung.",
				CaseTier.MANUAL, 1));
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void listsOnlyTheOwnTenantsCategoriesInOrder() throws Exception {
		caseCategoryRepository.save(new CaseCategory(otherTenant, "ORDER_STATUS", "Fremde Kategorie",
				"Gehört jemand anderem.", CaseTier.MANUAL, 0));

		mockMvc.perform(get("/api/case-categories"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].code").value("ORDER_STATUS"))
				.andExpect(jsonPath("$[0].name").value("Statusanfrage Bestellung"))
				.andExpect(jsonPath("$[0].tier").value("automatic"))
				.andExpect(jsonPath("$[0].active").value(true))
				.andExpect(jsonPath("$[1].name").value("Rechnung"));
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void createsACategoryAndDerivesItsCodeFromTheName() throws Exception {
		mockMvc.perform(post("/api/case-categories").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"name": " Rückfrage Außendienst ", "description": "Kunde möchte einen Termin.",
						 "tier": "draft", "active": true}"""))
				.andExpect(status().isCreated())
				// Nobody should have to invent a code; it exists for the model. Umlauts are
				// spelled out, ß uppercases to SS by itself.
				.andExpect(jsonPath("$.code").value("RUECKFRAGE_AUSSENDIENST"))
				.andExpect(jsonPath("$.name").value("Rückfrage Außendienst"))
				.andExpect(jsonPath("$.tier").value("draft"))
				// New categories go last, so the prompt keeps its order.
				.andExpect(jsonPath("$.sortOrder").value(2));
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void keepsDerivedCodesApart() throws Exception {
		String body = """
				{"name": "%s", "description": "Egal.", "tier": "manual", "active": true}""";
		mockMvc.perform(post("/api/case-categories").with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content(body.formatted("Sonstiges"))).andExpect(status().isCreated());

		// A different name that derives to the same code gets a counter.
		mockMvc.perform(post("/api/case-categories").with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content(body.formatted("sonstiges!")))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.code").value("SONSTIGES_2"));
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void rejectsATakenName() throws Exception {
		mockMvc.perform(post("/api/case-categories").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"name": "rechnung", "description": "Doppelt.", "tier": "manual", "active": true}"""))
				.andExpect(status().isConflict());
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void rejectsACategoryWithoutADescription() throws Exception {
		// The description is the only thing telling the model when a category applies.
		mockMvc.perform(post("/api/case-categories").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"name": "Ohne Beschreibung", "description": "  ", "tier": "manual", "active": true}"""))
				.andExpect(status().isBadRequest());
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void editsACategoryWithoutTouchingItsCode() throws Exception {
		mockMvc.perform(put("/api/case-categories/" + orderStatus.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"name": "Bestellstatus", "description": "Frage nach Liefertermin oder Versand.",
						 "tier": "draft", "active": true}"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Bestellstatus"))
				.andExpect(jsonPath("$.tier").value("draft"))
				// Renaming must not orphan the answers the model already gave.
				.andExpect(jsonPath("$.code").value("ORDER_STATUS"));
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void putsAColourOnACategoryAndTakesItOffAgain() throws Exception {
		String body = """
				{"name": "Statusanfrage Bestellung", "description": "Frage nach dem Liefertermin.",
				 "tier": "automatic", "color": %s, "active": true}""";

		mockMvc.perform(put("/api/case-categories/" + orderStatus.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content(body.formatted("\"blue\"")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.color").value("blue"));

		// An empty string is what the form sends for "no colour"; it has to clear the
		// column rather than be refused as an unknown palette entry.
		mockMvc.perform(put("/api/case-categories/" + orderStatus.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content(body.formatted("\"\"")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.color").doesNotExist());
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void createsACategoryWithAColourAndRefusesOneOutsideThePalette() throws Exception {
		String body = """
				{"name": "Werbung", "description": "Newsletter und Kaltakquise.",
				 "tier": "ignore", "color": "%s", "active": true}""";

		mockMvc.perform(post("/api/case-categories").with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content(body.formatted("grey")))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.color").value("grey"));

		// The frontend resolves a name to a light and a dark value and cannot do that
		// for one it has never heard of.
		mockMvc.perform(post("/api/case-categories").with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content(body.formatted("hotpink")))
				.andExpect(status().isBadRequest());
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void refusesToDeactivateTheLastActiveCategory() throws Exception {
		String deactivate = """
				{"name": "%s", "description": "Egal.", "tier": "manual", "active": false}""";
		mockMvc.perform(put("/api/case-categories/" + orderStatus.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content(deactivate.formatted("Statusanfrage Bestellung")))
				.andExpect(status().isOk());

		CaseCategory invoice = caseCategoryRepository
				.findAllByTenantIdAndActiveTrueOrderBySortOrderAsc(tenant.getId()).getFirst();
		mockMvc.perform(put("/api/case-categories/" + invoice.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content(deactivate.formatted("Rechnung")))
				.andExpect(status().isBadRequest());

		// Without one the triage would silently stop sorting mail.
		assertThat(caseCategoryRepository.countByTenantIdAndActiveTrue(tenant.getId())).isEqualTo(1);
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void deletesACategoryAndLeavesItsCasesTheirTier() throws Exception {
		Case classified = new Case(tenant, "<m@test>", "kunde@example.com", "info@example.com", "Lieferung 4711", "body",
				Instant.now(), false, 2048);
		classified.applyTriage(orderStatus, CaseTier.AUTOMATIC, new BigDecimal("0.95"), "Frage zur Lieferung.");
		caseRepository.save(classified);

		mockMvc.perform(delete("/api/case-categories/" + orderStatus.getId()).with(csrf()))
				.andExpect(status().isNoContent());

		Case afterwards = caseRepository.findById(classified.getId()).orElseThrow();
		assertThat(afterwards.getCategory()).isNull();
		// The board showed that tier, so it stays what it was.
		assertThat(afterwards.getTier()).isEqualTo(CaseTier.AUTOMATIC);
	}

	@Test
	@WithMockUser(username = "anna", roles = "ADMIN")
	void answersNotFoundForAnotherTenantsCategory() throws Exception {
		CaseCategory foreign = caseCategoryRepository.save(new CaseCategory(otherTenant, "FOREIGN", "Fremd",
				"Gehört jemand anderem.", CaseTier.MANUAL, 0));

		mockMvc.perform(delete("/api/case-categories/" + foreign.getId()).with(csrf()))
				.andExpect(status().isNotFound());
		assertThat(caseCategoryRepository.findById(foreign.getId())).isPresent();
	}

	@Test
	@WithMockUser(username = "ben")
	void deniesEverythingToNonAdmins() throws Exception {
		mockMvc.perform(get("/api/case-categories")).andExpect(status().isForbidden());
		mockMvc.perform(delete("/api/case-categories/" + orderStatus.getId()).with(csrf()))
				.andExpect(status().isForbidden());
	}
}
