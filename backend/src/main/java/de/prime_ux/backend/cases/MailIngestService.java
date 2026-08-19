package de.prime_ux.backend.cases;

import jakarta.mail.BodyPart;
import jakarta.mail.Flags;
import jakarta.mail.Folder;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.Store;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.search.FlagTerm;
import java.io.IOException;
import java.time.Instant;
import java.util.Date;
import java.util.Objects;
import java.util.Properties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Pulls unseen mails from the configured IMAP inbox and persists each one as a {@link Case}.
 *
 * <p>Processed mails are marked SEEN on the server, so every poll only touches new arrivals. A
 * mail whose Message-ID was already ingested is skipped (protects against re-ingesting when the
 * SEEN flag is lost, e.g. after a mailbox reset).
 */
@Service
public class MailIngestService {

	private static final Logger log = LoggerFactory.getLogger(MailIngestService.class);

	private final MailIngestProperties properties;
	private final CaseRepository caseRepository;

	public MailIngestService(MailIngestProperties properties, CaseRepository caseRepository) {
		this.properties = properties;
		this.caseRepository = caseRepository;
	}

	/** One poll cycle; called by the scheduler. Connection problems are logged, never thrown. */
	public void pollOnce() {
		Session session = Session.getInstance(imapSessionProperties());
		try (Store store = session.getStore("imap")) {
			store.connect(properties.host(), properties.port(), properties.username(), properties.password());
			ingestUnseenMessages(store);
		} catch (MessagingException e) {
			log.warn("Mail poll failed, will retry on the next cycle: {}", e.getMessage());
		}
	}

	private Properties imapSessionProperties() {
		Properties sessionProperties = new Properties();
		sessionProperties.put("mail.imap.connectiontimeout", "5000");
		sessionProperties.put("mail.imap.timeout", "5000");
		return sessionProperties;
	}

	private void ingestUnseenMessages(Store store) throws MessagingException {
		Folder folder = store.getFolder(properties.folder());
		folder.open(Folder.READ_WRITE);
		try {
			Message[] unseenMessages = folder.search(new FlagTerm(new Flags(Flags.Flag.SEEN), false));
			for (Message message : unseenMessages) {
				ingest((MimeMessage) message);
				message.setFlag(Flags.Flag.SEEN, true);
			}
		} finally {
			folder.close(false);
		}
	}

	private void ingest(MimeMessage message) throws MessagingException {
		String messageId = message.getMessageID();
		if (messageId != null && caseRepository.existsByMessageId(messageId)) {
			log.debug("Skipping already ingested mail {}", messageId);
			return;
		}
		Case newCase = new Case(messageId, senderOf(message), Objects.requireNonNullElse(message.getSubject(), ""),
				bodyTextOf(message), receivedAtOf(message));
		caseRepository.save(newCase);
		log.info("Ingested mail '{}' from {} as case {}", newCase.getSubject(), newCase.getSender(), newCase.getId());
	}

	private String senderOf(MimeMessage message) throws MessagingException {
		if (message.getFrom() == null || message.getFrom().length == 0) {
			return "unknown";
		}
		return ((InternetAddress) message.getFrom()[0]).getAddress();
	}

	private Instant receivedAtOf(MimeMessage message) throws MessagingException {
		Date received = message.getReceivedDate() != null ? message.getReceivedDate() : message.getSentDate();
		return received != null ? received.toInstant() : Instant.now();
	}

	private String bodyTextOf(MimeMessage message) throws MessagingException {
		try {
			return extractText(message);
		} catch (IOException e) {
			throw new MessagingException("Could not read mail body", e);
		}
	}

	/**
	 * Prefers the text/plain alternative; other text parts (e.g. HTML-only mails) are stored raw
	 * for now. Attachments are ignored.
	 */
	private String extractText(Part part) throws MessagingException, IOException {
		if (part.isMimeType("text/*")) {
			return (String) part.getContent();
		}
		if (part.isMimeType("multipart/alternative")) {
			Multipart alternatives = (Multipart) part.getContent();
			for (int i = 0; i < alternatives.getCount(); i++) {
				BodyPart alternative = alternatives.getBodyPart(i);
				if (alternative.isMimeType("text/plain")) {
					return extractText(alternative);
				}
			}
			return extractText(alternatives.getBodyPart(0));
		}
		if (part.isMimeType("multipart/*")) {
			Multipart parts = (Multipart) part.getContent();
			StringBuilder text = new StringBuilder();
			for (int i = 0; i < parts.getCount(); i++) {
				String partText = extractText(parts.getBodyPart(i));
				if (!partText.isBlank()) {
					if (!text.isEmpty()) {
						text.append('\n');
					}
					text.append(partText);
				}
			}
			return text.toString();
		}
		return "";
	}
}
