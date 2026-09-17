package de.prime_ux.backend.cases;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.auth.AsUser;
import de.prime_ux.backend.branches.BranchRepository;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;
import de.prime_ux.backend.triage.CaseCategory;
import de.prime_ux.backend.triage.CaseCategoryRepository;
import de.prime_ux.backend.triage.CaseTier;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.users.UserRole;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * A case written down by hand, for a call taken or a fax off the machine. What it must carry is
 * the way it came in: everything else in the house reads the channel to decide whether an answer
 * can go out by mail.
 */
@SpringBootTest(properties = "frontdesk.mail.polling-enabled=false")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ManualCaseControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private CaseMessageRepository caseMessageRepository;

	@Autowired
	private CaseEventRepository caseEventRepository;

	@Autowired
	private CaseCategoryRepository caseCategoryRepository;

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

	@BeforeEach
	void cleanDatabaseAndCreateTenant() {
		caseRepository.deleteAll();
		caseCategoryRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		branchRepository.deleteAll();
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH", "musterfirma"));
		appUserRepository.save(new AppUser(tenant, "anna", "Anna", "Muster", "{noop}irrelevant", UserRole.USER));
	}

	private String callJson() {
		return """
				{
				  "channel": "phone",
				  "contact": "Herr Meier, 0170 1234567",
				  "subject": "Frage zur Rechnung 2026-081",
				  "text": "Ruft wegen der doppelten Position an, bittet um Rueckruf."
				}
				""";
	}

	@Test
	@AsUser("anna")
	void writesDownACallAsACaseWithWhatWasSaidAsItsFirstMessage() throws Exception {
		mockMvc.perform(post("/api/cases").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(callJson()))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.channel").value("phone"))
				.andExpect(jsonPath("$.sender").value("Herr Meier, 0170 1234567"))
				.andExpect(jsonPath("$.subject").value("Frage zur Rechnung 2026-081"))
				// Nothing was received and nothing transmitted.
				.andExpect(jsonPath("$.sizeBytes").value(0))
				.andExpect(jsonPath("$.hasAttachments").value(false))
				// Nobody said what it is about yet, so the triage still has something to do.
				.andExpect(jsonPath("$.tier").doesNotExist())
				// What was said stands in the conversation, where a mail's words stand too.
				.andExpect(jsonPath("$.messages.length()").value(1))
				.andExpect(jsonPath("$.messages[0].direction").value("incoming"))
				.andExpect(jsonPath("$.messages[0].bodyText")
						.value("Ruft wegen der doppelten Position an, bittet um Rueckruf."));

		Case written = caseRepository.findAll().getFirst();
		assertThat(written.getChannel()).isEqualTo(CaseChannel.PHONE);
		// No message id: a partial unique index guards the mailbox against ingesting a mail twice,
		// and two calls about the same thing are two calls.
		assertThat(written.getMessageId()).isNull();
		assertThat(caseMessageRepository.countByMailCaseId(written.getId())).isEqualTo(1);
	}

	@Test
	@AsUser("anna")
	void writesWhoTookTheCallIntoTheTrail() throws Exception {
		mockMvc.perform(post("/api/cases").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(callJson()))
				.andExpect(status().isCreated());

		Case written = caseRepository.findAll().getFirst();
		List<CaseEvent> trail = caseEventRepository.findAllByMailCaseIdOrderByOccurredAtAsc(written.getId());
		assertThat(trail).hasSize(1);
		// Its own type, and with a name: unlike the mailbox, a person did this.
		assertThat(trail.getFirst().getType()).isEqualTo(CaseEventType.CREATED_MANUALLY);
		assertThat(trail.getFirst().getActorName()).isEqualTo("Anna Muster");
	}

	@Test
	@AsUser("anna")
	void takesTheCategoryAndTierFromWhoeverAlreadyKnows() throws Exception {
		CaseCategory category = caseCategoryRepository.save(new CaseCategory(tenant, "INVOICE", "Rechnung", "Beschreibung.", CaseTier.MANUAL, 0));

		mockMvc.perform(post("/api/cases").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
				{
				  "channel": "fax",
				  "contact": "Musterfirma, Fax 0221 4711",
				  "subject": "Rechnung 2026-081",
				  "text": "Fax mit der Rechnungskopie.",
				  "categoryId": "%s",
				  "tier": "manual"
				}
				""".formatted(category.getId()))).andExpect(status().isCreated())
				.andExpect(jsonPath("$.channel").value("fax"))
				.andExpect(jsonPath("$.categoryName").value("Rechnung"))
				.andExpect(jsonPath("$.tier").value("manual"));
	}

	@Test
	@AsUser("anna")
	void refusesToWriteDownAMailCase() throws Exception {
		// A mail case comes from the mailbox. One typed by hand would carry a sender nobody ever
		// wrote from, and the send path would answer to it.
		mockMvc.perform(post("/api/cases").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
				{
				  "channel": "mail",
				  "contact": "kunde@example.com",
				  "subject": "Frage",
				  "text": "Text."
				}
				""")).andExpect(status().isBadRequest());
	}

	@Test
	@AsUser("anna")
	void insistsOnWhoItWasAndWhatWasSaid() throws Exception {
		mockMvc.perform(post("/api/cases").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
				{
				  "channel": "phone",
				  "contact": "   ",
				  "subject": "Frage",
				  "text": "Text."
				}
				""")).andExpect(status().isBadRequest());

		mockMvc.perform(post("/api/cases").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
				{
				  "channel": "phone",
				  "contact": "Herr Meier",
				  "subject": "Frage",
				  "text": "   "
				}
				""")).andExpect(status().isBadRequest());

		assertThat(caseRepository.findAll()).isEmpty();
	}
}
