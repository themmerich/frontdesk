package de.prime_ux.backend.cases;

import static org.assertj.core.api.Assertions.assertThat;

import com.icegreen.greenmail.user.GreenMailUser;
import com.icegreen.greenmail.util.GreenMail;
import com.icegreen.greenmail.util.GreenMailUtil;
import com.icegreen.greenmail.util.ServerSetupTest;
import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.mailsettings.MailSettingsMode;
import de.prime_ux.backend.mailsettings.TenantMailSettings;
import de.prime_ux.backend.mailsettings.TenantMailSettingsRepository;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.tenants.TenantLogoRepository;
import de.prime_ux.backend.tenants.TenantRepository;
import jakarta.activation.DataHandler;
import jakarta.mail.Message;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import jakarta.mail.internet.MimeUtility;
import jakarta.mail.util.ByteArrayDataSource;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@SpringBootTest(properties = "frontdesk.mail.polling-enabled=false")
@Import(TestcontainersConfiguration.class)
class MailIngestServiceTest {

	// Started in a static initializer so the port is known early. Dynamic port
	// avoids clashing with a locally running GreenMail container.
	private static final GreenMail greenMail = new GreenMail(ServerSetupTest.IMAP.dynamicPort());

	static {
		greenMail.start();
	}

	@Autowired
	private MailIngestService mailIngestService;

	@Autowired
	private CaseRepository caseRepository;

	@Autowired
	private CaseMessageRepository caseMessageRepository;

	@Autowired
	private CaseAttachmentRepository caseAttachmentRepository;

	@Autowired
	private CaseEventRepository caseEventRepository;

	@Autowired
	private TenantRepository tenantRepository;

	@Autowired
	private TenantLogoRepository tenantLogoRepository;

	@Autowired
	private TenantMailSettingsRepository tenantMailSettingsRepository;

	private Tenant tenant;

	@AfterAll
	static void stopGreenMail() {
		greenMail.stop();
	}

	@BeforeEach
	void cleanSlate() throws Exception {
		caseAttachmentRepository.deleteAll();
		caseRepository.deleteAll();
		// Settings reference tenants and may linger from another test class sharing
		// this context's database.
		tenantMailSettingsRepository.deleteAll();
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
		greenMail.purgeEmailFromAllMailboxes();
	}

	/** The conversation of a case, as it went. */
	private List<CaseMessage> conversationOf(Case aCase) {
		return caseMessageRepository.findAllByMailCaseIdOrderByPositionAsc(aCase.getId());
	}

	/** The mail that opened a case. */
	private CaseMessage opening(Case aCase) {
		return conversationOf(aCase).getFirst();
	}

	/** Settings pointing at the embedded GreenMail's dynamic port for the given inbox. */
	private TenantMailSettings settingsFor(Tenant owner, String inboxUser) {
		return new TenantMailSettings(owner, MailSettingsMode.CUSTOM, "localhost", greenMail.getImap().getPort(),
				false, "localhost", 3025, false, inboxUser, "secret", "INBOX", true);
	}

	@Test
	void ingestsAnUnseenMailOnceAndOnlyOnceForItsTenant() {
		GreenMailUser inbox = greenMail.setUser("inbox@frontdesk.local", "inbox@frontdesk.local", "secret");
		MimeMessage mail = GreenMailUtil.createTextEmail("inbox@frontdesk.local", "kunde@example.com",
				"Wo bleibt meine Bestellung?", "Hallo, ich warte auf Bestellung 4711.",
				greenMail.getImap().getServerSetup());
		inbox.deliver(mail);

		mailIngestService.pollOnce(settingsFor(tenant, "inbox@frontdesk.local"));

		assertThat(caseRepository.findAll()).singleElement().satisfies(ingested -> {
			assertThat(ingested.getTenant().getId()).isEqualTo(tenant.getId());
			assertThat(ingested.getSender()).isEqualTo("kunde@example.com");
			assertThat(ingested.getRecipient()).isEqualTo("inbox@frontdesk.local");
			assertThat(ingested.getSubject()).isEqualTo("Wo bleibt meine Bestellung?");
			assertThat(opening(ingested).getBodyText()).contains("Bestellung 4711");
			assertThat(opening(ingested).isIncoming()).isTrue();
			assertThat(opening(ingested).getMessageId()).isEqualTo(ingested.getMessageId());
			assertThat(ingested.getMessageId()).isNotNull();
			assertThat(ingested.getReceivedAt()).isNotNull();
			assertThat(ingested.isHasAttachments()).isFalse();
			assertThat(ingested.getSizeBytes()).isPositive();
			// The first step of the case's trail, taken by nobody.
			assertThat(caseEventRepository.findAllByMailCaseIdOrderByOccurredAtAsc(ingested.getId())).singleElement()
					.satisfies(event -> {
						assertThat(event.getType()).isEqualTo(CaseEventType.INGESTED);
						assertThat(event.getActorName()).isNull();
						assertThat(event.getDetails()).contains("\"sender\":\"kunde@example.com\"");
					});
		});

		// The mail is now marked SEEN on the server; a second poll must not duplicate it.
		mailIngestService.pollOnce(settingsFor(tenant, "inbox@frontdesk.local"));

		assertThat(caseRepository.count()).isEqualTo(1);
	}

