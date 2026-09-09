package de.prime_ux.backend.cases;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.branches.BranchRepository;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;
import de.prime_ux.backend.triage.CaseCategory;
import de.prime_ux.backend.triage.CaseCategoryRepository;
import de.prime_ux.backend.triage.CaseTier;
import de.prime_ux.backend.triage.CategoryColor;
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
	void carriesTheMailBodyOnTheDetailButNotInTheList() throws Exception {
		// Triaged on purpose: the category is a lazy reference, and reading it while
		// building the answer is exactly where the detail view broke once.
		CaseCategory category = caseCategoryRepository.save(new CaseCategory(tenant, "INVOICE", "Rechnung",
				"Eingehende Rechnung.", CaseTier.MANUAL, 0));
		Case aCase = new Case(tenant, "<detail@test>", "anna@example.com", "info@example.com",
				"Rechnung 2026-081", "Bitte um eine Kopie.", Instant.parse("2026-08-01T10:00:00Z"), false, 2048);
		aCase.applyTriage(category, CaseTier.DRAFT, new BigDecimal("0.72"), "Kunde bittet um eine Kopie.");
		caseRepository.save(aCase);

		mockMvc.perform(get("/api/cases/" + aCase.getId()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.subject").value("Rechnung 2026-081"))
				.andExpect(jsonPath("$.bodyText").value("Bitte um eine Kopie."))
				// Written in plain text, so there is no HTML version of it to hand over.
				.andExpect(jsonPath("$.bodyHtml").doesNotExist())
				.andExpect(jsonPath("$.categoryName").value("Rechnung"));

		// The list would pay for every body on every reload and never shows one.
		mockMvc.perform(get("/api/cases")).andExpect(jsonPath("$[0].bodyText").doesNotExist());
	}

	@Test
	@WithMockUser(username = "anna")
	void doesNotFindAnotherTenantsCase() throws Exception {
		Case foreign = caseRepository.save(new Case(otherTenant, "<foreign@test>", "fritz@example.com",
				"info@example.com", "Fremd", "body", Instant.parse("2026-08-03T10:00:00Z"), false, 1024));

		// Not forbidden but not found: the answer must not say that it exists.
		mockMvc.perform(get("/api/cases/" + foreign.getId())).andExpect(status().isNotFound());
		mockMvc.perform(put("/api/cases/" + foreign.getId() + "/tier").with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content("{\"tier\": \"manual\"}"))
				.andExpect(status().isNotFound());
	}

	@Test
	@WithMockUser(username = "anna")
	void letsAPersonOverruleCategoryAndTierWithoutLosingWhatTheModelSaid() throws Exception {
		CaseCategory statusRequest = caseCategoryRepository.save(new CaseCategory(tenant, "ORDER_STATUS",
				"Statusanfrage Bestellung", "Frage nach dem Liefertermin.", CaseTier.AUTOMATIC, 0));
		CaseCategory complaint = caseCategoryRepository.save(new CaseCategory(tenant, "COMPLAINT", "Reklamation",
				"Beschwerde über eine Lieferung.", CaseTier.MANUAL, 1));
		complaint.recolor(CategoryColor.RED);
		caseCategoryRepository.save(complaint);
		Case triaged = new Case(tenant, "<triaged@test>", "anna@example.com", "info@example.com", "Lieferung 4711",
				"body", Instant.parse("2026-08-01T10:00:00Z"), false, 2048);
		triaged.applyTriage(statusRequest, CaseTier.AUTOMATIC, new BigDecimal("0.95"), "Frage zur Lieferung.");
		caseRepository.save(triaged);

		mockMvc.perform(put("/api/cases/" + triaged.getId() + "/classification").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"categoryId\": \"" + complaint.getId() + "\", \"tier\": \"manual\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.categoryId").value(complaint.getId().toString()))
				.andExpect(jsonPath("$.categoryName").value("Reklamation"))
				.andExpect(jsonPath("$.categoryColor").value("red"))
				.andExpect(jsonPath("$.tier").value("manual"))
				// Summary and confidence still describe the classification the model made.
				.andExpect(jsonPath("$.confidence").value(0.95))
				.andExpect(jsonPath("$.summary").value("Frage zur Lieferung."));

		// A case that fits none of them is better left without a category; a tier it always has.
		mockMvc.perform(put("/api/cases/" + triaged.getId() + "/classification").with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content("{\"categoryId\": null, \"tier\": \"info\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.categoryId").doesNotExist())
				.andExpect(jsonPath("$.tier").value("info"));

		mockMvc.perform(put("/api/cases/" + triaged.getId() + "/classification").with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content("{\"categoryId\": null, \"tier\": \"nonsense\"}"))
				.andExpect(status().isBadRequest());
	}

	@Test
	@WithMockUser(username = "anna")
	void marksACaseAsTakenNoteOfAndTakesItBackAgain() throws Exception {
		Case aCase = new Case(tenant, "<news@test>", "news@example.com", "info@example.com", "Wochenrückblick",
				"body", Instant.parse("2026-08-01T10:00:00Z"), false, 2048);
		aCase.applyTriage(null, CaseTier.INFO, new BigDecimal("0.88"), "Branchennews der Woche.");
		caseRepository.save(aCase);

		mockMvc.perform(get("/api/cases")).andExpect(jsonPath("$[0].handledAt").doesNotExist());

		mockMvc.perform(put("/api/cases/" + aCase.getId() + "/handled").with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content("{\"handled\": true}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.handledAt").exists())
				// Taking note is not a correction of the triage: what the model said still stands.
				.andExpect(jsonPath("$.tier").value("info"))
				.andExpect(jsonPath("$.summary").value("Branchennews der Woche."));

		Instant firstTime = caseRepository.findById(aCase.getId()).orElseThrow().getHandledAt();
		assertThat(firstTime).isNotNull();

		// The same click again says nothing new, so the moment stays where it is.
		mockMvc.perform(put("/api/cases/" + aCase.getId() + "/handled").with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content("{\"handled\": true}"))
				.andExpect(status().isOk());
		assertThat(caseRepository.findById(aCase.getId()).orElseThrow().getHandledAt()).isEqualTo(firstTime);

		// And it can be taken back, for the click that was one line too far down.
		mockMvc.perform(put("/api/cases/" + aCase.getId() + "/handled").with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content("{\"handled\": false}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.handledAt").doesNotExist());
		assertThat(caseRepository.findById(aCase.getId()).orElseThrow().getHandledAt()).isNull();

		// A body without the field would silently undo what was just marked.
		mockMvc.perform(put("/api/cases/" + aCase.getId() + "/handled").with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isBadRequest());
	}

	@Test
	@WithMockUser(username = "anna")
	void doesNotTakeNoteOfAnotherTenantsCase() throws Exception {
		Case foreign = caseRepository.save(new Case(otherTenant, "<foreign@test>", "fritz@example.com",
				"info@example.com", "Fremd", "body", Instant.parse("2026-08-03T10:00:00Z"), false, 1024));

		mockMvc.perform(put("/api/cases/" + foreign.getId() + "/handled").with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content("{\"handled\": true}"))
				.andExpect(status().isNotFound());

		assertThat(caseRepository.findById(foreign.getId()).orElseThrow().getHandledAt()).isNull();
	}

	@Test
	@WithMockUser(username = "anna")
	void doesNotFileACaseUnderAnotherTenantsCategory() throws Exception {
		CaseCategory theirs = caseCategoryRepository.save(new CaseCategory(otherTenant, "THEIRS", "Fremde Kategorie",
				"Gehört jemand anderem.", CaseTier.MANUAL, 0));
		Case ours = caseRepository.save(new Case(tenant, "<ours@test>", "anna@example.com", "info@example.com",
				"Unsere Mail", "body", Instant.parse("2026-08-01T10:00:00Z"), false, 2048));

		mockMvc.perform(put("/api/cases/" + ours.getId() + "/classification").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"categoryId\": \"" + theirs.getId() + "\", \"tier\": \"manual\"}"))
				.andExpect(status().isNotFound());

		Case unchanged = caseRepository.findWithCategoryById(ours.getId()).orElseThrow();
		assertThat(unchanged.getCategory()).isNull();
		assertThat(unchanged.getTier()).isNull();
	}

	@Test
	@WithMockUser(username = "anna")
	void movesTheSelectedCasesToTheTrashAndLeavesTheRestAlone() throws Exception {
		Case first = caseRepository.save(new Case(tenant, "<first@test>", "anna@example.com", "info@example.com",
				"Weg damit", "body", Instant.parse("2026-08-01T10:00:00Z"), false, 2048));
		Case second = caseRepository.save(new Case(tenant, "<second@test>", "ben@example.com", "info@example.com",
				"Auch weg", "body", Instant.parse("2026-08-02T10:00:00Z"), false, 2048));
		Case kept = caseRepository.save(new Case(tenant, "<third@test>", "cara@example.com", "info@example.com",
				"Bleibt", "body", Instant.parse("2026-08-03T10:00:00Z"), false, 2048));

		mockMvc.perform(delete("/api/cases").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"ids\": [\"%s\", \"%s\"]}".formatted(first.getId(), second.getId())))
				.andExpect(status().isNoContent());

		// The rows stay: a mail cannot be fetched again once the mailbox marked it read.
		assertThat(caseRepository.findAll()).extracting(Case::getId)
				.containsExactlyInAnyOrder(first.getId(), second.getId(), kept.getId());
		assertThat(caseRepository.findById(first.getId()).orElseThrow().getDeletedAt()).isNotNull();
		assertThat(caseRepository.findById(second.getId()).orElseThrow().getDeletedAt()).isNotNull();
		assertThat(caseRepository.findById(kept.getId()).orElseThrow().getDeletedAt()).isNull();
	}

	@Test
	@WithMockUser(username = "anna")
	void fetchesACaseBackOutOfTheTrashWithWhatWasKnownAboutIt() throws Exception {
		Case aCase = new Case(tenant, "<back@test>", "anna@example.com", "info@example.com", "Doch nicht",
				"body", Instant.parse("2026-08-01T10:00:00Z"), false, 2048);
		aCase.applyTriage(null, CaseTier.INFO, new BigDecimal("0.80"), "Newsletter der Woche.");
		aCase.markHandled(true);
		caseRepository.save(aCase);

		mockMvc.perform(delete("/api/cases").with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"ids\": [\"%s\"]}".formatted(aCase.getId()))).andExpect(status().isNoContent());
		mockMvc.perform(get("/api/cases")).andExpect(jsonPath("$[0].deletedAt").exists());

		mockMvc.perform(put("/api/cases/restore").with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"ids\": [\"%s\"]}".formatted(aCase.getId()))).andExpect(status().isNoContent());

		// Back where it was: throwing away said nothing about whether it was worked through.
		Case restored = caseRepository.findById(aCase.getId()).orElseThrow();
		assertThat(restored.getDeletedAt()).isNull();
		assertThat(restored.getHandledAt()).isNotNull();
		assertThat(restored.getTier()).isEqualTo(CaseTier.INFO);
	}

	@Test
	@WithMockUser(username = "anna")
	void deletesForGoodOnlyWhatIsInTheTrash() throws Exception {
		Case thrownAway = caseRepository.save(new Case(tenant, "<gone@test>", "anna@example.com",
				"info@example.com", "Endgültig weg", "body", Instant.parse("2026-08-01T10:00:00Z"), false, 2048));
		Case inTheInbox = caseRepository.save(new Case(tenant, "<here@test>", "ben@example.com", "info@example.com",
				"Steht noch im Posteingang", "body", Instant.parse("2026-08-02T10:00:00Z"), false, 2048));
		mockMvc.perform(delete("/api/cases").with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"ids\": [\"%s\"]}".formatted(thrownAway.getId()))).andExpect(status().isNoContent());

		mockMvc.perform(delete("/api/cases/purge").with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"ids\": [\"%s\", \"%s\"]}".formatted(thrownAway.getId(), inTheInbox.getId())))
				.andExpect(status().isNoContent());

		// Only what somebody threw away goes; the one still in the inbox is not touched by an id
		// that happened to travel along.
		assertThat(caseRepository.findAll()).extracting(Case::getId).containsExactly(inTheInbox.getId());
	}

	@Test
	@WithMockUser(username = "anna")
	void refusesToDeleteAnotherTenantsCase() throws Exception {
		Case foreign = caseRepository.save(new Case(otherTenant, "<foreign@test>", "fritz@example.com",
				"info@example.com", "Fremd", "body", Instant.parse("2026-08-03T10:00:00Z"), false, 1024));

		// A guessed id answers the same way whether it exists or not, and touches nothing —
		// neither on the way into the trash, nor back out of it, nor out of the world.
		String body = "{\"ids\": [\"%s\"]}".formatted(foreign.getId());
		mockMvc.perform(delete("/api/cases").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isNoContent());
		mockMvc.perform(put("/api/cases/restore").with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content(body)).andExpect(status().isNoContent());
		mockMvc.perform(delete("/api/cases/purge").with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content(body)).andExpect(status().isNoContent());

		assertThat(caseRepository.existsById(foreign.getId())).isTrue();
		assertThat(caseRepository.findById(foreign.getId()).orElseThrow().getDeletedAt()).isNull();
	}

	@Test
	@WithMockUser(username = "anna")
	void refusesADeleteWithoutAnySelection() throws Exception {
		mockMvc.perform(delete("/api/cases").with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content("{\"ids\": []}"))
				.andExpect(status().isBadRequest());
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
