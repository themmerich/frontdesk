package de.prime_ux.backend.replies;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * A reply leaves the house: through the tenant's own mailbox, here an embedded GreenMail as the
 * SMTP server, threaded onto the customer's mail and written down on the case.
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
	private AppUser anna;

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
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
		// A regular user: sending a reply is nobody's admin job.
		anna = appUserRepository.save(new AppUser(tenant, "anna", "Anna", "Muster", "{noop}irrelevant", UserRole.USER));
		greenMail.purgeEmailFromAllMailboxes();
		greenMail.setUser("inbox@frontdesk.local", "secret");
	}

	/** The tenant's mailbox, pointed at the embedded server's SMTP port. */
	private void mailboxOnPort(int smtpPort) {
		tenantMailSettingsRepository.save(new TenantMailSettings(tenant, MailSettingsMode.CUSTOM, "localhost", 3143,
				false, "localhost", smtpPort, false, "inbox@frontdesk.local", "secret", "INBOX", false));
	}

	/** A case with a reply waiting, from a customer who wrote to the given address. */
	private Case drafted(String recipient, String subject) {
		Case aCase = new Case(tenant, "<" + subject.replace(' ', '-') + "@example.com>", "kunde@example.com", recipient, subject,
				"Wann kommt die Lieferung?", Instant.parse("2026-08-01T10:00:00Z"), false, 2048);
		aCase.applyTriage(null, CaseTier.DRAFT, new BigDecimal("0.8"), "Kunde fragt nach.");
		aCase.applyDraft("Guten Tag,\n\ndie Lieferung ist unterwegs.\n\nMit freundlichen Grüßen\nMusterfirma GmbH");
		return caseRepository.save(aCase);
	}

	private Case reload(Case aCase) {
		return caseRepository.findById(aCase.getId()).orElseThrow();
	}

	@Test
	@WithMockUser(username = "anna")
	void sendsTheReplyThreadedOntoTheCustomersMailAndWritesItDown() throws Exception {
		mailboxOnPort(greenMail.getSmtp().getPort());
		Case aCase = drafted("rechnung@musterfirma.de", "Lieferung 4711");

		mockMvc.perform(post("/api/cases/{id}/send", aCase.getId()).with(csrf()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sentAt").exists())
				.andExpect(jsonPath("$.sentByName").value("Anna Muster"))
				// Sending is taking note: the case has left the inbox.
				.andExpect(jsonPath("$.handledAt").exists())
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
		assertThat(stored.getSentAt()).isNotNull();
		assertThat(stored.getSentMessageId()).isEqualTo(sent.getMessageID());
		assertThat(stored.getHandledAt()).isNotNull();
		// One step for the click, not two: sent says it all.
		assertThat(caseEventRepository.findAllByMailCaseIdOrderByOccurredAtAsc(stored.getId()))
				.extracting(CaseEvent::getType)
				.containsExactly(CaseEventType.SENT);
	}

	@Test
	@WithMockUser(username = "anna")
	void keepsTheSubjectThatAlreadySaysReplyAndSetsNoReplyToForTheMailboxItself() throws Exception {
		mailboxOnPort(greenMail.getSmtp().getPort());
		Case aCase = drafted("inbox@frontdesk.local", "AW: Lieferung 4711");

		mockMvc.perform(post("/api/cases/{id}/send", aCase.getId()).with(csrf())).andExpect(status().isOk());

		assertThat(greenMail.waitForIncomingEmail(5000, 1)).isTrue();
		MimeMessage sent = greenMail.getReceivedMessages()[0];
		assertThat(sent.getSubject()).isEqualTo("AW: Lieferung 4711");
		// The customer wrote to the mailbox itself: nothing to redirect the answer to.
		assertThat(sent.getHeader("Reply-To")).isNull();
	}

	@Test
	@WithMockUser(username = "anna")
	void refusesWhatCannotBeSentAndSaysWhy() throws Exception {
		mailboxOnPort(greenMail.getSmtp().getPort());
		Case trashed = drafted("info@musterfirma.de", "Im Papierkorb");
		trashed.moveToTrash();
		caseRepository.save(trashed);
		Case blank = caseRepository.save(new Case(tenant, "<blank@test>", "kunde@example.com", "info@musterfirma.de",
				"Ohne Entwurf", "Hallo?", Instant.parse("2026-08-01T10:00:00Z"), false, 2048));
		Case sent = drafted("info@musterfirma.de", "Schon beantwortet");
		sent.markSent(anna, "<earlier@frontdesk.local>");
		caseRepository.save(sent);

		mockMvc.perform(post("/api/cases/{id}/send", trashed.getId()).with(csrf())).andExpect(status().isConflict());
		mockMvc.perform(post("/api/cases/{id}/send", blank.getId()).with(csrf())).andExpect(status().isConflict());
		mockMvc.perform(post("/api/cases/{id}/send", sent.getId()).with(csrf())).andExpect(status().isConflict());

		assertThat(greenMail.getReceivedMessages()).isEmpty();
		assertThat(reload(sent).getSentMessageId()).isEqualTo("<earlier@frontdesk.local>");
	}

	@Test
	@WithMockUser(username = "anna")
	void refusesToSendWithoutAMailServerToSendThrough() throws Exception {
		Case aCase = drafted("info@musterfirma.de", "Lieferung 4711");

		// No mail settings at all for this tenant.
		mockMvc.perform(post("/api/cases/{id}/send", aCase.getId()).with(csrf())).andExpect(status().isConflict());

		assertThat(reload(aCase).getSentAt()).isNull();
	}

	@Test
	@WithMockUser(username = "anna")
	void leavesTheCaseAsItWasWhenTheMailServerCannotBeReached() throws Exception {
		// Port 1: nothing listens there.
		mailboxOnPort(1);
		Case aCase = drafted("info@musterfirma.de", "Lieferung 4711");

		mockMvc.perform(post("/api/cases/{id}/send", aCase.getId()).with(csrf())).andExpect(status().isBadGateway());

		Case unchanged = reload(aCase);
		assertThat(unchanged.getSentAt()).isNull();
		assertThat(unchanged.getHandledAt()).isNull();
		assertThat(caseEventRepository.findAllByMailCaseIdOrderByOccurredAtAsc(aCase.getId())).isEmpty();
	}

	@Test
	@WithMockUser(username = "anna")
	void doesNotFindAnotherTenantsCase() throws Exception {
		Tenant other = tenantRepository.save(new Tenant("Beispiel AG"));
		Case foreign = caseRepository.save(new Case(other, "<foreign@test>", "fritz@example.com", "info@beispiel.de",
				"Fremd", "body", Instant.parse("2026-08-03T10:00:00Z"), false, 1024));

		mockMvc.perform(post("/api/cases/{id}/send", foreign.getId()).with(csrf())).andExpect(status().isNotFound());
	}
}
