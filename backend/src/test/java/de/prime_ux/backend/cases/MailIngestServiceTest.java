package de.prime_ux.backend.cases;

import static org.assertj.core.api.Assertions.assertThat;

import com.icegreen.greenmail.user.GreenMailUser;
import com.icegreen.greenmail.util.GreenMail;
import com.icegreen.greenmail.util.GreenMailUtil;
import com.icegreen.greenmail.util.ServerSetupTest;
import de.prime_ux.backend.TestcontainersConfiguration;
import jakarta.activation.DataHandler;
import jakarta.mail.Message;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import jakarta.mail.util.ByteArrayDataSource;
import java.time.Duration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
class MailIngestServiceTest {

	// Started in a static initializer so the port is known before the Spring context
	// (and with it @DynamicPropertySource) comes up. Dynamic port avoids clashing
	// with a locally running GreenMail container.
	private static final GreenMail greenMail = new GreenMail(ServerSetupTest.IMAP.dynamicPort());

	static {
		greenMail.start();
	}

	@DynamicPropertySource
	static void mailProperties(DynamicPropertyRegistry registry) {
		registry.add("frontdesk.mail.port", () -> greenMail.getImap().getPort());
		registry.add("frontdesk.mail.polling-enabled", () -> false);
	}

	@Autowired
	private MailIngestService mailIngestService;

	@Autowired
	private CaseRepository caseRepository;

	@AfterAll
	static void stopGreenMail() {
		greenMail.stop();
	}

	@BeforeEach
	void cleanSlate() throws Exception {
		caseRepository.deleteAll();
		greenMail.purgeEmailFromAllMailboxes();
	}

	@Test
	void ingestsAnUnseenMailOnceAndOnlyOnce() {
		GreenMailUser inbox = greenMail.setUser("inbox@frontdesk.local", "inbox@frontdesk.local", "secret");
		MimeMessage mail = GreenMailUtil.createTextEmail("inbox@frontdesk.local", "kunde@example.com",
				"Wo bleibt meine Bestellung?", "Hallo, ich warte auf Bestellung 4711.",
				greenMail.getImap().getServerSetup());
		inbox.deliver(mail);

		mailIngestService.pollOnce();

		assertThat(caseRepository.findAll()).singleElement().satisfies(ingested -> {
			assertThat(ingested.getSender()).isEqualTo("kunde@example.com");
			assertThat(ingested.getSubject()).isEqualTo("Wo bleibt meine Bestellung?");
			assertThat(ingested.getBodyText()).contains("Bestellung 4711");
			assertThat(ingested.getMessageId()).isNotNull();
			assertThat(ingested.getReceivedAt()).isNotNull();
			assertThat(ingested.isHasAttachments()).isFalse();
			assertThat(ingested.getSizeBytes()).isPositive();
		});

		// The mail is now marked SEEN on the server; a second poll must not duplicate it.
		mailIngestService.pollOnce();

		assertThat(caseRepository.count()).isEqualTo(1);
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

		mailIngestService.pollOnce();

		assertThat(caseRepository.findAll()).singleElement().satisfies(ingested -> {
			assertThat(ingested.isHasAttachments()).isTrue();
			assertThat(ingested.getBodyText()).contains("Details siehe Anhang.");
			assertThat(ingested.getSizeBytes()).isPositive();
		});
	}

	@Test
	void survivesAnUnreachableMailServer() {
		MailIngestProperties unreachable = new MailIngestProperties("localhost", 1, "inbox@frontdesk.local",
				"secret", "INBOX", Duration.ofSeconds(10), false);
		MailIngestService serviceWithDeadServer = new MailIngestService(unreachable, caseRepository);

		serviceWithDeadServer.pollOnce();

		assertThat(caseRepository.count()).isZero();
	}
}