	@Test
	void keepsTheAddressTheCustomerWroteToWhenAnAliasDeliversIntoTheInbox() {
		GreenMailUser inbox = greenMail.setUser("inbox@frontdesk.local", "inbox@frontdesk.local", "secret");
		// rechnung@ is an alias: the mail lands in the one inbox but names the alias
		// in To, and that is the address the reply has to go out from.
		MimeMessage mail = GreenMailUtil.createTextEmail("rechnung@musterfirma.de", "kunde@example.com",
				"Rechnung 2026-081", "Bitte um eine Kopie.", greenMail.getImap().getServerSetup());
		inbox.deliver(mail);

		mailIngestService.pollOnce(settingsFor(tenant, "inbox@frontdesk.local"));

		assertThat(caseRepository.findAll()).singleElement()
				.extracting(Case::getRecipient)
				.isEqualTo("rechnung@musterfirma.de");
	}

	@Test
	void fallsBackToTheDeliveredToHeaderWhenTheMailNamesNoRecipient() throws Exception {
		GreenMailUser inbox = greenMail.setUser("inbox@frontdesk.local", "inbox@frontdesk.local", "secret");
		Session session = GreenMailUtil.getSession(greenMail.getImap().getServerSetup());
		MimeMessage mail = new MimeMessage(session);
		mail.setFrom("kunde@example.com");
		// A blind copy carries no To; only the delivering server knows the real target.
		mail.setHeader("Delivered-To", "buchhaltung@musterfirma.de");
		mail.setSubject("Kopie zur Kenntnis");
		mail.setText("Zur Kenntnis.");
		mail.saveChanges();
		inbox.deliver(mail);

		mailIngestService.pollOnce(settingsFor(tenant, "inbox@frontdesk.local"));

		assertThat(caseRepository.findAll()).singleElement()
				.extracting(Case::getRecipient)
				.isEqualTo("buchhaltung@musterfirma.de");
	}

	@Test
	void attributesEachInboxToItsOwnTenant() {
		Tenant otherTenant = tenantRepository.save(new Tenant("Beispiel AG"));
		GreenMailUser inboxA = greenMail.setUser("a@frontdesk.local", "a@frontdesk.local", "secret");
		GreenMailUser inboxB = greenMail.setUser("b@frontdesk.local", "b@frontdesk.local", "secret");
		// The same mail delivered to both inboxes keeps its Message-ID — each
		// tenant must still get its own case.
		MimeMessage mail = GreenMailUtil.createTextEmail("a@frontdesk.local", "kunde@example.com", "An beide",
				"Gleiche Message-ID, zwei Postfächer.", greenMail.getImap().getServerSetup());
		inboxA.deliver(mail);
		inboxB.deliver(mail);

		mailIngestService.pollOnce(settingsFor(tenant, "a@frontdesk.local"));
		mailIngestService.pollOnce(settingsFor(otherTenant, "b@frontdesk.local"));

		assertThat(caseRepository.count()).isEqualTo(2);
		assertThat(caseRepository.findAllByTenantIdOrderByLastMessageAtDesc(tenant.getId())).hasSize(1);
		assertThat(caseRepository.findAllByTenantIdOrderByLastMessageAtDesc(otherTenant.getId())).hasSize(1);
	}

