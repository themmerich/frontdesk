package de.prime_ux.backend.cases;

import static org.assertj.core.api.Assertions.assertThat;

import com.icegreen.greenmail.user.GreenMailUser;
import com.icegreen.greenmail.util.GreenMail;
import com.icegreen.greenmail.util.GreenMailUtil;
import com.icegreen.greenmail.util.ServerSetupTest;
import de.prime_ux.backend.TestcontainersConfiguration;
import de.prime_ux.backend.mailsettings.MailSettingsMode;
import de.prime_ux.backend.mailsettings.TenantMailSettings;
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
import jakarta.mail.util.ByteArrayDataSource;
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
	private TenantRepository tenantRepository;

	@Autowired
	private TenantLogoRepository tenantLogoRepository;

	private Tenant tenant;

	@AfterAll
	static void stopGreenMail() {
		greenMail.stop();
	}

	@BeforeEach
	void cleanSlate() throws Exception {
		caseRepository.deleteAll();
		tenantRepository.deleteAll();
		tenant = tenantRepository.save(new Tenant("Musterfirma GmbH"));
		greenMail.purgeEmailFromAllMailboxes();
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
			assertThat(ingested.getSubject()).isEqualTo("Wo bleibt meine Bestellung?");
			assertThat(ingested.getBodyText()).contains("Bestellung 4711");
			assertThat(ingested.getMessageId()).isNotNull();
			assertThat(ingested.getReceivedAt()).isNotNull();
			assertThat(ingested.isHasAttachments()).isFalse();
			assertThat(ingested.getSizeBytes()).isPositive();
		});

		// The mail is now marked SEEN on the server; a second poll must not duplicate it.
		mailIngestService.pollOnce(settingsFor(tenant, "inbox@frontdesk.local"));

		assertThat(caseRepository.count()).isEqualTo(1);
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
		assertThat(caseRepository.findAllByTenantIdOrderByReceivedAtDesc(tenant.getId())).hasSize(1);
		assertThat(caseRepository.findAllByTenantIdOrderByReceivedAtDesc(otherTenant.getId())).hasSize(1);
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

		assertThat(caseRepository.findAll()).singleElement().satisfies(ingested -> {
			assertThat(ingested.isHasAttachments()).isTrue();
			assertThat(ingested.getBodyText()).contains("Details siehe Anhang.");
			assertThat(ingested.getSizeBytes()).isPositive();
		});
	}

	@Test
	void survivesAnUnreachableMailServer() {
		TenantMailSettings unreachable = new TenantMailSettings(tenant, MailSettingsMode.CUSTOM, "localhost", 1,
				false, "localhost", 1, false, "inbox@frontdesk.local", "secret", "INBOX", true);

		mailIngestService.pollOnce(unreachable);

		assertThat(caseRepository.count()).isZero();
	}
}
