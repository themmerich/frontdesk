package de.prime_ux.backend.cases;

import de.prime_ux.backend.mailsettings.TenantMailSettings;
import de.prime_ux.backend.users.Tenant;
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
 * Pulls unseen mails from one tenant's IMAP inbox and persists each one as a {@link Case} of
 * that tenant.
 *
 * <p>Processed mails are marked SEEN on the server, so every poll only touches new arrivals. A
 * mail whose Message-ID was already ingested for this tenant is skipped (protects against
 * re-ingesting when the SEEN flag is lost, e.g. after a mailbox reset).
 */
@Service
public class MailIngestService {

	private static final Logger log = LoggerFactory.getLogger(MailIngestService.class);

	private final CaseRepository caseRepository;

	public MailIngestService(CaseRepository caseRepository) {
		this.caseRepository = caseRepository;
	}

	/** One poll cycle for one tenant's inbox. Connection problems are logged, never thrown. */
	public void pollOnce(TenantMailSettings settings) {
		String protocol = settings.isImapTls() ? "imaps" : "imap";
		Session session = Session.getInstance(imapSessionProperties(protocol));
		try (Store store = session.getStore(protocol)) {
			store.connect(settings.getImapHost(), settings.getImapPort(), settings.getUsername(),
					settings.getPassword());
			ingestUnseenMessages(store, settings);
		} catch (MessagingException e) {
			log.warn("Mail poll for tenant '{}' failed, will retry on the next cycle: {}",
					settings.getTenant().getName(), e.getMessage());
		}
	}

	private Properties imapSessionProperties(String protocol) {
		Properties sessionProperties = new Properties();
		sessionProperties.put("mail." + protocol + ".connectiontimeout", "5000");
		sessionProperties.put("mail." + protocol + ".timeout", "5000");
		return sessionProperties;
	}

	private void ingestUnseenMessages(Store store, TenantMailSettings settings) throws MessagingException {
		Folder folder = store.getFolder(settings.getFolder());
		folder.open(Folder.READ_WRITE);
		try {
			Message[] unseenMessages = folder.search(new FlagTerm(new Flags(Flags.Flag.SEEN), false));
			for (Message message : unseenMessages) {
				ingest((MimeMessage) message, settings.getTenant());
				message.setFlag(Flags.Flag.SEEN, true);
			}
		} finally {
			folder.close(false);
		}
	}

	private void ingest(MimeMessage message, Tenant tenant) throws MessagingException {
		String messageId = message.getMessageID();
		if (messageId != null && caseRepository.existsByTenantIdAndMessageId(tenant.getId(), messageId)) {
			log.debug("Skipping already ingested mail {}", messageId);
			return;
		}
		Case newCase = new Case(tenant, messageId, senderOf(message),
				Objects.requireNonNullElse(message.getSubject(), ""), bodyTextOf(message), receivedAtOf(message),
				hasAttachments(message), sizeOf(message));
		caseRepository.save(newCase);
		log.info("Ingested mail '{}' from {} as case {}", newCase.getSubject(), newCase.getSender(), newCase.getId());
	}

	/** Raw message size in bytes as reported by the server (RFC822.SIZE); 0 if unknown. */
	private long sizeOf(MimeMessage message) throws MessagingException {
		return Math.max(message.getSize(), 0);
	}

	private boolean hasAttachments(MimeMessage message) throws MessagingException {
		try {
			return containsAttachment(message);
		} catch (IOException e) {
			throw new MessagingException("Could not inspect mail parts for attachments", e);
		}
	}

	/** A part counts as an attachment when it is marked as one or carries a file name. */
	private boolean containsAttachment(Part part) throws MessagingException, IOException {
		if (!part.isMimeType("multipart/*")) {
			return false;
		}
		Multipart parts = (Multipart) part.getContent();
		for (int i = 0; i < parts.getCount(); i++) {
			BodyPart bodyPart = parts.getBodyPart(i);
			if (Part.ATTACHMENT.equalsIgnoreCase(bodyPart.getDisposition()) || bodyPart.getFileName() != null) {
				return true;
			}
			if (containsAttachment(bodyPart)) {
				return true;
			}
		}
		return false;
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