	@Test
	void recognizesAMailWithAnAttachment() throws Exception {
		GreenMailUser inbox = greenMail.setUser("inbox@frontdesk.local", "inbox@frontdesk.local", "secret");
		Session session = GreenMailUtil.getSession(greenMail.getImap().getServerSetup());
		MimeMessage mail = new MimeMessage(session);
		mail.setFrom("kunde@example.com");
		mail.setRecipients(Message.RecipientType.TO, "inbox@frontdesk.local");
		mail.setSubject("Anfrage mit Anhang");
		MimeBodyPart text = new MimeBodyPart();
		text.setText("Details siehe Anhang.");
		MimeBodyPart attachment = new MimeBodyPart();
		attachment.setDataHandler(new DataHandler(new ByteArrayDataSource("pdf-content".getBytes(), "application/pdf")));
		attachment.setFileName("anfrage.pdf");
		attachment.setDisposition(Part.ATTACHMENT);
		MimeMultipart multipart = new MimeMultipart();
		multipart.addBodyPart(text);
		multipart.addBodyPart(attachment);
		mail.setContent(multipart);
		mail.saveChanges();
		inbox.deliver(mail);

		mailIngestService.pollOnce(settingsFor(tenant, "inbox@frontdesk.local"));

		Case ingested = caseRepository.findAll().getFirst();
		assertThat(ingested.isHasAttachments()).isTrue();
		assertThat(opening(ingested).getBodyText()).contains("Details siehe Anhang.");
		assertThat(ingested.getSizeBytes()).isPositive();
		// The attachment itself is kept, bytes and all, and can be told apart from the body.
		assertThat(caseAttachmentRepository.findAllByMailCaseIdOrderByPosition(ingested.getId())).singleElement()
				.satisfies(stored -> {
					assertThat(stored.getFileName()).isEqualTo("anfrage.pdf");
					assertThat(stored.getContentType()).isEqualTo("application/pdf");
					assertThat(stored.getSizeBytes()).isEqualTo("pdf-content".length());
					assertThat(stored.isInline()).isFalse();
					assertThat(stored.getContentId()).isNull();
					assertThat(caseAttachmentRepository.findByIdAndMailCaseId(stored.getId(), ingested.getId()))
							.get().extracting(CaseAttachment::getContent).isEqualTo("pdf-content".getBytes());
				});
	}

	@Test
	void keepsInlinePicturesForTheBodyAndTheRestForTheList() throws Exception {
		GreenMailUser inbox = greenMail.setUser("inbox@frontdesk.local", "inbox@frontdesk.local", "secret");
		Session session = GreenMailUtil.getSession(greenMail.getImap().getServerSetup());
		MimeMessage mail = new MimeMessage(session);
		mail.setFrom("kunde@example.com");
		mail.setRecipients(Message.RecipientType.TO, "inbox@frontdesk.local");
		mail.setSubject("Angebot mit Logo");
		// The HTML body and the logo it shows, as mail clients bundle them.
		MimeBodyPart html = new MimeBodyPart();
		html.setContent("<p>Anbei unser Angebot.</p><img src=\"cid:logo@musterkunde\">", "text/html; charset=utf-8");
		MimeBodyPart logo = new MimeBodyPart();
		logo.setDataHandler(new DataHandler(new ByteArrayDataSource("png-bytes".getBytes(), "image/png")));
		logo.setHeader("Content-ID", "<logo@musterkunde>");
		logo.setDisposition(Part.INLINE);
		MimeMultipart related = new MimeMultipart("related");
		related.addBodyPart(html);
		related.addBodyPart(logo);
		MimeBodyPart body = new MimeBodyPart();
		body.setContent(related);
		// The offer itself, with a MIME-encoded German file name.
		MimeBodyPart offer = new MimeBodyPart();
		offer.setDataHandler(new DataHandler(new ByteArrayDataSource("pdf-bytes".getBytes(), "application/pdf")));
		offer.setFileName(MimeUtility.encodeText("Angebot Frühjahr.pdf", StandardCharsets.UTF_8.name(), "Q"));
		offer.setDisposition(Part.ATTACHMENT);
		MimeMultipart mixed = new MimeMultipart("mixed");
		mixed.addBodyPart(body);
		mixed.addBodyPart(offer);
		mail.setContent(mixed);
		mail.saveChanges();
		inbox.deliver(mail);

		mailIngestService.pollOnce(settingsFor(tenant, "inbox@frontdesk.local"));

		Case ingested = caseRepository.findAll().getFirst();
		assertThat(ingested.isHasAttachments()).isTrue();
		assertThat(opening(ingested).getBodyHtml()).contains("cid:logo@musterkunde");
		List<CaseAttachmentRepository.AttachmentSummary> attachments = caseAttachmentRepository
				.findAllByMailCaseIdOrderByPosition(ingested.getId());
		// In the order of the mail: the logo stands in the body, before the offer.
		assertThat(attachments).extracting(CaseAttachmentRepository.AttachmentSummary::getFileName)
				.containsExactly("anhang-1.png", "Angebot Frühjahr.pdf");
		assertThat(attachments.get(0).getFileName()).isEqualTo("anhang-1.png");
		assertThat(attachments.get(0).getContentType()).isEqualTo("image/png");
		assertThat(attachments.get(0).getContentId()).isEqualTo("logo@musterkunde");
		assertThat(attachments.get(0).isInline()).isTrue();
		assertThat(attachments.get(1).getFileName()).isEqualTo("Angebot Frühjahr.pdf");
		assertThat(attachments.get(1).isInline()).isFalse();
		assertThat(attachments.get(1).getContentId()).isNull();
	}

