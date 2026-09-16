package de.prime_ux.backend.cases;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.auth.AsUser;
import de.prime_ux.backend.branches.BranchRepository;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.users.UserRole;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * What colleagues write to each other about a case. Everyone who works in the inbox may write;
 * only the author may change or remove what they wrote.
 */
@SpringBootTest(properties = "frontdesk.mail.polling-enabled=false")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class CaseNoteControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private CaseNoteRepository caseNoteRepository;

	@Autowired
	private CaseEventRepository caseEventRepository;

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
	private AppUser anna;
	private AppUser ben;

	@BeforeEach
	void cleanDatabaseAndCreateTenants() {
		caseRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		branchRepository.deleteAll();
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH", "musterfirma"));
		otherTenant = tenantRepository.save(new Tenant("Beispiel AG", "beispiel-ag"));
		anna = appUserRepository.save(new AppUser(tenant, "anna", "Anna", "Muster", "{noop}irrelevant", UserRole.USER));
		ben = appUserRepository.save(new AppUser(tenant, "ben", "Ben", "Beispiel", "{noop}irrelevant", UserRole.USER));
	}

	/** A Message-ID of its own each time: a tenant may hold one case per mail, and no more. */
	private Case caseOf(Tenant owner) {
		return caseRepository.save(new Case(owner, "<" + UUID.randomUUID() + "@test>", "kunde@example.com",
				"info@example.com", "Lieferung 4711", Instant.parse("2026-08-01T10:00:00Z"), false, 2048));
	}

	private String noteJson(String text) {
		return "{\"text\": \"" + text + "\"}";
	}

	@Test
	@AsUser("anna")
	void writesNotesAndReadsThemBackOldestFirst() throws Exception {
		Case aCase = caseOf(tenant);

		mockMvc.perform(post("/api/cases/{id}/notes", aCase.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(noteJson("  Kunde hat angerufen, Termin steht.  ")))
				.andExpect(status().isCreated())
				// Trimmed: the surrounding blanks are typing, not content.
				.andExpect(jsonPath("$.text").value("Kunde hat angerufen, Termin steht."))
				.andExpect(jsonPath("$.authorName").value("Anna Muster"))
				.andExpect(jsonPath("$.createdAt").exists())
				// Not edited yet, so the page has nothing to say about it.
				.andExpect(jsonPath("$.updatedAt").doesNotExist())
				.andExpect(jsonPath("$.own").value(true));

		mockMvc.perform(post("/api/cases/{id}/notes", aCase.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(noteJson("Rueckruf am Montag."))).andExpect(status().isCreated());

		mockMvc.perform(get("/api/cases/{id}/notes", aCase.getId()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				// A conversation between colleagues reads forwards.
				.andExpect(jsonPath("$[0].text").value("Kunde hat angerufen, Termin steht."))
				.andExpect(jsonPath("$[1].text").value("Rueckruf am Montag."));
	}

	@Test
	@AsUser("anna")
	void marksWhoseNoteIsWhose() throws Exception {
		Case aCase = caseOf(tenant);
		caseNoteRepository.save(new CaseNote(aCase, ben, "Ben Beispiel", "Ich kuemmere mich."));
		caseNoteRepository.save(new CaseNote(aCase, anna, "Anna Muster", "Danke."));

		mockMvc.perform(get("/api/cases/{id}/notes", aCase.getId()))
				.andExpect(status().isOk())
				// The page offers edit and delete on one of them, and the answer says which.
				.andExpect(jsonPath("$[0].own").value(false))
				.andExpect(jsonPath("$[1].own").value(true));
	}

	@Test
	@AsUser("anna")
	void editsOwnNoteAndStampsThatItChanged() throws Exception {
		Case aCase = caseOf(tenant);
		CaseNote note = caseNoteRepository.save(new CaseNote(aCase, anna, "Anna Muster", "Termin am Montag."));

		mockMvc.perform(put("/api/cases/{id}/notes/{noteId}", aCase.getId(), note.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(noteJson("Termin am Dienstag.")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.text").value("Termin am Dienstag."))
				.andExpect(jsonPath("$.updatedAt").exists());
	}

	@Test
	@AsUser("anna")
	void leavesAColleaguesNoteAlone() throws Exception {
		Case aCase = caseOf(tenant);
		CaseNote bensNote = caseNoteRepository.save(new CaseNote(aCase, ben, "Ben Beispiel", "Ich kuemmere mich."));

		// Forbidden rather than not found: Anna can read it, so pretending it is not there would
		// be a lie. Correcting what a colleague wrote would make the name above it one too.
		mockMvc.perform(put("/api/cases/{id}/notes/{noteId}", aCase.getId(), bensNote.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(noteJson("Nein, ich.")))
				.andExpect(status().isForbidden());

		mockMvc.perform(delete("/api/cases/{id}/notes/{noteId}", aCase.getId(), bensNote.getId()).with(csrf()))
				.andExpect(status().isForbidden());

		assertThat(caseNoteRepository.findById(bensNote.getId()).orElseThrow().getText()).isEqualTo("Ich kuemmere mich.");
	}

	@Test
	@AsUser("anna")
	void removesOwnNoteAndSaysInTheTrailThatSomethingWent() throws Exception {
		Case aCase = caseOf(tenant);
		CaseNote note = caseNoteRepository.save(new CaseNote(aCase, anna, "Anna Muster",
				"Erledigt sich, Kunde zahlt doch."));

		mockMvc.perform(delete("/api/cases/{id}/notes/{noteId}", aCase.getId(), note.getId()).with(csrf()))
				.andExpect(status().isNoContent());

		assertThat(caseNoteRepository.findById(note.getId())).isEmpty();
		// Writing and editing are visible on the note itself; removing is the one that would
		// otherwise leave nothing behind.
		assertThat(caseEventRepository.findAllByMailCaseIdOrderByOccurredAtAsc(aCase.getId()))
				.singleElement()
				.satisfies(event -> {
					assertThat(event.getType()).isEqualTo(CaseEventType.NOTE_DELETED);
					assertThat(event.getActorName()).isEqualTo("Anna Muster");
					// Which note went, never what it said: recording the words would make the
					// deletion pointless.
					assertThat(event.getDetails()).contains("writtenAt").doesNotContain("Kunde zahlt doch");
				});
	}

	@Test
	@AsUser("anna")
	void writesNothingIntoTheTrailForAddingOrEditingANote() throws Exception {
		Case aCase = caseOf(tenant);

		mockMvc.perform(post("/api/cases/{id}/notes", aCase.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(noteJson("Termin am Montag."))).andExpect(status().isCreated());
		CaseNote note = caseNoteRepository.findAllByMailCaseIdOrderByCreatedAtAsc(aCase.getId()).getFirst();
		mockMvc.perform(put("/api/cases/{id}/notes/{noteId}", aCase.getId(), note.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(noteJson("Termin am Dienstag."))).andExpect(status().isOk());

		// Both stand on the note, with the author, the moment and an "edited" mark; an entry
		// beside it would only repeat them.
		assertThat(caseEventRepository.findAllByMailCaseIdOrderByOccurredAtAsc(aCase.getId())).isEmpty();
	}

	@Test
	@AsUser("anna")
	void refusesAnEmptyNote() throws Exception {
		Case aCase = caseOf(tenant);

		mockMvc.perform(post("/api/cases/{id}/notes", aCase.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(noteJson("   ")))
				.andExpect(status().isBadRequest());

		assertThat(caseNoteRepository.findAllByMailCaseIdOrderByCreatedAtAsc(aCase.getId())).isEmpty();
	}

	@Test
	@AsUser("anna")
	void neverReachesAnotherTenantsCase() throws Exception {
		Case stranger = caseOf(otherTenant);

		mockMvc.perform(get("/api/cases/{id}/notes", stranger.getId())).andExpect(status().isNotFound());
		mockMvc.perform(post("/api/cases/{id}/notes", stranger.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(noteJson("Neugierig."))).andExpect(status().isNotFound());
	}

	@Test
	@AsUser("anna")
	void answersNotFoundForANoteOfAnotherCase() throws Exception {
		Case aCase = caseOf(tenant);
		Case another = caseOf(tenant);
		CaseNote note = caseNoteRepository.save(new CaseNote(another, anna, "Anna Muster", "Woanders."));

		mockMvc.perform(delete("/api/cases/{id}/notes/{noteId}", aCase.getId(), note.getId()).with(csrf()))
				.andExpect(status().isNotFound());
		mockMvc.perform(delete("/api/cases/{id}/notes/{noteId}", aCase.getId(), UUID.randomUUID()).with(csrf()))
				.andExpect(status().isNotFound());
	}

	@Test
	@AsUser("anna")
	void letsTheNotesGoWhenTheCaseIsDeletedForGood() throws Exception {
		Case aCase = caseOf(tenant);
		caseNoteRepository.save(new CaseNote(aCase, anna, "Anna Muster", "Verschwindet mit."));

		caseRepository.delete(aCase);

		assertThat(caseNoteRepository.findAllByMailCaseIdOrderByCreatedAtAsc(aCase.getId())).isEmpty();
	}

	@Test
	@AsUser("anna")
	void countsTheNotesForTheListSoARowCanShowThatThereAreAny() throws Exception {
		Case withNotes = caseOf(tenant);
		Case without = caseOf(tenant);
		caseNoteRepository.save(new CaseNote(withNotes, anna, "Anna Muster", "Eins."));
		caseNoteRepository.save(new CaseNote(withNotes, ben, "Ben Beispiel", "Zwei."));

		mockMvc.perform(get("/api/cases"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.id == '" + withNotes.getId() + "')].noteCount").value(2))
				.andExpect(jsonPath("$[?(@.id == '" + without.getId() + "')].noteCount").value(0));
	}
}
