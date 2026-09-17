package de.prime_ux.backend.replies;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.icegreen.greenmail.util.GreenMail;
import com.icegreen.greenmail.util.ServerSetupTest;
import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.branches.BranchRepository;
import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.cases.CaseEvent;
import de.prime_ux.backend.cases.CaseEventRepository;
import de.prime_ux.backend.cases.CaseEventType;
import de.prime_ux.backend.cases.CaseChannel;
import de.prime_ux.backend.cases.CaseMessage;
import de.prime_ux.backend.cases.CaseMessageRepository;
import de.prime_ux.backend.cases.CaseNote;
import de.prime_ux.backend.cases.CaseNoteRepository;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.mailsettings.MailSettingsMode;
import de.prime_ux.backend.mailsettings.TenantMailSettings;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;
import de.prime_ux.backend.triage.CaseTier;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import de.prime_ux.backend.users.UserRole;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import de.prime_ux.backend.auth.AsUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * A reply leaves the house: through the tenant's own mailbox, here an embedded GreenMail as the
 * SMTP server, threaded onto the customer's latest mail and put into the conversation.
 */
@SpringBootTest(properties = "frontdesk.mail.polling-enabled=false")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ReplySendControllerTest {

	// A dynamic port, so a locally running GreenMail container is never in the way.
	private static final GreenMail greenMail = new GreenMail(ServerSetupTest.SMTP.dynamicPort());

	static {
		greenMail.start();
	}

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private CaseMessageRepository caseMessageRepository;

	@Autowired
	private CaseEventRepository caseEventRepository;

	@Autowired
	private AppUserRepository appUserRepository;

	@Autowired
	private CaseNoteRepository caseNoteRepository;

	@Autowired
	private TenantRepository tenantRepository;

	@Autowired
	private TenantLogoRepository tenantLogoRepository;

	@Autowired
	private TenantMailSettingsRepository tenantMailSettingsRepository;

	@Autowired
	private BranchRepository branchRepository;

	private Tenant tenant;

	@AfterAll
	static void stopGreenMail() {
		greenMail.stop();
	}

	@BeforeEach
	void cleanDatabaseAndCreateTenant() throws Exception {
		caseRepository.deleteAll();
		tenantMailSettingsRepository.deleteAll();
		tenantLogoRepository.deleteAll();
		appUserRepository.deleteAll();
		branchRepository.deleteAll();
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH", "musterfirma"));
		// A regular user: sending a reply is nobody's admin job.
		appUserRepository.save(new AppUser(tenant, "anna", "Anna", "Muster", "{noop}irrelevant", UserRole.USER));
		greenMail.purgeEmailFromAllMailboxes();
		greenMail.setUser("inbox@frontdesk.local", "secret");
	}

	/** The tenant's mailbox, pointed at the embedded server's SMTP port. */
	private void mailboxOnPort(int smtpPort) {
		tenantMailSettingsRepository.save(new TenantMailSettings(tenant, MailSettingsMode.CUSTOM, "localhost", 3143,
				false, "localhost", smtpPort, false, "inbox@frontdesk.local", "secret", "INBOX", false));
	}

	/** A case with its opening mail and a reply waiting, from a customer who wrote to the given address. */
	private Case drafted(String recipient, String subject) {
		String messageId = "<" + subject.replace(' ', '-') + "@example.com>";
		Case aCase = new Case(tenant, messageId, "kunde@example.com", recipient, subject,
				Instant.parse("2026-08-01T10:00:00Z"), false, 2048);
		aCase.applyTriage(null, CaseTier.DRAFT, new BigDecimal("0.8"), "Kunde fragt nach.");
		aCase.applyDraft("Guten Tag,\n\ndie Lieferung ist unterwegs.\n\nMit freundlichen Grüßen\nMusterfirma GmbH");
		Case saved = caseRepository.save(aCase);
		caseMessageRepository.save(CaseMessage.incoming(saved, 0, messageId, "kunde@example.com", recipient, subject,
				"Wann kommt die Lieferung?", null, saved.getReceivedAt(), 2048, false));
		return saved;
	}

	private Case reload(Case aCase) {
		return caseRepository.findById(aCase.getId()).orElseThrow();
	}

	private List<CaseMessage> conversationOf(Case aCase) {
		return caseMessageRepository.findAllByMailCaseIdOrderByPositionAsc(aCase.getId());
	}

	@Test
	@AsUser("anna")
	void neverPostsAnAnswerToSomethingThatIsNotAnAddress() throws Exception {
		mailboxOnPort(greenMail.getSmtp().getPort());
		// A call written down by hand: its sender is a person, with a telephone number where a
		// mailbox would stand. Without the channel to go by, the reply would be posted to it.
		Case aCase = Case.manual(tenant, CaseChannel.PHONE, "Herr Meier, 0170 1234567",
				"Frage zur Rechnung", Instant.parse("2026-08-01T10:00:00Z"), 0);
		aCase.applyTriage(null, CaseTier.DRAFT, new BigDecimal("0.8"), "Kunde fragt nach.");
		aCase.applyDraft("Guten Tag, wie besprochen. Musterfirma GmbH");
		Case saved = caseRepository.save(aCase);
		caseMessageRepository.save(CaseMessage.incoming(saved, 0, null, "Herr Meier, 0170 1234567", null,
				"Frage zur Rechnung", "Ruft wegen der doppelten Position an.", null, saved.getReceivedAt(), 0, false));

		// A refusal, the way every other one is answered: the request is fine, the case is not.
		mockMvc.perform(post("/api/cases/{id}/send", saved.getId()).with(csrf())).andExpect(status().isConflict());

		// Nothing left the house, and the case is untouched: the draft still stands and the
		// conversation holds nothing but what was written down.
		assertThat(greenMail.waitForIncomingEmail(1000, 1)).isFalse();
		assertThat(reload(saved).getDraftText()).isNotNull();
		assertThat(reload(saved).getHandledAt()).isNull();
		assertThat(conversationOf(saved)).hasSize(1);
	}

	@Test
	@AsUser("anna")
	void neverCarriesAnInternalNoteOutOfTheHouse() throws Exception {
		mailboxOnPort(greenMail.getSmtp().getPort());
		Case aCase = drafted("rechnung@musterfirma.de", "Lieferung 4711");
		// What colleagues say to each other, in words no customer may ever read.
		caseNoteRepository.save(new CaseNote(aCase,
				appUserRepository.findByTenantIdAndUsernameIgnoreCase(tenant.getId(), "anna").orElseThrow(),
				"Anna Muster", "Stammkunde, zahlt immer zu spaet - nicht erwaehnen!"));

		mockMvc.perform(post("/api/cases/{id}/send", aCase.getId()).with(csrf())).andExpect(status().isOk());

		assertThat(greenMail.waitForIncomingEmail(5000, 1)).isTrue();
		MimeMessage sent = greenMail.getReceivedMessages()[0];
		// Not in the body, not in the subject, not anywhere in the mail as it went over the wire.
		assertThat((String) sent.getContent()).doesNotContain("zahlt immer zu spaet");
		assertThat(sent.getSubject()).doesNotContain("zahlt immer zu spaet");
		assertThat(rawOf(sent)).doesNotContain("zahlt immer zu spaet");
	}

	/** The mail as the server received it, headers and all — the one place nothing can hide. */
	private static String rawOf(MimeMessage message) throws Exception {
		java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
		message.writeTo(bytes);
		return bytes.toString(java.nio.charset.StandardCharsets.UTF_8);
	}

	@Test
	@AsUser("anna")
	void sendsTheReplyThreadedOntoTheCustomersMailAndPutsItIntoTheConversation() throws Exception {
		mailboxOnPort(greenMail.getSmtp().getPort());
		Case aCase = drafted("rechnung@musterfirma.de", "Lieferung 4711");

		mockMvc.perform(post("/api/cases/{id}/send", aCase.getId()).with(csrf()))
				.andExpect(status().isOk())
				// Sending is taking note: the case has left the inbox.
				.andExpect(jsonPath("$.handledAt").exists())
				// The reply is a message now, and the box is empty for the next one.
				.andExpect(jsonPath("$.draftText").doesNotExist())
				.andExpect(jsonPath("$.messages.length()").value(2))
				.andExpect(jsonPath("$.messages[1].direction").value("outgoing"))
				.andExpect(jsonPath("$.messages[1].sender").value("inbox@frontdesk.local"))
				.andExpect(jsonPath("$.messages[1].recipient").value("kunde@example.com"))
				.andExpect(jsonPath("$.messages[1].subject").value("Re: Lieferung 4711"))
				.andExpect(jsonPath("$.messages[1].bodyText").value(aCase.getDraftText()))
				.andExpect(jsonPath("$.messages[1].sentByName").value("Anna Muster"))
				.andExpect(jsonPath("$.events[-1].type").value("sent"))
				.andExpect(jsonPath("$.events[-1].actorName").value("Anna Muster"))
				.andExpect(jsonPath("$.events[-1].details.to").value("kunde@example.com"))
				.andExpect(jsonPath("$.events[-1].details.subject").value("Re: Lieferung 4711"));

		assertThat(greenMail.waitForIncomingEmail(5000, 1)).isTrue();
		MimeMessage sent = greenMail.getReceivedMessages()[0];
		// From the mailbox, in the company's name; Reply-To is the alias the customer wrote to.
		InternetAddress from = (InternetAddress) sent.getFrom()[0];
		assertThat(from.getAddress()).isEqualTo("inbox@frontdesk.local");
		assertThat(from.getPersonal()).isEqualTo("Musterfirma GmbH");
		assertThat(((InternetAddress) sent.getReplyTo()[0]).getAddress()).isEqualTo("rechnung@musterfirma.de");
		assertThat(((InternetAddress) sent.getAllRecipients()[0]).getAddress()).isEqualTo("kunde@example.com");
		assertThat(sent.getSubject()).isEqualTo("Re: Lieferung 4711");
		// Threaded onto the customer's mail, so their client shows it under it.
		assertThat(sent.getHeader("In-Reply-To")[0]).isEqualTo("<Lieferung-4711@example.com>");
		assertThat(sent.getHeader("References")[0]).isEqualTo("<Lieferung-4711@example.com>");
		// Decoded, as the customer reads it: the umlauts survive the transfer encoding.
		assertThat((String) sent.getContent()).contains("die Lieferung ist unterwegs.").contains("Grüßen");

		Case stored = reload(aCase);
		assertThat(stored.getDraftText()).isNull();
		assertThat(stored.getHandledAt()).isNotNull();
		List<CaseMessage> conversation = conversationOf(stored);
		assertThat(conversation).hasSize(2);
		assertThat(conversation.get(1).getMessageId()).isEqualTo(sent.getMessageID());
		assertThat(stored.getLastMessageAt()).isEqualTo(conversation.get(1).getOccurredAt());
		// One step for the click, not two: sent says it all.
		assertThat(caseEventRepository.findAllByMailCaseIdOrderByOccurredAtAsc(stored.getId()))
				.extracting(CaseEvent::getType)
				.containsExactly(CaseEventType.SENT);
	}

	@Test
	@AsUser("anna")
	void answersTheCustomersLatestMailWithTheWholeConversationInReferences() throws Exception {
		mailboxOnPort(greenMail.getSmtp().getPort());
		Case aCase = drafted("inbox@frontdesk.local", "Lieferung 4711");
		// One round already: our reply, and the customer writing again from another address.
		caseMessageRepository.save(CaseMessage.outgoing(aCase, 1, "<r1@frontdesk.local>", "inbox@frontdesk.local",
				"kunde@example.com", "Re: Lieferung 4711", "Morgen.", Instant.parse("2026-08-01T11:00:00Z"), "Anna Muster"));
		caseMessageRepository.save(CaseMessage.incoming(aCase, 2, "<m2@example.com>", "kunde.privat@example.com",
				"inbox@frontdesk.local", "AW: Lieferung 4711", "Welche Sendungsnummer?", null,
				Instant.parse("2026-08-01T12:00:00Z"), 1024, false));

		mockMvc.perform(post("/api/cases/{id}/send", aCase.getId()).with(csrf())).andExpect(status().isOk());

		assertThat(greenMail.waitForIncomingEmail(5000, 1)).isTrue();
		MimeMessage sent = greenMail.getReceivedMessages()[0];
		// To the address the customer last wrote from, under their latest mail, over the whole thread.
		assertThat(((InternetAddress) sent.getAllRecipients()[0]).getAddress()).isEqualTo("kunde.privat@example.com");
		assertThat(sent.getHeader("In-Reply-To")[0]).isEqualTo("<m2@example.com>");
		assertThat(sent.getHeader("References")[0]).isEqualTo("<Lieferung-4711@example.com> <r1@frontdesk.local> <m2@example.com>");
		// The customer wrote to the mailbox itself: nothing to redirect the answer to.
		assertThat(sent.getHeader("Reply-To")).isNull();
		assertThat(conversationOf(aCase)).hasSize(4);
	}

	@Test
	@AsUser("anna")
	void letsAFurtherReplyBeWrittenAndSentAfterTheFirst() throws Exception {
		mailboxOnPort(greenMail.getSmtp().getPort());
		Case aCase = drafted("inbox@frontdesk.local", "AW: Lieferung 4711");

		mockMvc.perform(post("/api/cases/{id}/send", aCase.getId()).with(csrf())).andExpect(status().isOk());
		// Nothing to send until something is in the box again.
		mockMvc.perform(post("/api/cases/{id}/send", aCase.getId()).with(csrf())).andExpect(status().isConflict());

		mockMvc.perform(put("/api/cases/{id}/draft", aCase.getId()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"text": "Nachtrag: die Sendungsnummer lautet 4711."}"""))
				.andExpect(status().isOk());
		mockMvc.perform(post("/api/cases/{id}/send", aCase.getId()).with(csrf())).andExpect(status().isOk());

		assertThat(greenMail.waitForIncomingEmail(5000, 2)).isTrue();
		MimeMessage[] both = greenMail.getReceivedMessages();
		// A subject that already says it is a reply is left alone.
		assertThat(both[0].getSubject()).isEqualTo("AW: Lieferung 4711");
		assertThat((String) both[1].getContent()).contains("Nachtrag");
		assertThat(conversationOf(aCase)).hasSize(3);
	}

	@Test
	@AsUser("anna")
	void refusesWhatCannotBeSentAndSaysWhy() throws Exception {
		mailboxOnPort(greenMail.getSmtp().getPort());
		Case trashed = drafted("info@musterfirma.de", "Im Papierkorb");
		trashed.moveToTrash();
		caseRepository.save(trashed);
		Case blank = caseRepository.save(new Case(tenant, "<blank@test>", "kunde@example.com", "info@musterfirma.de",
				"Ohne Entwurf", Instant.parse("2026-08-01T10:00:00Z"), false, 2048));

		mockMvc.perform(post("/api/cases/{id}/send", trashed.getId()).with(csrf())).andExpect(status().isConflict());
		mockMvc.perform(post("/api/cases/{id}/send", blank.getId()).with(csrf())).andExpect(status().isConflict());

		assertThat(greenMail.getReceivedMessages()).isEmpty();
	}

	@Test
	@AsUser("anna")
	void refusesToSendWithoutAMailServerToSendThrough() throws Exception {
		Case aCase = drafted("info@musterfirma.de", "Lieferung 4711");

		// No mail settings at all for this tenant.
		mockMvc.perform(post("/api/cases/{id}/send", aCase.getId()).with(csrf())).andExpect(status().isConflict());

		assertThat(reload(aCase).getDraftText()).isNotNull();
	}

	@Test
	@AsUser("anna")
	void leavesTheCaseAsItWasWhenTheMailServerCannotBeReached() throws Exception {
		// Port 1: nothing listens there.
		mailboxOnPort(1);
		Case aCase = drafted("info@musterfirma.de", "Lieferung 4711");

		mockMvc.perform(post("/api/cases/{id}/send", aCase.getId()).with(csrf())).andExpect(status().isBadGateway());

		Case unchanged = reload(aCase);
		assertThat(unchanged.getDraftText()).isNotNull();
		assertThat(unchanged.getHandledAt()).isNull();
		assertThat(conversationOf(unchanged)).hasSize(1);
		assertThat(caseEventRepository.findAllByMailCaseIdOrderByOccurredAtAsc(aCase.getId())).isEmpty();
	}

	@Test
	@AsUser("anna")
	void doesNotFindAnotherTenantsCase() throws Exception {
		Tenant other = tenantRepository.save(new Tenant("Beispiel AG", "beispiel-ag"));
		Case foreign = caseRepository.save(new Case(other, "<foreign@test>", "fritz@example.com", "info@beispiel.de",
				"Fremd", Instant.parse("2026-08-03T10:00:00Z"), false, 1024));

		mockMvc.perform(post("/api/cases/{id}/send", foreign.getId()).with(csrf())).andExpect(status().isNotFound());
	}
}