	@Test
	void carriesNoPaperclipForAMailWithNothingButItsSignaturesLogo() throws Exception {
		GreenMailUser inbox = greenMail.setUser("inbox@frontdesk.local", "inbox@frontdesk.local", "secret");
		Session session = GreenMailUtil.getSession(greenMail.getImap().getServerSetup());
		MimeMessage mail = new MimeMessage(session);
		mail.setFrom("kunde@example.com");
		mail.setRecipients(Message.RecipientType.TO, "inbox@frontdesk.local");
		mail.setSubject("Kurze Frage");
		MimeBodyPart html = new MimeBodyPart();
		html.setContent("<p>Wann liefern Sie?</p><img src=\"cid:sig\">", "text/html; charset=utf-8");
		MimeBodyPart logo = new MimeBodyPart();
		logo.setDataHandler(new DataHandler(new ByteArrayDataSource("png-bytes".getBytes(), "image/png")));
		logo.setHeader("Content-ID", "<sig>");
		MimeMultipart related = new MimeMultipart("related");
		related.addBodyPart(html);
		related.addBodyPart(logo);
		mail.setContent(related);
		mail.saveChanges();
		inbox.deliver(mail);

		mailIngestService.pollOnce(settingsFor(tenant, "inbox@frontdesk.local"));

		Case ingested = caseRepository.findAll().getFirst();
		// Stored, so the body can show it — but nothing a person would open, so no paperclip.
		assertThat(ingested.isHasAttachments()).isFalse();
		assertThat(caseAttachmentRepository.findAllByMailCaseIdOrderByPosition(ingested.getId())).singleElement()
				.satisfies(attachment -> assertThat(attachment.isInline()).isTrue());
	}

	@Test
	void keepsBothVersionsOfAMailThatWasWrittenInHtmlAndInPlainText() throws Exception {
		GreenMailUser inbox = greenMail.setUser("inbox@frontdesk.local", "inbox@frontdesk.local", "secret");
		Session session = GreenMailUtil.getSession(greenMail.getImap().getServerSetup());
		MimeMessage mail = new MimeMessage(session);
		mail.setFrom("news@example.com");
		mail.setRecipients(Message.RecipientType.TO, "inbox@frontdesk.local");
		mail.setSubject("Wochenrückblick");
		MimeBodyPart text = new MimeBodyPart();
		text.setText("Branchennews der Woche.");
		MimeBodyPart html = new MimeBodyPart();
		html.setContent("<p>Branchennews der <b>Woche</b>.</p>", "text/html; charset=utf-8");
		MimeMultipart alternative = new MimeMultipart("alternative");
		alternative.addBodyPart(text);
		alternative.addBodyPart(html);
		mail.setContent(alternative);
		mail.saveChanges();
		inbox.deliver(mail);

		mailIngestService.pollOnce(settingsFor(tenant, "inbox@frontdesk.local"));

		assertThat(caseRepository.findAll()).singleElement().satisfies(ingested -> {
			// The text is what the triage reads, the HTML what the reader is shown.
			assertThat(opening(ingested).getBodyText()).isEqualTo("Branchennews der Woche.");
			assertThat(opening(ingested).getBodyHtml()).isEqualTo("<p>Branchennews der <b>Woche</b>.</p>");
		});
	}

