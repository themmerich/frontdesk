package de.prime_ux.backend.replies;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
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
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;
import de.prime_ux.backend.triage.CaseTier;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.users.UserRole;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/** The draft as the detail page works with it, with the model replaced by the processor test's stand-in. */
@SpringBootTest(properties = { "frontdesk.mail.polling-enabled=false", "frontdesk.triage.enabled=false",
		"frontdesk.drafts.enabled=false" })
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, ReplyDraftProcessorTest.StubReplyDraftServiceConfiguration.class })
class ReplyDraftControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private ReplyDraftProcessorTest.StubReplyDraftService stubReplyDraftService;

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

	@BeforeEach
	void cleanDatabaseAndCreateTenants() {
		caseRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		branchRepository.deleteAll();
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
		otherTenant = tenantRepository.save(new Tenant("Beispiel AG"));
		// A regular user: answering mail is nobody's admin job.
		appUserRepository.save(new AppUser(tenant, "anna", "Anna", "Muster", "{noop}irrelevant", UserRole.USER));
		stubReplyDraftService.reset();
	}

	private Case caseOf(Tenant owner, String subject) {
		Case aCase = new Case(owner, "<" + subject + "@test>", "kunde@example.com", "info@example.com", subject,
				"Wann kommt die Lieferung?", Instant.parse("2026-08-01T10:00:00Z"), false, 2048);
		aCase.applyTriage(null, CaseTier.MANUAL, new BigDecimal("0.5"), "Kunde fragt nach.");
		return caseRepository.save(aCase);
	}

	private Case reload(Case aCase) {
		return caseRepository.findById(aCase.getId()).orElseThrow();
	}

	@Test
	@WithMockUser(username = "anna")
	void writesADraftOnRequest() throws Exception {
		Case aCase = caseOf(tenant, "Lieferung 4711");
		stubReplyDraftService.answer("Guten Tag, wir prüfen das.");

		mockMvc.perform(post("/api/cases/{id}/draft", aCase.getId()).with(csrf()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.draftText").value("Guten Tag, wir prüfen das."))
				.andExpect(jsonPath("$.draftGeneratedAt").exists())
				.andExpect(jsonPath("$.draftUpdatedAt").exists());

		assertThat(reload(aCase).getDraftGeneratedText()).isEqualTo("Guten Tag, wir prüfen das.");
		// Asked without a word: the model gets none.
		assertThat(stubReplyDraftService.lastInstruction).isNull();
	}

	@Test
	@WithMockUser(username = "anna")
	void passesThePersonsLineOnToTheModelAndKeepsNothingOfIt() throws Exception {
		Case aCase = caseOf(tenant, "Stellenangebot");

		mockMvc.perform(post("/api/cases/{id}/draft", aCase.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"instruction": "Lehne ab und nenne unsere Verfügbarkeit dieses Jahr."}"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.draftText").exists())
				.andExpect(jsonPath("$.instruction").doesNotExist());

		assertThat(stubReplyDraftService.lastInstruction).isEqualTo("Lehne ab und nenne unsere Verfügbarkeit dieses Jahr.");
	}

	@Test
	@WithMockUser(username = "anna")
	void refusesALineThatIsALetter() throws Exception {
		Case aCase = caseOf(tenant, "Zu viel");

		mockMvc.perform(post("/api/cases/{id}/draft", aCase.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"instruction\": \"" + "x".repeat(1001) + "\"}"))
				.andExpect(status().isBadRequest());

		assertThat(reload(aCase).hasDraft()).isFalse();
	}

	@Test
	@WithMockUser(username = "anna")
	void signsTheReplyInTheNameOfWhoeverAsked() throws Exception {
		tenant.updateCompany(tenant.getName(), null, tenant.getLogoDisplay(), null,
				"Mit freundlichen Grüßen\n{{vorname}} {{nachname}}\n{{firma}}", null);
		tenantRepository.save(tenant);
		Case aCase = caseOf(tenant, "Lieferung 4711");

		mockMvc.perform(post("/api/cases/{id}/draft", aCase.getId()).with(csrf()))
				.andExpect(status().isOk());

		assertThat(stubReplyDraftService.lastSignature).isEqualTo("Mit freundlichen Grüßen\nAnna Muster\nMusterfirma GmbH");
	}

	@Test
	@WithMockUser(username = "anna")
	void savesAPersonsVersionAndKeepsTheModelsBesideIt() throws Exception {
		Case aCase = caseOf(tenant, "Lieferung 4711");
		aCase.applyDraft("Die Antwort des Modells.");
		caseRepository.save(aCase);

		mockMvc.perform(put("/api/cases/{id}/draft", aCase.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"text": "Die Antwort, wie Anna sie schreibt."}"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.draftText").value("Die Antwort, wie Anna sie schreibt."));

		Case edited = reload(aCase);
		assertThat(edited.getDraftText()).isEqualTo("Die Antwort, wie Anna sie schreibt.");
		// What the model wrote stays, so it can be measured later how much had to change.
		assertThat(edited.getDraftGeneratedText()).isEqualTo("Die Antwort des Modells.");
	}

	@Test
	@WithMockUser(username = "anna")
	void letsAPersonWriteADraftWhereTheModelNeverDid() throws Exception {
		Case aCase = caseOf(tenant, "Ohne Modell");

		mockMvc.perform(put("/api/cases/{id}/draft", aCase.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"text": "Selbst geschrieben."}"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.draftText").value("Selbst geschrieben."))
				.andExpect(jsonPath("$.draftGeneratedAt").doesNotExist());

		assertThat(reload(aCase).getDraftGeneratedText()).isNull();
	}

	@Test
	@WithMockUser(username = "anna")
	void refusesAnEmptyDraft() throws Exception {
		Case aCase = caseOf(tenant, "Leer");

		mockMvc.perform(put("/api/cases/{id}/draft", aCase.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"text": "   "}"""))
				.andExpect(status().isBadRequest());

		assertThat(reload(aCase).hasDraft()).isFalse();
	}

	@Test
	@WithMockUser(username = "anna")
	void doesNotFindAnotherTenantsCase() throws Exception {
		Case foreign = caseOf(otherTenant, "Fremd");

		mockMvc.perform(post("/api/cases/{id}/draft", foreign.getId()).with(csrf()))
				.andExpect(status().isNotFound());
		mockMvc.perform(put("/api/cases/{id}/draft", foreign.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"text": "Hallo"}"""))
				.andExpect(status().isNotFound());
		mockMvc.perform(post("/api/cases/{id}/draft", UUID.randomUUID()).with(csrf()))
				.andExpect(status().isNotFound());

		assertThat(reload(foreign).hasDraft()).isFalse();
	}

	@Test
	@WithMockUser(username = "anna")
	void answersNoMailThatWasThrownAway() throws Exception {
		Case trashed = caseOf(tenant, "Im Papierkorb");
		trashed.moveToTrash();
		caseRepository.save(trashed);

		mockMvc.perform(post("/api/cases/{id}/draft", trashed.getId()).with(csrf()))
				.andExpect(status().isConflict());
		mockMvc.perform(put("/api/cases/{id}/draft", trashed.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"text": "Hallo"}"""))
				.andExpect(status().isConflict());

		assertThat(reload(trashed).hasDraft()).isFalse();
		assertThat(stubReplyDraftService.draftedSubjects).isEmpty();
	}

	@Test
	@WithMockUser(username = "anna")
	void saysSoWhenTheModelGaveNoDraft() throws Exception {
		Case aCase = caseOf(tenant, "Kein Glück");
		stubReplyDraftService.fail();

		// The upstream's failure, not the request's.
		mockMvc.perform(post("/api/cases/{id}/draft", aCase.getId()).with(csrf()))
				.andExpect(status().isBadGateway());

		assertThat(reload(aCase).hasDraft()).isFalse();
	}

	@Test
	@WithMockUser(username = "anna")
	void tellsTheInboxWhichCasesHaveADraft() throws Exception {
		Case drafted = caseOf(tenant, "Mit Entwurf");
		drafted.applyDraft("Guten Tag.");
		caseRepository.save(drafted);
		caseOf(tenant, "Ohne Entwurf");

		mockMvc.perform(get("/api/cases"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.subject == 'Mit Entwurf')].hasDraft").value(true))
				.andExpect(jsonPath("$[?(@.subject == 'Ohne Entwurf')].hasDraft").value(false))
				// The text itself is the detail's; the list only says that there is one.
				.andExpect(jsonPath("$[0].draftText").doesNotExist());

		mockMvc.perform(get("/api/cases/{id}", drafted.getId()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.draftText").value("Guten Tag."));
	}
}
