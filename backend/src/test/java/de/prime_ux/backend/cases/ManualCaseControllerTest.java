package de.prime_ux.backend.cases;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
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
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

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
	private CaseAttachmentRepository caseAttachmentRepository;

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
	private AppUser anna;
	private AppUser ben;

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
		anna = appUserRepository.save(new AppUser(tenant, "anna", "Anna", "Muster", "{noop}irrelevant", UserRole.USER));
		ben = appUserRepository.save(new AppUser(tenant, "ben", "Ben", "Beispiel", "{noop}irrelevant", UserRole.USER));
	}

	/** What the trail holds for a case, oldest first. */
	private List<CaseEvent> trailOf(Case aCase) {
		return caseEventRepository.findAllByMailCaseIdOrderByOccurredAtAsc(aCase.getId());
	}

	private String callAssignedTo(AppUser assignee) {
		return """
				{
				  "channel": "phone",
				  "contact": "Herr Meier, 0170 1234567",
				  "subject": "Frage zur Rechnung",
				  "text": "Ruft an.",
				  "assigneeId": "%s"
				}
				""".formatted(assignee.getId());
	}

	/**
	 * The request as the page sends it: the case as a JSON part, so what is validated stays a
	 * record rather than a handful of form fields.
	 */
	private MockMultipartHttpServletRequestBuilder writingDown(String caseJson, MockMultipartFile... files) {
		MockMultipartHttpServletRequestBuilder request = multipart("/api/cases").with(csrf());
		request.file(new MockMultipartFile("case", "", MediaType.APPLICATION_JSON_VALUE,
				caseJson.getBytes(StandardCharsets.UTF_8)));
		for (MockMultipartFile file : files) {
			request.file(file);
		}
		return request;
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
		mockMvc.perform(writingDown(callJson()))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.channel").value("phone"))
				.andExpect(jsonPath("$.sender").value("Herr Meier, 0170 1234567"))
				.andExpect(jsonPath("$.subject").value("Frage zur Rechnung 2026-081"))
				// A call that came with nothing carries nothing.
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
		mockMvc.perform(writingDown(callJson()))
				.andExpect(status().isCreated());

		Case written = caseRepository.findAll().getFirst();
		List<CaseEvent> trail = trailOf(written);
		assertThat(trail).hasSize(1);
		// Its own type, and with a name: unlike the mailbox, a person did this.
		assertThat(trail.getFirst().getType()).isEqualTo(CaseEventType.CREATED_MANUALLY);
		assertThat(trail.getFirst().getActorName()).isEqualTo("Anna Muster");
	}

	@Test
	@AsUser("anna")
	void takesTheCategoryAndTierFromWhoeverAlreadyKnows() throws Exception {
		CaseCategory category = caseCategoryRepository.save(new CaseCategory(tenant, "INVOICE", "Rechnung", "Beschreibung.", CaseTier.MANUAL, 0));

		mockMvc.perform(writingDown("""
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
	void tellsAColleagueAboutTheCallTakenForThem() throws Exception {
		mockMvc.perform(writingDown(callAssignedTo(ben))).andExpect(status().isCreated())
				.andExpect(jsonPath("$.assigneeName").value("Ben Beispiel"));

		Case written = caseRepository.findAll().getFirst();
		// Two things happened, so the trail holds two. The second is what the bell reads: without
		// it, taking a call for a colleague would tell them nothing, while handing the case over a
		// click later would.
		assertThat(trailOf(written)).extracting(CaseEvent::getType)
				.containsExactly(CaseEventType.CREATED_MANUALLY, CaseEventType.ASSIGNED);
		assertThat(caseEventRepository.unseenFor(tenant.getId(), ben.getId(), Instant.parse("2020-01-01T00:00:00Z")))
				.extracting(CaseEventRepository.UnseenEvent::getSubject).containsExactly("Frage zur Rechnung");
	}

	@Test
	@AsUser("anna")
	void saysNothingWhenSomebodyTakesTheCallForThemselves() throws Exception {
		mockMvc.perform(writingDown(callAssignedTo(anna))).andExpect(status().isCreated())
				.andExpect(jsonPath("$.assigneeName").value("Anna Muster"));

		// The entry is written like any other; the bell passes it over because the actor is the
		// assignee, and nobody needs telling what they just did themselves.
		Case written = caseRepository.findAll().getFirst();
		assertThat(trailOf(written)).extracting(CaseEvent::getType)
				.containsExactly(CaseEventType.CREATED_MANUALLY, CaseEventType.ASSIGNED);
		assertThat(caseEventRepository.unseenFor(tenant.getId(), anna.getId(), Instant.parse("2020-01-01T00:00:00Z")))
				.isEmpty();
	}

	@Test
	@AsUser("anna")
	void leavesTheCaseToNobodyWhenNobodyWasNamed() throws Exception {
		mockMvc.perform(writingDown(callJson()))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.assigneeName").doesNotExist());

		// Only the writing down happened, so only that stands in the trail.
		assertThat(trailOf(caseRepository.findAll().getFirst())).extracting(CaseEvent::getType)
				.containsExactly(CaseEventType.CREATED_MANUALLY);
	}

	@Test
	@AsUser("anna")
	void keepsWhatWasScannedInOnTheOpeningMessage() throws Exception {
		MockMultipartFile fax = new MockMultipartFile("files", "Rechnung 2026-081.pdf", "application/pdf",
				"%PDF-1.4 nicht wirklich".getBytes(StandardCharsets.UTF_8));

		mockMvc.perform(writingDown(callJson(), fax)).andExpect(status().isCreated())
				// The case says it carries something, the way an ingested mail does.
				.andExpect(jsonPath("$.hasAttachments").value(true))
				.andExpect(jsonPath("$.sizeBytes").value("%PDF-1.4 nicht wirklich".length()))
				.andExpect(jsonPath("$.messages[0].attachments.length()").value(1))
				.andExpect(jsonPath("$.messages[0].attachments[0].fileName").value("Rechnung 2026-081.pdf"))
				.andExpect(jsonPath("$.messages[0].attachments[0].contentType").value("application/pdf"));

		Case written = caseRepository.findAll().getFirst();
		CaseAttachmentRepository.AttachmentSummary stored = caseAttachmentRepository
				.findAllByMailCaseIdOrderByPosition(written.getId()).getFirst();
		assertThat(stored.getSizeBytes()).isEqualTo("%PDF-1.4 nicht wirklich".getBytes(StandardCharsets.UTF_8).length);
		// Nothing is inline: a scanned fax is a document, not a picture the text refers to.
		assertThat(stored.isInline()).isFalse();
		assertThat(stored.getContentId()).isNull();
		// What the case carries is what the size column asks about: the bytes that hang on it, not
		// how much travelled over a wire.
		assertThat(written.getSizeBytes())
				.isEqualTo("%PDF-1.4 nicht wirklich".getBytes(StandardCharsets.UTF_8).length);
	}

	@Test
	@AsUser("anna")
	void takesOnlyTheNameOfTheFileEvenWhenTheBrowserSendsAPath() throws Exception {
		// Both separators are cut, and neither is left to the server's idea of one: this is what a
		// Windows browser sends, and the server it reaches runs on Linux.
		MockMultipartFile windows = new MockMultipartFile("files", "C:\\Users\\anna\\Desktop\\Fax.pdf",
				"application/pdf", "egal".getBytes(StandardCharsets.UTF_8));
		MockMultipartFile unix = new MockMultipartFile("files", "/home/anna/Scan.pdf", "application/pdf",
				"egal".getBytes(StandardCharsets.UTF_8));

		mockMvc.perform(writingDown(callJson(), windows, unix)).andExpect(status().isCreated())
				.andExpect(jsonPath("$.messages[0].attachments[0].fileName").value("Fax.pdf"))
				.andExpect(jsonPath("$.messages[0].attachments[1].fileName").value("Scan.pdf"));
	}

	@Test
	@AsUser("anna")
	void refusesAnAttachmentBiggerThanItWillCarry() throws Exception {
		// The decision of 12.09. that attachments have no size limit is about what the mailbox
		// delivers. A browser is not the mailbox: without a ceiling anybody could push anything
		// through the heap and into the column.
		MockMultipartFile tooBig = new MockMultipartFile("files", "gross.pdf", "application/pdf",
				new byte[11 * 1024 * 1024]);

		mockMvc.perform(writingDown(callJson(), tooBig)).andExpect(status().isPayloadTooLarge());

		assertThat(caseRepository.findAll()).isEmpty();
	}

	@Test
	@AsUser("anna")
	void saysTheCaseCarriesNothingWhenNothingCameWithIt() throws Exception {
		mockMvc.perform(writingDown(callJson())).andExpect(status().isCreated())
				.andExpect(jsonPath("$.hasAttachments").value(false))
				.andExpect(jsonPath("$.messages[0].attachments.length()").value(0));
	}

	@Test
	@AsUser("anna")
	void refusesToWriteDownAMailCase() throws Exception {
		// A mail case comes from the mailbox. One typed by hand would carry a sender nobody ever
		// wrote from, and the send path would answer to it.
		mockMvc.perform(writingDown("""
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
		mockMvc.perform(writingDown("""
				{
				  "channel": "phone",
				  "contact": "   ",
				  "subject": "Frage",
				  "text": "Text."
				}
				""")).andExpect(status().isBadRequest());

		mockMvc.perform(writingDown("""
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