	@Test
	void keepsTheHtmlOfAMailThatCarriesNothingElse() throws Exception {
		GreenMailUser inbox = greenMail.setUser("inbox@frontdesk.local", "inbox@frontdesk.local", "secret");
		Session session = GreenMailUtil.getSession(greenMail.getImap().getServerSetup());
		MimeMessage mail = new MimeMessage(session);
		mail.setFrom("shop@example.com");
		mail.setRecipients(Message.RecipientType.TO, "inbox@frontdesk.local");
		mail.setSubject("Angebot");
		mail.setContent("<h1>Angebot</h1>", "text/html; charset=utf-8");
		mail.saveChanges();
		inbox.deliver(mail);

		mailIngestService.pollOnce(settingsFor(tenant, "inbox@frontdesk.local"));

		assertThat(caseRepository.findAll()).singleElement()
				.satisfies(ingested -> assertThat(opening(ingested).getBodyHtml()).isEqualTo("<h1>Angebot</h1>"));
	}

	@Test
	void leavesTheHtmlEmptyForAPlainMailAndForAnAttachedWebPage() throws Exception {
		GreenMailUser inbox = greenMail.setUser("inbox@frontdesk.local", "inbox@frontdesk.local", "secret");
		Session session = GreenMailUtil.getSession(greenMail.getImap().getServerSetup());
		MimeMessage mail = new MimeMessage(session);
		mail.setFrom("kunde@example.com");
		mail.setRecipients(Message.RecipientType.TO, "inbox@frontdesk.local");
		mail.setSubject("Anfrage mit Anhang");
		MimeBodyPart text = new MimeBodyPart();
		text.setText("Details siehe Anhang.");
		MimeBodyPart attachment = new MimeBodyPart();
		attachment.setDataHandler(new DataHandler(new ByteArrayDataSource("<h1>Seite</h1>".getBytes(), "text/html")));
		attachment.setFileName("seite.html");
		attachment.setDisposition(Part.ATTACHMENT);
		MimeMultipart multipart = new MimeMultipart();
		multipart.addBodyPart(text);
		multipart.addBodyPart(attachment);
		mail.setContent(multipart);
		mail.saveChanges();
		inbox.deliver(mail);

		mailIngestService.pollOnce(settingsFor(tenant, "inbox@frontdesk.local"));

		// An attached web page is not the mail, so the case has no HTML body at all.
		assertThat(caseRepository.findAll()).singleElement()
				.satisfies(ingested -> assertThat(opening(ingested).getBodyHtml()).isNull());
	}

	/** A case answered once: the customer's mail and our reply, as the migration and the sender leave them. */
	private Case answeredCase(String subject) {
		Case aCase = caseRepository.save(new Case(tenant, "<opening@example.com>", "kunde@example.com",
				"inbox@frontdesk.local", subject, Instant.now().minusSeconds(3600), false, 2048));
		caseMessageRepository.save(CaseMessage.incoming(aCase, 0, "<opening@example.com>", "kunde@example.com",
				"inbox@frontdesk.local", subject, "Wann kommt die Lieferung?", null, aCase.getReceivedAt(), 2048));
		caseMessageRepository.save(CaseMessage.outgoing(aCase, 1, "<reply@frontdesk.local>", "inbox@frontdesk.local",
				"kunde@example.com", "Re: " + subject, "Morgen.", Instant.now().minusSeconds(1800), "Anna Muster"));
		aCase.markSent(Instant.now().minusSeconds(1800));
		return caseRepository.save(aCase);
	}

	private MimeMessage mailFrom(String sender, String subject, String text) throws Exception {
		Session session = GreenMailUtil.getSession(greenMail.getImap().getServerSetup());
		MimeMessage mail = new MimeMessage(session);
		mail.setFrom(sender);
		mail.setRecipients(Message.RecipientType.TO, "inbox@frontdesk.local");
		mail.setSubject(subject);
		mail.setText(text);
		return mail;
	}

	@Test
	void filesAReplyToOurReplyUnderTheCaseByItsHeadersAndReopensIt() throws Exception {
		GreenMailUser inbox = greenMail.setUser("inbox@frontdesk.local", "inbox@frontdesk.local", "secret");
		Case answered = answeredCase("Lieferung 4711");
		assertThat(answered.getHandledAt()).isNotNull();
		// The customer's client answers our reply: In-Reply-To names our Message-ID, the subject
		// is theirs, and a file comes along.
		MimeMessage reply = mailFrom("kunde@example.com", "Re: Lieferung 4711", "Danke, welche Sendungsnummer?");
		reply.setHeader("In-Reply-To", "<reply@frontdesk.local>");
		reply.setHeader("References", "<opening@example.com> <reply@frontdesk.local>");
		MimeBodyPart text = new MimeBodyPart();
		text.setText("Danke, welche Sendungsnummer?");
		MimeBodyPart attachment = new MimeBodyPart();
		attachment.setDataHandler(new DataHandler(new ByteArrayDataSource("pdf".getBytes(), "application/pdf")));
		attachment.setFileName("bestellung.pdf");
		attachment.setDisposition(Part.ATTACHMENT);
		MimeMultipart multipart = new MimeMultipart();
		multipart.addBodyPart(text);
		multipart.addBodyPart(attachment);
		reply.setContent(multipart);
		reply.saveChanges();
		inbox.deliver(reply);

		mailIngestService.pollOnce(settingsFor(tenant, "inbox@frontdesk.local"));

		// No new case: the mail is the third message of the conversation, with its file.
		assertThat(caseRepository.count()).isEqualTo(1);
		Case reopened = caseRepository.findById(answered.getId()).orElseThrow();
		List<CaseMessage> conversation = conversationOf(reopened);
		assertThat(conversation).hasSize(3);
		CaseMessage followUp = conversation.get(2);
		assertThat(followUp.isIncoming()).isTrue();
		assertThat(followUp.getBodyText()).contains("Sendungsnummer");
		assertThat(caseAttachmentRepository.findAllByMailCaseIdOrderByPosition(reopened.getId())).singleElement()
				.satisfies(stored -> {
					assertThat(stored.getFileName()).isEqualTo("bestellung.pdf");
					assertThat(stored.getMessageId()).isEqualTo(followUp.getId());
				});
		// Back in the inbox, with the paperclip on, the verdict untouched, and a step on the trail.
		assertThat(reopened.getHandledAt()).isNull();
		assertThat(reopened.isHasAttachments()).isTrue();
		assertThat(reopened.getLastMessageAt()).isEqualTo(followUp.getOccurredAt());
		assertThat(caseEventRepository.findAllByMailCaseIdOrderByOccurredAtAsc(reopened.getId()))
				.extracting(CaseEvent::getType).containsExactly(CaseEventType.FOLLOW_UP_RECEIVED);
	}

	@Test
	void filesAReplyWithoutHeadersBySenderAndSubject() throws Exception {
		GreenMailUser inbox = greenMail.setUser("inbox@frontdesk.local", "inbox@frontdesk.local", "secret");
		Case answered = answeredCase("Lieferung 4711");
		// A client that sets no threading headers, but the customer and the subject say enough.
		inbox.deliver(mailFrom("Kunde@Example.com", "AW: Lieferung 4711", "Noch eine Frage."));

		mailIngestService.pollOnce(settingsFor(tenant, "inbox@frontdesk.local"));

		assertThat(caseRepository.count()).isEqualTo(1);
		assertThat(conversationOf(answered)).hasSize(3);
	}

	@Test
	void opensANewCaseForAnotherSenderAnotherSubjectAnOldConversationOrOneInTheTrash() throws Exception {
		GreenMailUser inbox = greenMail.setUser("inbox@frontdesk.local", "inbox@frontdesk.local", "secret");
		Case answered = answeredCase("Lieferung 4711");
		Case trashed = caseRepository.save(new Case(tenant, "<trashed@example.com>", "kunde@example.com",
				"inbox@frontdesk.local", "Reklamation", Instant.now().minusSeconds(60), false, 1024));
		caseMessageRepository.save(CaseMessage.incoming(trashed, 0, "<trashed@example.com>", "kunde@example.com",
				"inbox@frontdesk.local", "Reklamation", "Kaputt.", null, trashed.getReceivedAt(), 1024));
		trashed.moveToTrash();
		caseRepository.save(trashed);
		Case old = caseRepository.save(new Case(tenant, "<old@example.com>", "kunde@example.com",
				"inbox@frontdesk.local", "Angebot", Instant.now().minus(MailIngestService.FOLLOW_UP_WINDOW).minusSeconds(60),
				false, 1024));
		caseMessageRepository.save(CaseMessage.incoming(old, 0, "<old@example.com>", "kunde@example.com",
				"inbox@frontdesk.local", "Angebot", "Bitte ein Angebot.", null, old.getReceivedAt(), 1024));

		// Somebody else on the same subject; the same customer on another subject; a reply to the
		// case in the trash, headers and all; and the same subject long after the last word.
		inbox.deliver(mailFrom("fritz@example.com", "Re: Lieferung 4711", "Ich auch?"));
		inbox.deliver(mailFrom("kunde@example.com", "Neue Bestellung", "Ich hätte gern noch eins."));
		MimeMessage toTrashed = mailFrom("kunde@example.com", "Re: Reklamation", "Und?");
		toTrashed.setHeader("In-Reply-To", "<trashed@example.com>");
		toTrashed.saveChanges();
		inbox.deliver(toTrashed);
		inbox.deliver(mailFrom("kunde@example.com", "Re: Angebot", "Gilt das noch?"));

		mailIngestService.pollOnce(settingsFor(tenant, "inbox@frontdesk.local"));

		// Four new cases; the three that were there kept their conversations as they were.
		assertThat(caseRepository.count()).isEqualTo(7);
		assertThat(conversationOf(answered)).hasSize(2);
		assertThat(conversationOf(trashed)).hasSize(1);
		assertThat(conversationOf(old)).hasSize(1);
	}

	@Test
	void skipsAMailWhoseMessageIdIsAlreadyPartOfAConversation() throws Exception {
		GreenMailUser inbox = greenMail.setUser("inbox@frontdesk.local", "inbox@frontdesk.local", "secret");
		Case answered = answeredCase("Lieferung 4711");
		// Our own reply, bounced back into the inbox by a copy rule: seen, not a follow-up.
		MimeMessage copy = mailFrom("inbox@frontdesk.local", "Re: Lieferung 4711", "Morgen.");
		// After saveChanges, which would otherwise mint a Message-ID of its own.
		copy.saveChanges();
		copy.setHeader("Message-ID", "<reply@frontdesk.local>");
		inbox.deliver(copy);

		mailIngestService.pollOnce(settingsFor(tenant, "inbox@frontdesk.local"));

		assertThat(caseRepository.count()).isEqualTo(1);
		assertThat(conversationOf(answered)).hasSize(2);
	}

	@Test
	void readsASubjectWithoutWhatTheClientsPutInFront() {
		assertThat(MailIngestService.normalizedSubject("Re: AW: Lieferung 4711")).isEqualTo("lieferung 4711");
		assertThat(MailIngestService.normalizedSubject("  WG:Fwd: Angebot ")).isEqualTo("angebot");
		assertThat(MailIngestService.normalizedSubject("Rechnung")).isEqualTo("rechnung");
		assertThat(MailIngestService.normalizedSubject(null)).isEmpty();
	}

	@Test
	void survivesAnUnreachableMailServer() {
		TenantMailSettings unreachable = new TenantMailSettings(tenant, MailSettingsMode.CUSTOM, "localhost", 1,
				false, "localhost", 1, false, "inbox@frontdesk.local", "secret", "INBOX", true);

		mailIngestService.pollOnce(unreachable);

		assertThat(caseRepository.count()).isZero();
	}
}
